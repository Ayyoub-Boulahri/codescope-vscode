import type { Trace } from '../../engines/types';
import type { LineMarkers } from '../../messages';
import { errorStepIndex } from './traceUtils';

/** Editor highlights for a step: the same rules as the web app's CodeEditor. */
export function stepMarkers(trace: Trace | null, currentStep: number): LineMarkers | null {
  if (!trace) return null;
  const step = trace.steps[currentStep];
  if (!step) {
    // Show a syntax error even when there are no steps.
    const line = trace.error?.line;
    return line ? { current: line, error: line, isError: true } : null;
  }
  const errIndex = errorStepIndex(trace);
  const showError = errIndex !== -1 && currentStep >= errIndex;
  return {
    current: step.line,
    next: trace.steps[currentStep + 1]?.line,
    error: showError ? (trace.steps[errIndex]?.line ?? trace.error?.line) : undefined,
    isError: showError && step.event === 'exception',
  };
}
