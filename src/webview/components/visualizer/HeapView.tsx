import { AnimatePresence, motion } from 'framer-motion';
import type { HeapObject, Step } from '../../../engines/types';
import { formatValue } from '../../lib/history';
import { orderHeap } from '../../lib/heapOrder';
import { ValueView } from './ValueView';

interface Props {
  step: Step;
  prevStep?: Step;
}

const SEQUENCE = new Set(['list', 'array', 'tuple']);

function HeapCard({ obj, step, prev }: { obj: HeapObject; step: Step; prev?: HeapObject }) {
  const label = obj.className ?? obj.kind;
  const sequence = SEQUENCE.has(obj.kind);
  const changedAt = (i: number) => {
    if (!prev) return false;
    const before = prev.entries[i];
    const now = obj.entries[i];
    if (!before || !now) return true;
    return formatValue(before.value, {}, 0) !== formatValue(now.value, {}, 0);
  };

  return (
    <motion.div
      layout
      data-heap-id={obj.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="w-fit max-w-full overflow-hidden rounded-xl border border-cyan-300/80 bg-panel shadow-sm dark:border-cyan-500/40"
    >
      <div className="flex items-center gap-2 border-b border-cyan-200/80 bg-cyan-50 px-2.5 py-1 dark:border-cyan-500/20 dark:bg-cyan-500/10">
        <span className="font-mono text-xs font-semibold text-cyan-800 dark:text-cyan-200">
          {label}
        </span>
        <span className="ml-auto font-mono text-[10px] text-cyan-600/80 dark:text-cyan-300/60">
          {sequence
            ? `len ${obj.entries.length}`
            : `${obj.entries.length} ${obj.entries.length === 1 ? 'entry' : 'entries'}`}
        </span>
      </div>
      <div className="p-2">
        {obj.entries.length === 0 && <div className="px-1 text-xs italic text-faint">empty</div>}
        {sequence ? (
          <div className="flex flex-wrap">
            {obj.entries.map((e, i) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className={`-ml-px flex h-8 min-w-9 items-center justify-center border px-2 font-mono text-sm transition-colors ${
                    changedAt(i)
                      ? 'relative z-10 border-amber-400 bg-amber-100 dark:bg-amber-500/20'
                      : 'border-line bg-raised'
                  } ${i === 0 ? 'ml-0 rounded-l-md' : ''} ${i === obj.entries.length - 1 ? 'rounded-r-md' : ''}`}
                >
                  <ValueView value={e.value} heap={step.heap} />
                </div>
                <span className="mt-0.5 font-mono text-[10px] text-faint">{i}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[auto_1fr] overflow-hidden rounded-md border border-line font-mono text-sm">
            {obj.entries.map((e, i) => {
              const hl = changedAt(i) ? 'bg-amber-100 dark:bg-amber-500/20' : '';
              const edge = i === obj.entries.length - 1 ? '' : 'border-b';
              return (
                <div key={i} className="contents">
                  {obj.kind !== 'set' && (
                    <div
                      className={`${edge} border-r border-line px-2 py-0.5 text-muted ${hl || 'bg-raised'}`}
                    >
                      {typeof e.key === 'object' ? (
                        <ValueView value={e.key} heap={step.heap} />
                      ) : (
                        String(e.key)
                      )}
                    </div>
                  )}
                  <div
                    className={`${edge} border-line px-2 py-0.5 ${obj.kind === 'set' ? 'col-span-2' : ''} ${hl}`}
                  >
                    <ValueView value={e.value} heap={step.heap} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function HeapView({ step, prevStep }: Props) {
  const objects = orderHeap(step);
  if (objects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-faint">
        No objects yet
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3">
      <AnimatePresence initial={false}>
        {objects.map((obj) => (
          <HeapCard key={obj.id} obj={obj} step={step} prev={prevStep?.heap[obj.id]} />
        ))}
      </AnimatePresence>
    </div>
  );
}
