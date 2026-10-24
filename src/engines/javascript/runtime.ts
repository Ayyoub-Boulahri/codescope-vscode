import type {
  EngineLimits,
  Frame,
  HeapObject,
  LoopState,
  RuntimeError,
  SerializedValue,
  Step,
  Trace,
} from '../types';

// The `__trace` object called by instrumented code (see instrument.ts), plus the fake console.

const MAX_DEPTH = 3;
const MAX_ITEMS = 50;
const BATCH_SIZE = 200;
const UNINITIALIZED: SerializedValue = { type: 'truncated', preview: '<uninitialized>' };

export type Getter = [string, () => unknown];

/** Thrown to unwind user code when a limit is hit. */
export class LimitError extends Error {
  constructor(readonly kind: 'steps' | 'timeout' | 'output') {
    super(`limit reached: ${kind}`);
  }
}

interface RtLoop {
  start: number;
  end: number;
  kind: LoopState['kind'];
  iteration: number;
}

interface RtFrame {
  id: string;
  name: string;
  line: number;
  getters: Getter[];
  loops: Map<number, RtLoop>;
  returnValue?: unknown;
  threw: boolean;
}

export interface TraceApi {
  line(line: number, getters: Getter[]): void;
  call(name: string, line: number, params: Getter[]): RtFrame | null;
  retval<T>(frame: RtFrame | null, value: T): T;
  ret(frame: RtFrame | null): void;
  exception(err: unknown): void;
  loopEnter(start: number, end: number, kind: LoopState['kind']): void;
  loopIter(start: number): void;
  loopExit(start: number): void;
}

export interface FakeConsole {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

// ---------------------------------------------------------------- formatting

function className(obj: object): string {
  const proto = Object.getPrototypeOf(obj) as { constructor?: { name?: string } } | null;
  return proto?.constructor?.name || 'Object';
}

/** console.log-style rendering. Top-level strings are printed raw, nested ones quoted. */
export function inspect(value: unknown, depth = 2, top = true, seen = new Set<unknown>()): string {
  if (typeof value === 'string') return top ? value : JSON.stringify(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function') {
    return Function.prototype.toString.call(value).startsWith('class')
      ? `[class ${value.name}]`
      : `[Function: ${value.name || '(anonymous)'}]`;
  }
  if (typeof value !== 'object' || value === null) return String(value);
  if (seen.has(value)) return '[Circular]';
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (depth < 0) return Array.isArray(value) ? '[Array]' : `[${className(value)}]`;
  seen.add(value);
  const inner = (v: unknown) => inspect(v, depth - 1, false, seen);
  const braces = (items: string[]) => (items.length ? `{ ${items.join(', ')} }` : '{}');
  let out: string;
  if (Array.isArray(value)) {
    out = `[${value.map(inner).join(', ')}]`;
  } else if (value instanceof Map) {
    out = `Map(${value.size}) ${braces([...value].map(([k, v]) => `${inner(k)} => ${inner(v)}`))}`;
  } else if (value instanceof Set) {
    out = `Set(${value.size}) ${braces([...value].map(inner))}`;
  } else {
    const record = value as Record<string, unknown>;
    const name = className(value);
    const items = braces(Object.keys(record).map((k) => `${k}: ${inner(record[k])}`));
    out = name === 'Object' ? items : `${name} ${items}`;
  }
  seen.delete(value);
  return out;
}

function preview(value: unknown): string {
  const s = inspect(value, 0, false);
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
}

// ---------------------------------------------------------------- runtime

export interface Runtime {
  trace: TraceApi;
  console: FakeConsole;
  prompt: (message?: string) => string | null;
  /** Runs the instrumented program (already bound to the runtime) and returns the trace. */
  run(program: () => void): Trace;
}

export function createRuntime(
  code: string,
  stdin: string,
  limits: EngineLimits,
  onBatch?: (steps: Step[], stdout: string) => void,
): Runtime {
  const steps: Step[] = [];
  const stack: RtFrame[] = [];
  const ids = new WeakMap<object, string>();
  const recordedErrors = new WeakSet<object>();
  const errorInfo = new WeakMap<object, RuntimeError>();
  const stdinLines = stdin.split('\n');
  if (stdinLines[stdinLines.length - 1] === '') stdinLines.pop();
  const deadline = performance.now() + limits.timeoutMs;

  let stdout = '';
  let nextObjectId = 1;
  let nextFrameId = 1;
  let emitted = 0;
  let limit: LimitError | null = null;
  let busy = false; // true while serializing, so getters never re-enter the tracer
  let lastPrimitiveError: { value: unknown; info: RuntimeError } | null = null;

  const stop = (kind: LimitError['kind']): never => {
    limit ??= new LimitError(kind);
    throw limit;
  };

  // -- serialization

  const objectId = (obj: object) => {
    let id = ids.get(obj);
    if (!id) {
      id = `o${nextObjectId++}`;
      ids.set(obj, id);
    }
    return id;
  };

  const serialize = (v: unknown, heap: Record<string, HeapObject>, depth = 0): SerializedValue => {
    switch (typeof v) {
      case 'undefined':
        return { type: 'undefined' };
      case 'boolean':
      case 'string':
        return { type: 'primitive', value: v };
      case 'number':
        return Number.isFinite(v)
          ? { type: 'primitive', value: v }
          : { type: 'truncated', preview: String(v) };
      case 'bigint':
        return { type: 'truncated', preview: `${v}n` };
      case 'symbol':
        return { type: 'truncated', preview: v.toString() };
      case 'function':
        return {
          type: 'function',
          name: Function.prototype.toString.call(v).startsWith('class')
            ? `class ${v.name}`
            : v.name || '(anonymous)',
        };
    }
    if (v === null) return { type: 'primitive', value: null };
    const obj = v as object;
    if (obj instanceof Date || obj instanceof RegExp || obj instanceof Promise) {
      return { type: 'truncated', preview: preview(obj) };
    }
    if (depth >= MAX_DEPTH) return { type: 'truncated', preview: preview(obj) };
    const id = objectId(obj);
    if (!heap[id]) {
      const ho: HeapObject = { id, kind: 'object', entries: [] };
      heap[id] = ho; // placeholder first: breaks cycles
      fillHeapObject(ho, obj, heap, depth + 1);
    }
    return { type: 'ref', id };
  };

  const fillHeapObject = (
    ho: HeapObject,
    obj: object,
    heap: Record<string, HeapObject>,
    depth: number,
  ) => {
    const add = (key: SerializedValue | string | number, value: SerializedValue) => {
      ho.entries.push({ key, value });
    };
    let total = 0;
    if (Array.isArray(obj)) {
      ho.kind = 'array';
      total = obj.length;
      for (let i = 0; i < Math.min(total, MAX_ITEMS); i++) add(i, serialize(obj[i], heap, depth));
    } else if (obj instanceof Map) {
      ho.kind = 'map';
      total = obj.size;
      let i = 0;
      for (const [k, val] of obj) {
        if (i++ >= MAX_ITEMS) break;
        add(serialize(k, heap, depth), serialize(val, heap, depth));
      }
    } else if (obj instanceof Set) {
      ho.kind = 'set';
      total = obj.size;
      let i = 0;
      for (const val of obj) {
        if (i >= MAX_ITEMS) break;
        add(i++, serialize(val, heap, depth));
      }
    } else {
      const name = className(obj);
      const plain =
        Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null;
      ho.kind = plain ? 'object' : 'instance';
      if (!plain) ho.className = name;
      if (obj instanceof Error) add('message', serialize(obj.message, heap, depth));
      const keys = Object.keys(obj);
      total = keys.length;
      for (const key of keys.slice(0, MAX_ITEMS)) {
        const desc = Object.getOwnPropertyDescriptor(obj, key);
        // Never call user getters while tracing.
        add(
          key,
          desc && 'value' in desc
            ? serialize(desc.value, heap, depth)
            : { type: 'truncated', preview: '(getter)' },
        );
      }
    }
    if (total > MAX_ITEMS) {
      add('…', { type: 'truncated', preview: `… ${total - MAX_ITEMS} more` });
    }
  };

  // -- steps

  const snapshotFrame = (f: RtFrame, heap: Record<string, HeapObject>): Frame => {
    const locals: Record<string, SerializedValue> = {};
    const localsOrder: string[] = [];
    for (const [name, get] of f.getters) {
      let value: SerializedValue;
      try {
        value = serialize(get(), heap);
      } catch {
        value = UNINITIALIZED; // `let`/`const` in its temporal dead zone
      }
      locals[name] = value;
      localsOrder.push(name);
    }
    return { id: f.id, name: f.name, line: f.line, locals, localsOrder };
  };

  const record = (event: Step['event'], extra: Partial<Step> = {}) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    busy = true;
    try {
      const heap: Record<string, HeapObject> = {};
      const frames = stack.map((f) => snapshotFrame(f, heap));
      const loops: LoopState[] = [];
      for (const f of stack) {
        for (const l of f.loops.values()) {
          if (l.iteration < 1) continue;
          loops.push({
            id: `${f.id}:${l.start}`,
            kind: l.kind,
            startLine: l.start,
            endLine: l.end,
            iteration: l.iteration,
          });
        }
      }
      const step: Step = {
        index: steps.length,
        line: top.line,
        event,
        stack: frames,
        heap,
        stdoutLength: stdout.length,
        loops,
        ...extra,
      };
      if (event === 'return') step.returnValue = serialize(top.returnValue, heap);
      steps.push(step);
    } finally {
      busy = false;
    }
    if (steps.length - emitted >= BATCH_SIZE) flush();
  };

  const flush = () => {
    if (steps.length > emitted) onBatch?.(steps.slice(emitted), stdout);
    emitted = steps.length;
  };

  const checkLimits = () => {
    if (limit) throw limit;
    if (steps.length >= limits.maxSteps) stop('steps');
    if (performance.now() > deadline) stop('timeout');
  };

  const write = (text: string) => {
    if (stdout.length + text.length > limits.maxOutput) {
      stdout += text.slice(0, Math.max(0, limits.maxOutput - stdout.length));
      stop('output');
    }
    stdout += text;
  };

  const errorFor = (err: unknown, line: number): RuntimeError =>
    err instanceof Error
      ? { name: err.name, message: err.message, line }
      : { name: 'Uncaught', message: inspect(err, 1, false), line };

  /** Record the exception step once, in the frame where it was thrown. */
  const recordException = (err: unknown): RuntimeError => {
    const line = stack[stack.length - 1]?.line ?? 1;
    if (typeof err === 'object' && err !== null) {
      const known = errorInfo.get(err);
      if (known) return known;
      const info = errorFor(err, line);
      errorInfo.set(err, info);
      recordedErrors.add(err);
      record('exception', { exception: info });
      return info;
    }
    if (lastPrimitiveError && lastPrimitiveError.value === err) return lastPrimitiveError.info;
    const info = errorFor(err, line);
    lastPrimitiveError = { value: err, info };
    record('exception', { exception: info });
    return info;
  };

  const trace: TraceApi = {
    line(line, getters) {
      if (busy) return;
      checkLimits();
      const top = stack[stack.length - 1];
      if (!top) return;
      top.line = line;
      top.getters = getters;
      record('line');
    },
    call(name, line, params) {
      if (busy) return null;
      checkLimits();
      const frame: RtFrame = {
        id: `f${nextFrameId++}`,
        name,
        line,
        getters: params,
        loops: new Map(),
        threw: false,
      };
      stack.push(frame);
      record('call');
      return frame;
    },
    retval(frame, value) {
      if (frame) frame.returnValue = value;
      return value;
    },
    ret(frame) {
      if (!frame || !stack.includes(frame)) return;
      // A frame left by an exception (or a limit) is not a real return.
      if (!frame.threw && !limit) {
        while (stack[stack.length - 1] !== frame) stack.pop();
        record('return');
      }
      while (stack.length && stack.pop() !== frame);
    },
    exception(err) {
      if (busy || limit || err instanceof LimitError) return;
      recordException(err);
      const top = stack[stack.length - 1];
      if (top) top.threw = true;
    },
    loopEnter(start, end, kind) {
      stack[stack.length - 1]?.loops.set(start, { start, end, kind, iteration: 0 });
    },
    loopIter(start) {
      const l = stack[stack.length - 1]?.loops.get(start);
      if (l) l.iteration++;
    },
    loopExit(start) {
      stack[stack.length - 1]?.loops.delete(start);
    },
  };

  const log = (...args: unknown[]) => {
    if (busy) return;
    write(`${args.map((a) => inspect(a)).join(' ')}\n`);
  };
  const fakeConsole: FakeConsole = { log, info: log, warn: log, error: log, debug: log };

  const prompt = (message?: string) => {
    if (message) write(String(message));
    const line = stdinLines.shift();
    if (line === undefined) {
      write('\n');
      return null;
    }
    write(`${line}\n`);
    return line;
  };

  return {
    trace,
    console: fakeConsole,
    prompt,
    run(program) {
      const result: Trace = { language: 'javascript', code, steps, stdout: '' };
      const global: RtFrame = {
        id: `f${nextFrameId++}`,
        name: '(global)',
        line: 1,
        getters: [],
        loops: new Map(),
        threw: false,
      };
      stack.push(global);
      try {
        program();
        if (!limit) record('return');
      } catch (err) {
        if (limit || err instanceof LimitError) {
          result.limitReached = (limit ?? (err as LimitError)).kind;
        } else {
          result.error = recordException(err);
        }
      }
      if (limit) result.limitReached = limit.kind;
      stack.length = 0;
      flush();
      result.stdout = stdout;
      return result;
    },
  };
}
