import type { HeapObject, SerializedValue } from '../../../engines/types';
import { formatValue } from '../../lib/history';

interface Props {
  value: SerializedValue;
  heap: Record<string, HeapObject>;
  /** Put a reference's dot after its label, at the far right, so its arrow leaves cleanly. */
  dotAtEnd?: boolean;
}

/** Inline rendering of a value. References render as a dot that Arrows.tsx connects to the heap. */
export function ValueView({ value, heap, dotAtEnd = false }: Props) {
  switch (value.type) {
    case 'ref': {
      const obj = heap[value.id];
      const dot = (
        <span
          data-ref-src={value.id}
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-500 ring-[3px] ring-cyan-500/25"
        />
      );
      const label = (
        <span className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
          {obj ? (obj.className ?? obj.kind) : 'object'}
        </span>
      );
      return dotAtEnd ? (
        <span className="flex w-full items-center gap-1.5">
          {label}
          <span className="h-px flex-1 border-t border-dashed border-cyan-500/40" />
          {dot}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          {dot}
          {label}
        </span>
      );
    }
    case 'primitive': {
      const color =
        typeof value.value === 'string'
          ? 'text-emerald-700 dark:text-emerald-400'
          : typeof value.value === 'number'
            ? 'text-sky-700 dark:text-sky-300'
            : 'text-fuchsia-700 dark:text-fuchsia-300';
      return <span className={color}>{formatValue(value, heap)}</span>;
    }
    case 'function':
      return <span className="italic text-amber-700 dark:text-amber-400">ƒ {value.name}</span>;
    case 'undefined':
      return <span className="text-faint">undefined</span>;
    case 'truncated':
      return <span className="italic text-muted">{value.preview}</span>;
  }
}
