import type { LoopState } from '../../../engines/types';
import { useTraceStore } from '../../store/traceStore';
import { iterationStep, loopTotal } from '../../lib/traceUtils';
import { LoopIcon, StepBackIcon, StepForwardIcon } from '../ui/icons';

interface Props {
  loop: LoopState;
  children?: React.ReactNode;
}

export function LoopBlock({ loop, children }: Props) {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore((s) => s.currentStep);
  const goTo = useTraceStore((s) => s.goTo);
  if (!trace) return null;
  const total = loopTotal(trace, loop, currentStep);

  const jump = (iteration: number) => {
    const step = iterationStep(trace, loop.id, currentStep, iteration);
    if (step !== null) goTo(step);
  };
  const canPrev = loop.iteration > 1;
  const canNext = total === null ? true : loop.iteration < total;

  const pager =
    'flex h-5 w-5 items-center justify-center rounded-md text-violet-700 hover:bg-violet-200/70 disabled:opacity-30 dark:text-violet-300 dark:hover:bg-violet-500/20';

  return (
    <div className="mt-2 rounded-lg border border-violet-300 bg-violet-50/70 p-2 dark:border-violet-500/30 dark:bg-violet-500/[0.07]">
      <div className="flex items-center gap-1.5 text-xs text-violet-700 dark:text-violet-300">
        <LoopIcon className="shrink-0" />
        <span className="font-semibold">{loop.kind} loop</span>
        <span className="font-mono text-[11px] text-violet-500/80">
          L{loop.startLine}–{loop.endLine}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => jump(loop.iteration - 1)}
            className={pager}
            title="Previous iteration"
          >
            <StepBackIcon />
          </button>
          <span className="rounded-md bg-violet-600 px-2 py-0.5 font-mono text-[11px] font-medium text-white dark:bg-violet-500">
            iteration {loop.iteration} / {total ?? '?'}
          </span>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => jump(loop.iteration + 1)}
            className={pager}
            title="Next iteration"
          >
            <StepForwardIcon />
          </button>
        </span>
      </div>
      <IterationTrack current={loop.iteration} total={total} onJump={jump} />
      {children}
    </div>
  );
}

const MAX_TICKS = 24;

/** One tick per iteration when there are few, otherwise a progress bar. */
function IterationTrack(props: {
  current: number;
  total: number | null;
  onJump: (iteration: number) => void;
}) {
  const { current, total, onJump } = props;
  if (total !== null && total <= MAX_TICKS) {
    return (
      <div className="mt-1.5 flex gap-0.5">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            tabIndex={-1}
            onClick={() => onJump(n)}
            title={`Iteration ${n}`}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              n === current
                ? 'bg-violet-600 dark:bg-violet-400'
                : n < current
                  ? 'bg-violet-300 dark:bg-violet-500/50'
                  : 'bg-violet-200/60 hover:bg-violet-300 dark:bg-violet-500/15'
            }`}
          />
        ))}
      </div>
    );
  }
  const pct = total ? (current / total) * 100 : 100;
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-200/60 dark:bg-violet-500/15">
      <div
        className={`h-full rounded-full bg-violet-500 transition-[width] duration-300 ${total ? '' : 'animate-pulse opacity-60'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
