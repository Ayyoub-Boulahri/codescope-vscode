// The trace format: the single contract between language engines and the UI.
// The UI must only depend on these types, never on a specific language.

export type Language = 'python' | 'javascript';

export interface Trace {
  language: Language;
  code: string;
  steps: Step[];
  stdout: string; // full output
  error?: RuntimeError; // final uncaught error, if any
  limitReached?: 'steps' | 'timeout' | 'output';
}

export interface Step {
  index: number;
  line: number; // 1-based line about to run / just run
  event: 'line' | 'call' | 'return' | 'exception';
  stack: Frame[]; // bottom → top
  heap: Record<string, HeapObject>; // id → object
  stdoutLength: number; // stdout.slice(0, stdoutLength) = output so far
  loops: LoopState[]; // active loops at this step
  returnValue?: SerializedValue; // when event === 'return'
  exception?: RuntimeError; // when event === 'exception'
}

export interface Frame {
  id: string; // unique per call
  name: string; // function name or '<module>'
  line: number;
  locals: Record<string, SerializedValue>;
  localsOrder: string[]; // keep declaration order for stable UI
}

export interface LoopState {
  id: string; // `${frameId}:${loopStartLine}`
  kind: 'for' | 'while' | 'do-while' | 'for-in' | 'for-of';
  startLine: number;
  endLine: number;
  iteration: number; // 1-based
}

export type SerializedValue =
  | { type: 'primitive'; value: string | number | boolean | null; pyType?: string }
  | { type: 'undefined' }
  | { type: 'ref'; id: string } // points into heap
  | { type: 'function'; name: string }
  | { type: 'truncated'; preview: string };

export interface HeapObject {
  id: string;
  kind: 'list' | 'tuple' | 'dict' | 'set' | 'object' | 'array' | 'map' | 'instance';
  className?: string;
  entries: Array<{ key: SerializedValue | string | number; value: SerializedValue }>;
}

export interface RuntimeError {
  name: string; // e.g. 'IndexError', 'TypeError'
  message: string;
  line: number;
}

// ---- Limits (§4) ----

export interface EngineLimits {
  maxSteps: number;
  timeoutMs: number;
  maxOutput: number; // characters
}

export const DEFAULT_LIMITS: EngineLimits = {
  maxSteps: 5000,
  timeoutMs: 5000,
  maxOutput: 100 * 1024,
};

// ---- Worker messages ----

export interface RunRequest {
  type: 'run';
  code: string;
  stdin: string;
  limits: EngineLimits;
}

export type WorkerMessage =
  | { type: 'loading'; message: string }
  | { type: 'ready' }
  | { type: 'steps'; steps: Step[]; stdout: string } // streamed batches
  | { type: 'done'; trace: Trace }
  | { type: 'fatal'; message: string };
