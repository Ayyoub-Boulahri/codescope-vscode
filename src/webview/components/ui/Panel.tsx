interface PanelProps {
  className?: string;
  children: React.ReactNode;
}

/** Rounded surface that every pane of the app sits in. */
export function Panel({ className = '', children }: PanelProps) {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}

interface HeaderProps {
  title: React.ReactNode;
  /** Small colored dot before the title. */
  dot?: string;
  htmlFor?: string;
  children?: React.ReactNode;
}

export function PanelHeader({ title, dot, htmlFor, children }: HeaderProps) {
  const Title = htmlFor ? 'label' : 'span';
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      <Title
        htmlFor={htmlFor}
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
      >
        {title}
      </Title>
      {children}
    </div>
  );
}
