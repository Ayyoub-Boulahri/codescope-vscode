import { useMemo } from 'react';
import { useTraceStore } from '../../store/traceStore';
import { buildHistory, changeSteps } from '../../lib/history';

/** Slider with markers: red = exception, blue = function call, yellow = selected variable changed. */
export function Timeline() {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore((s) => s.currentStep);
  const goTo = useTraceStore((s) => s.goTo);
  const selectedVar = useTraceStore((s) => s.selectedVar);

  const history = useMemo(() => (trace ? buildHistory(trace) : null), [trace]);
  const markers = useMemo(() => {
    if (!trace) return [];
    const out: Array<{ step: number; color: string }> = [];
    trace.steps.forEach((s) => {
      if (s.event === 'call') out.push({ step: s.index, color: 'bg-sky-500' });
      if (s.event === 'exception') out.push({ step: s.index, color: 'bg-rose-500' });
    });
    if (history) {
      for (const step of changeSteps(history, selectedVar)) {
        out.push({ step, color: 'bg-amber-400' });
      }
    }
    return out;
  }, [trace, history, selectedVar]);

  const max = trace ? Math.max(0, trace.steps.length - 1) : 0;
  const pct = (n: number) => (max === 0 ? 0 : (n / max) * 100);

  return (
    <div className="relative min-w-48 flex-1 pt-3 pb-1">
      <div className="pointer-events-none absolute inset-x-[7px] top-0 h-2">
        {markers.map((m, i) => (
          <span
            key={i}
            className={`absolute h-2 w-0.5 -translate-x-1/2 rounded-full ${m.color}`}
            style={{ left: `${pct(m.step)}%` }}
          />
        ))}
      </div>
      <input
        type="range"
        aria-label="Timeline"
        min={0}
        max={max}
        value={currentStep}
        disabled={!trace || trace.steps.length === 0}
        onChange={(e) => goTo(Number(e.target.value))}
        className="cs-range block w-full"
        style={{ '--fill': `${pct(currentStep)}%` } as React.CSSProperties}
      />
    </div>
  );
}
