import { parse } from '@babel/parser';
import traverse, { type NodePath, type Scope } from '@babel/traverse';
import { generate } from '@babel/generator';
import * as t from '@babel/types';
import type { LoopState } from '../types';

// Rewrites user code so it reports every step to the `__trace` runtime (see runtime.ts):
//   __trace.line(LINE, getters)        before every statement
//   const __frame = __trace.call(...)   at function entry, try/catch/finally around the body
//   return __trace.retval(__frame, v)   for return values
//   __trace.loopEnter/loopIter/loopExit around loops
// Line numbers come from the original AST, so they always map back to the user's source.

export const TRACE = '__trace';
const FRAME = '__frame';

export class InstrumentSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = 'SyntaxError';
  }
}

type LoopNode =
  t.ForStatement | t.WhileStatement | t.DoWhileStatement | t.ForInStatement | t.ForOfStatement;

const LOOP_KIND: Record<LoopNode['type'], LoopState['kind']> = {
  ForStatement: 'for',
  WhileStatement: 'while',
  DoWhileStatement: 'do-while',
  ForInStatement: 'for-in',
  ForOfStatement: 'for-of',
};

const traceCall = (method: string, args: t.Expression[]) =>
  t.callExpression(t.memberExpression(t.identifier(TRACE), t.identifier(method)), args);

const traceStmt = (method: string, args: t.Expression[]) =>
  t.expressionStatement(traceCall(method, args));

/** `[["a", () => a], ...]`; the runtime calls each getter inside try/catch (TDZ safety). */
function gettersExpr(names: string[]): t.ArrayExpression {
  return t.arrayExpression(
    names.map((n) =>
      t.arrayExpression([t.stringLiteral(n), t.arrowFunctionExpression([], t.identifier(n))]),
    ),
  );
}

const isInternal = (name: string) => name.startsWith('__');

/** Variables of the current function visible at `position`, outermost scope first. */
function visibleNames(scope: Scope, position: number): string[] {
  const scopes: Scope[] = [];
  let s: Scope | null | undefined = scope;
  while (s) {
    scopes.unshift(s);
    if (s.path.isFunction() || s.path.isProgram()) break;
    s = s.parent;
  }
  const names: string[] = [];
  for (const sc of scopes) {
    for (const [name, binding] of Object.entries(sc.bindings)) {
      if (isInternal(name) || names.includes(name)) continue;
      const declaredBefore = (binding.identifier.start ?? 0) < position;
      if (declaredBefore || binding.kind === 'param' || binding.kind === 'hoisted') {
        names.push(name);
      }
    }
  }
  return names;
}

function keyName(key: t.Node): string {
  if (t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key) || t.isNumericLiteral(key)) return String(key.value);
  if (t.isPrivateName(key)) return `#${key.id.name}`;
  return '[computed]';
}

function functionName(path: NodePath<t.Function>): string {
  const node = path.node;
  if ((t.isFunctionDeclaration(node) || t.isFunctionExpression(node)) && node.id) {
    return node.id.name;
  }
  if (t.isClassMethod(node) || t.isClassPrivateMethod(node)) {
    const cls = path.parentPath?.parentPath?.node;
    const clsName = cls && t.isClass(cls) && cls.id ? cls.id.name : 'class';
    return `${clsName}.${keyName(node.key)}`;
  }
  if (t.isObjectMethod(node)) return keyName(node.key);
  const parent = path.parent;
  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) return parent.id.name;
  if (t.isAssignmentExpression(parent)) {
    if (t.isIdentifier(parent.left)) return parent.left.name;
    if (t.isMemberExpression(parent.left)) return keyName(parent.left.property);
  }
  if (t.isObjectProperty(parent) || t.isClassProperty(parent)) return keyName(parent.key);
  return '(anonymous)';
}

/**
 * Make every branch / loop body a block so each statement can get its own line event.
 * A body on the same line as its parent (`if (x) return;`) is added to `lined`: it gets no extra event.
 */
function ensureBlocks(path: NodePath, lined: WeakSet<t.Node>) {
  const node = path.node;
  const toBlock = (stmt: t.Statement): t.BlockStatement => {
    if (t.isBlockStatement(stmt)) return stmt;
    if (stmt.loc && stmt.loc.start.line === node.loc?.start.line) lined.add(stmt);
    return t.blockStatement([stmt]);
  };
  if (t.isIfStatement(node)) {
    node.consequent = toBlock(node.consequent);
    // `else if` becomes `else { if }` so the inner condition gets a line event.
    if (node.alternate) node.alternate = toBlock(node.alternate);
  } else if (t.isLoop(node)) {
    node.body = toBlock(node.body);
  } else if (t.isArrowFunctionExpression(node) && !t.isBlockStatement(node.body)) {
    const ret = t.returnStatement(node.body);
    ret.loc = node.body.loc;
    ret.start = node.body.start;
    node.body = t.blockStatement([ret]);
  }
}

const isTraced = (fn: t.Function) => !fn.async && !fn.generator;

export function instrument(code: string): string {
  let ast: t.File;
  try {
    ast = parse(code, { sourceType: 'script', errorRecovery: false });
  } catch (err) {
    const e = err as Error & { loc?: { line: number } };
    throw new InstrumentSyntaxError(e.message.replace(/\s*\(\d+:\d+\)$/, ''), e.loc?.line ?? 1);
  }

  const lined = new WeakSet<t.Node>();
  const wrapped = new WeakSet<t.Node>();
  const returns = new WeakSet<t.Node>();

  traverse(ast, {
    enter(path) {
      const node = path.node;
      if (!node.loc) return; // generated by us
      ensureBlocks(path, lined);

      if (path.isReturnStatement() && !returns.has(node)) {
        returns.add(node);
        const fn = path.getFunctionParent();
        if (fn && isTraced(fn.node) && path.node.argument) {
          path.node.argument = traceCall('retval', [t.identifier(FRAME), path.node.argument]);
        }
      }

      const inList =
        Array.isArray(path.container) && (path.listKey === 'body' || path.listKey === 'consequent');
      if (
        path.isStatement() &&
        inList &&
        !lined.has(node) &&
        !path.isFunctionDeclaration() &&
        !path.isEmptyStatement()
      ) {
        lined.add(node);
        const line = node.loc.start.line;
        path.insertBefore(
          traceStmt('line', [
            t.numericLiteral(line),
            gettersExpr(visibleNames(path.scope, node.start ?? 0)),
          ]),
        );
      }
    },

    exit(path) {
      const node = path.node;
      if (!node.loc || wrapped.has(node)) return;

      if (path.isFunction()) {
        wrapped.add(node);
        const fn = path.node;
        if (!isTraced(fn) || !t.isBlockStatement(fn.body)) return;
        // DECISION: async functions and generators only get line events (no frame push/pop),
        // since they suspend and resume in ways a simple call stack cannot show.
        const params = Object.entries(path.scope.bindings)
          .filter(([name, b]) => b.kind === 'param' && !isInternal(name))
          .map(([name]) => name);
        const body = fn.body;
        const err = t.identifier('__err');
        fn.body = t.blockStatement(
          [
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier(FRAME),
                traceCall('call', [
                  t.stringLiteral(functionName(path)),
                  t.numericLiteral(node.loc.start.line),
                  gettersExpr(params),
                ]),
              ),
            ]),
            t.tryStatement(
              t.blockStatement(body.body),
              t.catchClause(
                err,
                t.blockStatement([traceStmt('exception', [err]), t.throwStatement(err)]),
              ),
              t.blockStatement([traceStmt('ret', [t.identifier(FRAME)])]),
            ),
          ],
          body.directives,
        );
        return;
      }

      if (path.isLoop()) {
        wrapped.add(node);
        const loop = node as LoopNode;
        const start = t.numericLiteral(node.loc.start.line);
        (loop.body as t.BlockStatement).body.unshift(traceStmt('loopIter', [start]));
        const target = path.parentPath?.isLabeledStatement() ? path.parentPath : path;
        target.replaceWithMultiple([
          traceStmt('loopEnter', [
            start,
            t.numericLiteral(node.loc.end.line),
            t.stringLiteral(LOOP_KIND[loop.type]),
          ]),
          t.tryStatement(
            t.blockStatement([target.node as t.Statement]),
            null,
            t.blockStatement([traceStmt('loopExit', [start])]),
          ),
        ]);
      }
    },
  });

  return generate(ast).code;
}
