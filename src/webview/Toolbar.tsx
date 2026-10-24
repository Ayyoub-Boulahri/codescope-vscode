import { post } from './bridge';
import { LogoMark, PlayIcon } from './components/ui/icons';
import { useSession } from './session';
import { useTraceStore } from './store/traceStore';

const LANGUAGE_NAMES = { python: 'Python', javascript: 'JavaScript' } as const;

export function Toolbar() {
  const fileName = useSession((s) => s.fileName);
  const stale = useSession((s) => s.stale);
  const interpreter = useSession((s) => s.interpreter);
  const language = useTraceStore((s) => s.language);
  const status = useTraceStore((s) => s.status);
  const busy = status === 'loading' || status === 'running';

  return (
    <header className="flex flex-col gap-1 px-1">
      <div className="flex min-w-0 items-center gap-2">
        <LogoMark className="shrink-0 text-xl" />
        <span className="truncate font-mono text-[13px] font-medium" title={fileName}>
          {fileName || 'CodeScope'}
        </span>
        <span className="shrink-0 rounded-md bg-raised px-1.5 py-0.5 text-[11px] font-medium text-muted">
          {LANGUAGE_NAMES[language]}
        </span>
        {stale && (
          <span className="truncate text-xs text-amber-700 dark:text-amber-300">
            File changed since this run
          </span>
        )}
        <button
          type="button"
          onClick={() => post({ type: 'run' })}
          disabled={busy}
          className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          <PlayIcon className="text-[10px]" />
          {busy ? 'Running…' : stale ? 'Run again' : 'Run'}
        </button>
      </div>
      {language === 'python' && interpreter && <InterpreterRow interpreter={interpreter} />}
    </header>
  );
}

function InterpreterRow({ interpreter }: { interpreter: { label: string; source: string } }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
      <span className="shrink-0">Interpreter</span>
      <code
        className="truncate font-mono text-ink"
        title={`${interpreter.label} (from ${interpreter.source})`}
      >
        {interpreter.label}
      </code>
      <ChangeInterpreterButton />
    </div>
  );
}

export function ChangeInterpreterButton() {
  return (
    <button
      type="button"
      onClick={() => post({ type: 'pickInterpreter' })}
      className="shrink-0 font-medium text-accent hover:underline"
    >
      Change
    </button>
  );
}
