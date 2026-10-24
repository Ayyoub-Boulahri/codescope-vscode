import { useTraceStore } from '../../store/traceStore';
import { errorStepIndex } from '../../lib/traceUtils';
import { PanelHeader } from '../ui/Panel';
import { useSession } from '../../session';
import { ChangeInterpreterButton } from '../../Toolbar';

const LIMIT_MESSAGES = {
  steps: (n: number) => `Possible infinite loop — stopped at step ${n}.`,
  timeout: () => 'Possible infinite loop — the time limit was reached.',
  output: () => 'Output limit reached — the program printed too much.',
} as const;

export function OutputPanel() {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore((s) => s.currentStep);
  const status = useTraceStore((s) => s.status);
  const statusMessage = useTraceStore((s) => s.statusMessage);
  const interpreter = useSession((s) => s.interpreter);

  const step = trace?.steps[currentStep];
  const output = trace && step ? trace.stdout.slice(0, step.stdoutLength) : '';
  const isLast = !!trace && currentStep >= trace.steps.length - 1;

  let error: { name: string; message: string; line: number } | undefined;
  if (trace) {
    const errIndex = errorStepIndex(trace);
    if (step?.event === 'exception') error = step.exception;
    else if (trace.error && (errIndex === -1 || currentStep >= errIndex)) error = trace.error;
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Output" dot={error ? 'bg-rose-500' : 'bg-emerald-500'}>
        {status === 'error' && (
          <span className="ml-auto truncate text-xs text-rose-500">{statusMessage}</span>
        )}
      </PanelHeader>
      <pre
        data-testid="output"
        className="flex-1 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[13px] leading-relaxed"
      >
        {output}
        {error && (
          <span className="mt-1 block rounded-md border-l-2 border-rose-500 bg-rose-50 px-2 py-1 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {error.name}: {error.message} (line {error.line})
            {error.name === 'ModuleNotFoundError' && interpreter && (
              <span className="mt-1 block font-sans text-xs text-muted">
                Installed in another environment? This run used {interpreter.label}.{' '}
                <ChangeInterpreterButton />
              </span>
            )}
          </span>
        )}
        {trace?.limitReached && isLast && (
          <span className="mt-1 block rounded-md border-l-2 border-amber-500 bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            ⚠ {LIMIT_MESSAGES[trace.limitReached](trace.steps.length)}
          </span>
        )}
        {!trace && <span className="text-faint">Program output appears here.</span>}
      </pre>
    </div>
  );
}
