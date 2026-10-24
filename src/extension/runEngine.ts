import { type ChildProcess, fork, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type {
  EngineLimits,
  Language,
  RunRequest,
  Step,
  Trace,
  WorkerMessage,
} from '../engines/types';

export interface EngineRequest {
  language: Language;
  code: string;
  stdin: string;
  limits: EngineLimits;
  /** Working directory of the program (the file's folder). */
  cwd: string;
  /** Absolute path of the file; JavaScript resolves require() from it. */
  fileName: string;
  pythonPath: string;
  /** Built engine entry points: dist/tracer.py and dist/jsEngine.js. */
  tracerPath: string;
  jsEnginePath: string;
}

/** What an engine process receives: the worker RunRequest plus where the file lives. */
export type ProcessRunRequest = RunRequest & { cwd: string; fileName: string };

export interface EngineRun {
  trace: Promise<Trace>;
  /** Kill the engine; `trace` then never settles. */
  cancel: () => void;
}

// DECISION: same contract as the web app's EngineManager. Engines enforce the time limit
// themselves and return a clean partial trace; the process is only killed when that soft limit
// fails (e.g. a blocking call like time.sleep), after a grace period.
const HARD_TIMEOUT_GRACE_MS = 1500;
const STDERR_TAIL = 4000;

function startEngine(req: EngineRequest, onMessage: (msg: WorkerMessage) => void): ChildProcess {
  const request: ProcessRunRequest = {
    type: 'run',
    code: req.code,
    stdin: req.stdin,
    limits: req.limits,
    cwd: req.cwd,
    fileName: req.fileName,
  };
  if (req.language === 'python') {
    const child = spawn(req.pythonPath, ['-u', req.tracerPath], {
      cwd: req.cwd,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (line) onMessage(JSON.parse(line) as WorkerMessage);
    });
    child.stdin.end(JSON.stringify(request));
    return child;
  }
  const child = fork(req.jsEnginePath, [], {
    cwd: req.cwd,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  child.on('message', (msg) => onMessage(msg as WorkerMessage));
  child.send(request);
  return child;
}

/** Run a program in a fresh engine process and collect its trace. */
export function runEngine(req: EngineRequest, onStatus?: (message: string) => void): EngineRun {
  let child: ChildProcess | undefined;
  let cancelled = false;

  const trace = new Promise<Trace>((resolve, reject) => {
    const partial: Step[] = [];
    let partialStdout = '';
    let stderr = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child?.kill();
      if (!cancelled) fn();
    };

    child = startEngine(req, (msg) => {
      switch (msg.type) {
        case 'loading':
          onStatus?.(msg.message);
          break;
        case 'ready':
          onStatus?.('Running…');
          timer = setTimeout(
            () =>
              settle(() =>
                resolve({
                  language: req.language,
                  code: req.code,
                  steps: partial,
                  stdout: partialStdout,
                  limitReached: 'timeout',
                }),
              ),
            req.limits.timeoutMs + HARD_TIMEOUT_GRACE_MS,
          );
          break;
        case 'steps':
          partial.push(...msg.steps);
          partialStdout = msg.stdout;
          break;
        case 'done':
          settle(() => resolve(msg.trace));
          break;
        case 'fatal':
          settle(() => reject(new Error(msg.message)));
          break;
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL);
    });
    child.on('error', (err: NodeJS.ErrnoException) =>
      settle(() =>
        reject(
          err.code === 'ENOENT' && req.language === 'python'
            ? new Error(
                `Python was not found at "${req.pythonPath}". Select an interpreter in the Python extension or set codescope.pythonPath.`,
              )
            : err,
        ),
      ),
    );
    child.on('close', (code) =>
      settle(() =>
        reject(new Error(stderr.trim() || `The engine stopped unexpectedly (exit code ${code}).`)),
      ),
    );
  });

  return {
    trace,
    cancel: () => {
      cancelled = true;
      child?.kill();
    },
  };
}
