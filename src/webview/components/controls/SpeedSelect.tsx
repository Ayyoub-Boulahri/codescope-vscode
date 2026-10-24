import { SPEEDS, type Speed, useTraceStore } from '../../store/traceStore';

export function SpeedSelect() {
  const speed = useTraceStore((s) => s.speed);
  const setSpeed = useTraceStore((s) => s.setSpeed);
  return (
    <label className="flex items-center">
      <span className="sr-only">speed</span>
      <select
        aria-label="Playback speed"
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value) as Speed)}
        className="h-7 rounded-lg border border-line bg-raised px-1.5 font-mono text-xs text-ink outline-none hover:border-faint"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
    </label>
  );
}
