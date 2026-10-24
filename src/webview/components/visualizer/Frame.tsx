import { motion } from 'framer-motion';
import type {
  Frame as FrameData,
  HeapObject,
  LoopState,
  SerializedValue,
} from '../../../engines/types';
import { useTraceStore } from '../../store/traceStore';
import { ReturnIcon } from '../ui/icons';
import { LoopBlock } from './LoopBlock';
import { ValueView } from './ValueView';
import { VariableRow } from './VariableRow';

interface Props {
  frame: FrameData;
  prevFrame?: FrameData;
  heap: Record<string, HeapObject>;
  prevHeap?: Record<string, HeapObject>;
  loops: LoopState[];
  isTop: boolean;
  isError: boolean;
  returnValue?: SerializedValue;
}

interface LoopNode {
  loop: LoopState;
  children: LoopNode[];
}

/** Nest loops by line range: an inner loop's range lies inside its outer loop's range. */
function loopTree(loops: LoopState[]): LoopNode[] {
  const sorted = [...loops].sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
  const roots: LoopNode[] = [];
  const stack: LoopNode[] = [];
  for (const loop of sorted) {
    const node = { loop, children: [] };
    while (stack.length && stack[stack.length - 1]!.loop.endLine < loop.startLine) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

function renderLoops(nodes: LoopNode[]): React.ReactNode {
  return nodes.map((n) => (
    <LoopBlock key={n.loop.id} loop={n.loop}>
      {renderLoops(n.children)}
    </LoopBlock>
  ));
}

export function Frame({
  frame,
  prevFrame,
  heap,
  prevHeap,
  loops,
  isTop,
  isError,
  returnValue,
}: Props) {
  const selectedVar = useTraceStore((s) => s.selectedVar);
  const selectVar = useTraceStore((s) => s.selectVar);

  const tone = isError
    ? 'border-rose-400 shadow-rose-500/10 dark:border-rose-500/70'
    : isTop
      ? 'border-accent shadow-[0_0_0_3px_var(--cs-accent-soft)]'
      : 'border-line opacity-70';
  const isModule = frame.name === '<module>' || frame.name === '(global)';

  return (
    <motion.div
      layout
      data-frame-id={frame.id}
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`overflow-hidden rounded-xl border bg-panel shadow-sm ${tone}`}
    >
      <div
        className={`flex items-center gap-2 border-b px-3 py-1.5 ${
          isError
            ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'
            : isTop
              ? 'border-line bg-accent-soft'
              : 'border-line bg-raised'
        }`}
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-md font-mono text-[11px] font-bold ${
            isTop ? 'bg-accent text-white' : 'bg-line text-muted'
          }`}
        >
          {isModule ? 'G' : 'ƒ'}
        </span>
        <span className="font-mono text-sm font-semibold">
          {isModule ? frame.name : `${frame.name}()`}
        </span>
        {isError ? (
          <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            error
          </span>
        ) : (
          <span className="ml-auto rounded-md bg-panel px-1.5 py-0.5 font-mono text-[11px] text-muted">
            line {frame.line}
          </span>
        )}
      </div>
      <div className="p-2">
        {frame.localsOrder.length === 0 && (
          <div className="px-1 py-1 text-xs italic text-faint">no variables</div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
          {frame.localsOrder.map((name) => {
            const value = frame.locals[name];
            if (!value) return null;
            const key = `${frame.name}.${name}`;
            return (
              <VariableRow
                key={name}
                name={name}
                value={value}
                heap={heap}
                prev={prevFrame?.locals[name]}
                prevHeap={prevHeap}
                isNew={!!prevFrame && !(name in prevFrame.locals)}
                selected={selectedVar === key}
                onSelect={() => selectVar(selectedVar === key ? null : key)}
              />
            );
          })}
        </div>
        {renderLoops(loopTree(loops))}
        {returnValue && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1.5 font-mono text-sm"
          >
            <ReturnIcon className="text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wide text-accent">
              return
            </span>
            <ValueView value={returnValue} heap={heap} />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
