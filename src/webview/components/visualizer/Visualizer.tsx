import { useRef } from 'react';
import { useTraceStore } from '../../store/traceStore';
import { errorStepIndex } from '../../lib/traceUtils';
import { Arrows } from './Arrows';
import { CallStack } from './CallStack';
import { HeapView } from './HeapView';
import { LogoMark } from '../ui/icons';

function SectionTitle(props: { dot: string; count: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${props.dot}`} />
      {props.children}
      <span className="rounded-full bg-raised px-1.5 font-mono text-[10px] font-medium normal-case tracking-normal text-faint">
        {props.count}
      </span>
    </h2>
  );
}

export function Visualizer() {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore((s) => s.currentStep);
  const status = useTraceStore((s) => s.status);
  const statusMessage = useTraceStore((s) => s.statusMessage);
  const containerRef = useRef<HTMLDivElement>(null);

  const step = trace?.steps[currentStep];
  const busy = status === 'loading' || status === 'running';
  if (!trace || !step) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        {busy ? (
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-accent" />
        ) : (
          <LogoMark className={`text-4xl ${trace?.error ? 'opacity-40 grayscale' : ''}`} />
        )}
        <p className="max-w-xs text-sm text-muted">
          {busy
            ? statusMessage || 'Running…'
            : trace?.error
              ? 'The program did not start: see the error in the output panel.'
              : 'Press Run to trace the file and watch it step by step.'}
        </p>
      </div>
    );
  }

  const errIndex = errorStepIndex(trace);
  const isError = step.event === 'exception' || (errIndex !== -1 && currentStep >= errIndex);
  const prevStep = currentStep > 0 ? trace.steps[currentStep - 1] : undefined;

  return (
    <div ref={containerRef} className="relative h-full overflow-auto">
      <div className="grid min-h-full grid-cols-1 gap-6 p-4 sm:grid-cols-[minmax(240px,1.2fr)_minmax(180px,1fr)] sm:gap-10">
        <section>
          <SectionTitle dot="bg-accent" count={step.stack.length}>
            Call stack
          </SectionTitle>
          <CallStack step={step} prevStep={prevStep} isError={isError} />
        </section>
        <section>
          <SectionTitle dot="bg-cyan-500" count={Object.keys(step.heap).length}>
            Heap
          </SectionTitle>
          <HeapView step={step} prevStep={prevStep} />
        </section>
      </div>
      <Arrows containerRef={containerRef} version={`${currentStep}-${trace.steps.length}`} />
    </div>
  );
}
