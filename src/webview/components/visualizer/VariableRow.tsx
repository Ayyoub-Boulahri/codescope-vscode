import { AnimatePresence, motion } from 'framer-motion';
import type { HeapObject, SerializedValue } from '../../../engines/types';
import { formatValue } from '../../lib/history';
import { ValueView } from './ValueView';

interface Props {
  name: string;
  value: SerializedValue;
  heap: Record<string, HeapObject>;
  /** Value at the previous step in the same frame; undefined if the variable is new. */
  prev?: SerializedValue;
  prevHeap?: Record<string, HeapObject>;
  isNew: boolean;
  selected: boolean;
  onSelect: () => void;
}

function typeLabel(value: SerializedValue, heap: Record<string, HeapObject>) {
  switch (value.type) {
    case 'primitive':
      if (value.pyType) return value.pyType === 'NoneType' ? 'None' : value.pyType;
      return value.value === null ? 'null' : typeof value.value;
    case 'ref': {
      const obj = heap[value.id];
      return obj ? (obj.className ?? obj.kind) : 'ref';
    }
    case 'function':
      return 'fn';
    case 'undefined':
      return 'undef';
    case 'truncated':
      return '…';
  }
}

/** One variable as a tile: name and type on top, the value below. A new value slides in. */
export function VariableRow({
  name,
  value,
  heap,
  prev,
  prevHeap,
  isNew,
  selected,
  onSelect,
}: Props) {
  const now = formatValue(value, heap);
  const before = prev ? formatValue(prev, prevHeap ?? heap) : undefined;
  const changed = isNew || (before !== undefined && before !== now);
  // Only primitives show the old value: for references the arrow already shows the change.
  const showOld = !isNew && changed && prev && prev.type !== 'ref' && value.type !== 'ref';

  const isRef = value.type === 'ref';

  const tone = isNew
    ? 'border-emerald-400/70 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10'
    : changed
      ? 'border-amber-400/80 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10'
      : 'border-line bg-raised hover:border-faint';

  return (
    <motion.button
      layout="position"
      type="button"
      onClick={onSelect}
      aria-label={`${name} = ${now}`}
      title={`${name} = ${now}\nClick to show its history`}
      initial={isNew ? { opacity: 0, scale: 0.85 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      className={`group relative flex min-w-0 flex-col ${isRef ? 'col-span-full' : ''} gap-0.5 overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition-colors ${tone} ${
        selected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-panel' : ''
      }`}
    >
      <AnimatePresence>
        {changed && (
          <motion.span
            key={now}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className={`pointer-events-none absolute inset-0 ${isNew ? 'bg-emerald-300/50' : 'bg-amber-300/50'}`}
          />
        )}
      </AnimatePresence>

      <span className="relative flex items-center gap-1.5">
        <span className="truncate font-mono text-xs font-medium text-muted">{name}</span>
        <span className="rounded bg-panel/80 px-1 text-[9px] font-medium uppercase tracking-wide text-faint">
          {typeLabel(value, heap)}
        </span>
        {changed && (
          <span
            className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${isNew ? 'bg-emerald-500' : 'bg-amber-500'}`}
            title={isNew ? 'new' : 'changed'}
          />
        )}
      </span>

      <span className="relative flex h-6 items-center gap-1.5 overflow-hidden font-mono text-[15px] font-semibold">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={now}
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -18, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={`min-w-0 ${isRef ? 'flex-1' : 'truncate'}`}
          >
            <ValueView value={value} heap={heap} dotAtEnd={isRef} />
          </motion.span>
        </AnimatePresence>
        {showOld && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="ml-auto max-w-[50%] shrink-0 truncate text-[11px] font-normal text-faint line-through decoration-rose-400/80"
            title={`was ${before}`}
          >
            {before}
          </motion.span>
        )}
      </span>
    </motion.button>
  );
}
