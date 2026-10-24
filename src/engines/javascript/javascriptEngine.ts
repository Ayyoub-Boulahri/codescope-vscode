import type { EngineLimits, Step, Trace } from '../types';
import { InstrumentSyntaxError, TRACE, instrument } from './instrument';
import { createRuntime } from './runtime';

// Globals shadowed by parameters so user code cannot reach them (they are passed `undefined`).
const BLOCKED = [
  'fetch',
  'importScripts',
  'XMLHttpRequest',
  'WebSocket',
  'postMessage',
  'close',
  'self',
  'globalThis',
];

/** Instrument and run `code`, returning its trace. Batches are streamed via onBatch. */
export function runJavaScriptTrace(
  code: string,
  stdin: string,
  limits: EngineLimits,
  onBatch?: (steps: Step[], stdout: string) => void,
): Trace {
  const syntaxError = (message: string, line: number): Trace => ({
    language: 'javascript',
    code,
    steps: [],
    stdout: '',
    error: { name: 'SyntaxError', message, line },
  });

  let instrumented: string;
  try {
    instrumented = instrument(code);
  } catch (err) {
    if (err instanceof InstrumentSyntaxError) return syntaxError(err.message, err.line);
    throw err;
  }

  let program: (...args: unknown[]) => void;
  try {
    program = new Function(TRACE, 'console', 'prompt', ...BLOCKED, instrumented) as typeof program;
  } catch (err) {
    return syntaxError(err instanceof Error ? err.message : String(err), 1);
  }

  const runtime = createRuntime(code, stdin, limits, onBatch);
  return runtime.run(() => program(runtime.trace, runtime.console, runtime.prompt));
}
