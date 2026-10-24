import { useEffect } from 'react';
import { useTraceStore } from '../../store/traceStore';
import { SpeedSelect } from './SpeedSelect';
import { Timeline } from './Timeline';
import {
  FirstIcon,
  LastIcon,
  PauseIcon,
  PlayIcon,
  StepBackIcon,
  StepForwardIcon,
} from '../ui/icons';

const BASE_INTERVAL_MS = 700;

function ControlButton(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`flex items-center justify-center rounded-full transition disabled:opacity-30 ${
        props.primary
          ? 'h-9 w-9 bg-accent text-sm text-white shadow-sm shadow-accent/30 hover:brightness-110'
          : 'h-8 w-8 text-base text-muted hover:bg-raised hover:text-ink'
      }`}
    >
      {props.children}
    </button>
  );
}

export function PlaybackBar() {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore((s) => s.currentStep);
  const isPlaying = useTraceStore((s) => s.isPlaying);
  const speed = useTraceStore((s) => s.speed);
  const { next, prev, goTo, togglePlay } = useTraceStore.getState();

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => useTraceStore.getState().next(), BASE_INTERVAL_MS / speed);
    return () => clearInterval(id);
  }, [isPlaying, speed]);

  const total = trace?.steps.length ?? 0;
  const empty = total === 0;
  const last = Math.max(0, total - 1);

  const event = trace?.steps[currentStep]?.event;
  const eventTone: Record<string, string> = {
    call: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    return: 'bg-accent-soft text-accent',
    exception: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    line: 'bg-raised text-muted',
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <div className="flex items-center gap-0.5">
        <ControlButton
          label="First step (Home)"
          onClick={() => goTo(0)}
          disabled={empty || currentStep === 0}
        >
          <FirstIcon />
        </ControlButton>
        <ControlButton
          label="Previous step (←)"
          onClick={prev}
          disabled={empty || currentStep === 0}
        >
          <StepBackIcon />
        </ControlButton>
        <ControlButton
          label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          onClick={togglePlay}
          disabled={empty}
          primary
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon className="translate-x-px" />}
        </ControlButton>
        <ControlButton label="Next step (→)" onClick={next} disabled={empty || currentStep >= last}>
          <StepForwardIcon />
        </ControlButton>
        <ControlButton
          label="Last step (End)"
          onClick={() => goTo(last)}
          disabled={empty || currentStep >= last}
        >
          <LastIcon />
        </ControlButton>
      </div>
      <Timeline />
      <div className="flex items-center gap-2">
        {event && (
          <span
            className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${eventTone[event]}`}
          >
            {event}
          </span>
        )}
        <span
          className="min-w-24 text-right font-mono text-xs tabular-nums text-muted"
          data-testid="step-counter"
        >
          step {empty ? 0 : currentStep + 1} / {total}
        </span>
        <SpeedSelect />
      </div>
    </div>
  );
}
