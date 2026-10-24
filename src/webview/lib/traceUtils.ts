import type { LoopState, Trace } from '../../engines/types';

/** Index of the step where the final uncaught error was raised, or -1. */
export function errorStepIndex(trace: Trace): number {
  const err = trace.error;
  if (!err) return -1;
  const i = trace.steps.findIndex(
    (s) =>
      s.event === 'exception' &&
      s.exception?.name === err.name &&
      s.exception.message === err.message &&
      s.exception.line === err.line,
  );
  if (i !== -1) return i;
  const anyException = trace.steps.findIndex((s) => s.event === 'exception');
  return anyException !== -1 ? anyException : trace.steps.length - 1;
}

/** [first, last] step indices of the contiguous run of `loopId` that contains `step`. */
export function loopRun(trace: Trace, loopId: string, step: number): [number, number] {
  const has = (i: number) => trace.steps[i]?.loops.some((l) => l.id === loopId) ?? false;
  let first = step;
  let last = step;
  while (first > 0 && has(first - 1)) first--;
  while (last < trace.steps.length - 1 && has(last + 1)) last++;
  return [first, last];
}

/** Total iterations of this run of the loop, or null if it is unknown (run was cut short). */
export function loopTotal(trace: Trace, loop: LoopState, step: number): number | null {
  const [first, last] = loopRun(trace, loop.id, step);
  const cutShort = last === trace.steps.length - 1 && (trace.limitReached || trace.error);
  if (cutShort) return null;
  let max = 0;
  for (let i = first; i <= last; i++) {
    const l = trace.steps[i]!.loops.find((x) => x.id === loop.id);
    if (l && l.iteration > max) max = l.iteration;
  }
  return max;
}

/** First step of iteration `iteration` within the run of the loop containing `step`. */
export function iterationStep(
  trace: Trace,
  loopId: string,
  step: number,
  iteration: number,
): number | null {
  const [first, last] = loopRun(trace, loopId, step);
  for (let i = first; i <= last; i++) {
    const l = trace.steps[i]!.loops.find((x) => x.id === loopId);
    if (l && l.iteration === iteration) return i;
  }
  return null;
}
