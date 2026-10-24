import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineLimits, Trace, WorkerMessage } from '../../src/engines/types';
import { buildHistory } from '../../src/webview/lib/history';
import { errorStepIndex } from '../../src/webview/lib/traceUtils';

// Runs the tracer CLI with the local interpreter, like the extension does.
const PYTHON = process.env.PYTHON ?? 'python3';
const TRACER = join(__dirname, '../../src/engines/python/tracer.py');
const DIR = join(__dirname, 'python');
const LIMITS: EngineLimits = { maxSteps: 300, timeoutMs: 20_000, maxOutput: 10_000 };
// The snapshots are shared with the web app, which runs Python 3.14 (Pyodide). Other versions
// word some error messages differently, so only the behaviour tests run on them.
const VERSION = execFileSync(PYTHON, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], {
  encoding: 'utf8',
}).trim();

function runCode(code: string, stdin = '', limits = LIMITS): WorkerMessage[] {
  const out = execFileSync(PYTHON, [TRACER], {
    input: JSON.stringify({ type: 'run', code, stdin, limits }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as WorkerMessage);
}

function traceOf(messages: WorkerMessage[]): Trace {
  const done = messages.find((m) => m.type === 'done');
  if (!done) throw new Error('no done message');
  return done.trace;
}

function run(file: string, limits = LIMITS): Trace {
  const code = readFileSync(join(DIR, file), 'utf8');
  const stdinFile = join(DIR, file.replace(/\.py$/, '.stdin'));
  const stdin = existsSync(stdinFile) ? readFileSync(stdinFile, 'utf8') : '';
  return traceOf(runCode(code, stdin, limits));
}

describe.runIf(VERSION === '3.14')('python engine snapshots', () => {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.py'))) {
    it(file, async () => {
      await expect(JSON.stringify(run(file), null, 1)).toMatchFileSnapshot(
        `./__snapshots__/python/${file}.json`,
      );
    });
  }
});

describe('python engine behaviour', () => {
  it('passes the acceptance scenario', () => {
    const trace = run('find_max.py');
    expect(trace.error).toEqual({
      name: 'IndexError',
      message: 'list index out of range',
      line: 4,
    });
    const errStep = trace.steps[errorStepIndex(trace)]!;
    const frame = errStep.stack[errStep.stack.length - 1]!;
    expect(frame.name).toBe('find_max');
    expect(frame.locals.i).toMatchObject({ value: 4 });
    expect(errStep.loops[0]?.iteration).toBe(4);
    expect(
      buildHistory(trace)
        .get('find_max.best')
        ?.map((e) => e.display),
    ).toEqual(['3', '7', '9']);
  });

  it('stops an infinite loop at the step limit', () => {
    const trace = run('infinite_loop.py');
    expect(trace.limitReached).toBe('steps');
    expect(trace.steps).toHaveLength(LIMITS.maxSteps);
  });

  it('stops at the output limit', () => {
    const trace = traceOf(
      runCode('while True:\n    print("spam")\n', '', { ...LIMITS, maxOutput: 50 }),
    );
    expect(trace.limitReached).toBe('output');
    expect(trace.stdout).toHaveLength(50);
  });

  it('reports syntax errors with their line', () => {
    const trace = run('syntax_error.py');
    expect(trace.steps).toHaveLength(0);
    expect(trace.error).toMatchObject({ name: 'SyntaxError', line: 1 });
  });

  it('speaks the worker protocol: ready, step batches, done', () => {
    const messages = runCode('for i in range(300):\n    pass\n');
    expect(messages[0]?.type).toBe('ready');
    expect(messages.at(-1)?.type).toBe('done');
    const streamed = messages.flatMap((m) => (m.type === 'steps' ? m.steps : []));
    expect(streamed.map((s) => s.index)).toEqual(traceOf(messages).steps.map((s) => s.index));
  });

  it('keeps program output out of the protocol stream', () => {
    const trace = traceOf(runCode('print("{\\"type\\": \\"fake\\"}")\nprint("é ✓")\n'));
    expect(trace.stdout).toBe('{"type": "fake"}\né ✓\n');
  });
});
