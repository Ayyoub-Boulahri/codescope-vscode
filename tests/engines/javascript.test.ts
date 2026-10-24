// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runJavaScriptTrace } from '../../src/engines/javascript/javascriptEngine';
import type { EngineLimits, Trace } from '../../src/engines/types';
import { buildHistory } from '../../src/webview/lib/history';

const DIR = join(__dirname, 'js');
const LIMITS: EngineLimits = { maxSteps: 300, timeoutMs: 20_000, maxOutput: 10_000 };

function run(file: string, limits = LIMITS): Trace {
  const code = readFileSync(join(DIR, file), 'utf8');
  const stdinFile = join(DIR, file.replace(/\.js$/, '.stdin'));
  const stdin = existsSync(stdinFile) ? readFileSync(stdinFile, 'utf8') : '';
  return runJavaScriptTrace(code, stdin, limits);
}

const topFrame = (trace: Trace, i: number) => {
  const step = trace.steps[i]!;
  return step.stack[step.stack.length - 1]!;
};

describe('javascript engine snapshots', () => {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
    it(file, async () => {
      await expect(JSON.stringify(run(file), null, 1)).toMatchFileSnapshot(
        `./__snapshots__/js/${file}.json`,
      );
    });
  }
});

describe('javascript engine behaviour', () => {
  it('passes the acceptance scenario (arr[4] is silently undefined)', () => {
    const trace = run('find_max.js');
    expect(trace.error).toBeUndefined();
    expect(trace.stdout).toBe('9\n');
    const iterations = new Set(trace.steps.flatMap((s) => s.loops.map((l) => l.iteration)));
    expect([...iterations]).toEqual([1, 2, 3, 4]);
    const history = buildHistory(trace);
    expect(history.get('findMax.best')?.map((e) => e.display)).toEqual(['3', '7', '9']);
    expect(history.get('findMax.i')?.map((e) => e.display)).toEqual(['1', '2', '3', '4']);
  });

  it('maps lines to the original source', () => {
    const trace = run('recursion.js');
    expect(trace.steps[0]!.line).toBe(5);
    expect(Math.max(...trace.steps.map((s) => s.stack.length))).toBe(5); // global + 4 calls
    const returns = trace.steps.filter((s) => s.event === 'return' && s.stack.length > 1);
    expect(returns.map((s) => s.returnValue)).toEqual(
      [1, 2, 6, 24].map((value) => ({ type: 'primitive', value })),
    );
  });

  it('keeps object ids stable and shows aliasing', () => {
    const trace = run('objects_arrays.js');
    const last = topFrame(trace, trace.steps.length - 1);
    expect(last.locals.point).toEqual(last.locals.alias);
    const first = trace.steps.find((s) => s.stack[0]!.locals.point?.type === 'ref')!;
    expect(first.stack[0]!.locals.point).toEqual(last.locals.point);
  });

  it('shows let variables in the TDZ as uninitialized', () => {
    const trace = run('let_tdz.js');
    const step = trace.steps.find((s) => s.line === 7)!;
    expect(step.stack[1]!.locals.label).toEqual({ type: 'truncated', preview: '<uninitialized>' });
  });

  it('reports a thrown error at the line and frame where it happened', () => {
    const trace = run('thrown_error.js');
    expect(trace.error).toEqual({ name: 'RangeError', message: 'negative: -2', line: 3 });
    const exceptions = trace.steps.filter((s) => s.event === 'exception');
    expect(exceptions).toHaveLength(2);
    expect(exceptions.every((s) => s.stack[s.stack.length - 1]!.name === 'check')).toBe(true);
    expect(trace.stdout).toBe('caught negative: -1\n');
  });

  it('stops an infinite loop at the step limit', () => {
    const trace = run('infinite_loop.js');
    expect(trace.limitReached).toBe('steps');
    expect(trace.steps).toHaveLength(LIMITS.maxSteps);
  });

  it('stops an infinite loop at the time limit', () => {
    const trace = run('infinite_loop.js', { maxSteps: 1e9, timeoutMs: 100, maxOutput: 100 });
    expect(trace.limitReached).toBe('timeout');
  });

  it('stops at the output limit', () => {
    const trace = runJavaScriptTrace('while (true) console.log("spam");', '', {
      ...LIMITS,
      maxOutput: 50,
    });
    expect(trace.limitReached).toBe('output');
    expect(trace.stdout).toHaveLength(50);
  });

  it('reports syntax errors with their line', () => {
    const trace = run('syntax_error.js');
    expect(trace.steps).toHaveLength(0);
    expect(trace.error).toMatchObject({ name: 'SyntaxError', line: 2 });
  });

  it('blocks network and worker globals', () => {
    const trace = runJavaScriptTrace(
      'console.log(typeof fetch, typeof postMessage, typeof importScripts, typeof XMLHttpRequest);',
      '',
      LIMITS,
    );
    expect(trace.stdout).toBe('undefined undefined undefined undefined\n');
  });

  it('streams batches', () => {
    const batches: number[] = [];
    runJavaScriptTrace('for (let i = 0; i < 300; i++) {\n  i;\n}', '', LIMITS, (steps) =>
      batches.push(steps.length),
    );
    expect(batches[0]).toBe(200);
  });
});
