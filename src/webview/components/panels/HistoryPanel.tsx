import { useMemo } from 'react';
import { splitVarKey, useTraceStore } from '../../store/traceStore';
import { buildHistory } from '../../lib/history';
import { PanelHeader } from '../ui/Panel';

/** Variable history: every value a variable had, and the step where it changed. */
export function HistoryPanel() {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore((s) => s.currentStep);
  const selectedVar = useTraceStore((s) => s.selectedVar);
  const selectVar = useTraceStore((s) => s.selectVar);
  const goTo = useTraceStore((s) => s.goTo);
  const jumpToNextChange = useTraceStore((s) => s.jumpToNextChange);

  const history = useMemo(() => (trace ? buildHistory(trace) : null), [trace]);
  const keys = useMemo(() => {
    if (!history || !trace) return [];
    const step = trace.steps[currentStep];
    // Variables visible at the current step first, then the rest.
    const visible = new Set(
      step?.stack.flatMap((f) => f.localsOrder.map((n) => `${f.name}.${n}`)) ?? [],
    );
    return [...history.keys()]
      .filter((k) => (history.get(k)?.[0]?.value.type ?? 'function') !== 'function')
      .sort((a, b) => Number(visible.has(b)) - Number(visible.has(a)));
  }, [history, trace, currentStep]);

  if (!trace || !history) {
    return (
      <div className="px-3 py-2.5 text-xs text-faint">
        Variable history appears here after a run. Click a variable to focus it.
      </div>
    );
  }

  const shown = selectedVar ? keys.filter((k) => k === selectedVar) : keys;

  return (
    <div className="flex max-h-44 flex-col" data-testid="history">
      <PanelHeader title="Variable history" dot="bg-amber-500">
        {selectedVar && (
          <>
            <button
              type="button"
              onClick={() => jumpToNextChange(selectedVar)}
              className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25"
            >
              Run to next change of {splitVarKey(selectedVar)[1]} ▸
            </button>
            <button
              type="button"
              onClick={() => selectVar(null)}
              className="text-xs text-faint hover:text-ink"
            >
              show all
            </button>
          </>
        )}
      </PanelHeader>
      <div className="overflow-auto px-3 py-2">
        {shown.length === 0 && <div className="text-xs text-faint">No variables.</div>}
        <ul className="space-y-1">
          {shown.map((key) => {
            const entries = history.get(key) ?? [];
            const [frameName, varName] = splitVarKey(key);
            return (
              <li key={key} className="flex flex-wrap items-center gap-1 font-mono text-[13px]">
                <button
                  type="button"
                  onClick={() => selectVar(selectedVar === key ? null : key)}
                  className={`mr-1 rounded-md px-1.5 py-0.5 ${
                    selectedVar === key
                      ? 'bg-amber-200 text-amber-900 dark:bg-amber-500/30 dark:text-amber-100'
                      : 'hover:bg-raised'
                  }`}
                  title={`${varName} in ${frameName}`}
                >
                  <span className="text-faint">{frameName}.</span>
                  <span className="font-semibold">{varName}</span>:
                </button>
                {entries.map((e, i) => {
                  const current =
                    e.step <= currentStep && (entries[i + 1]?.step ?? Infinity) > currentStep;
                  const past = e.step <= currentStep;
                  return (
                    <span key={e.step} className="flex items-center gap-1">
                      {i > 0 && <span className="text-faint">→</span>}
                      <button
                        type="button"
                        onClick={() => goTo(e.step)}
                        title={`step ${e.step + 1}`}
                        className={`max-w-48 truncate rounded-md border px-1.5 py-0.5 transition-colors ${
                          current
                            ? 'border-accent bg-accent text-white'
                            : past
                              ? 'border-line bg-raised hover:border-faint'
                              : 'border-dashed border-line text-faint hover:text-ink'
                        }`}
                      >
                        {e.display}
                      </button>
                    </span>
                  );
                })}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
