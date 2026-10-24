import { AnimatePresence } from 'framer-motion';
import type { Step } from '../../../engines/types';
import { Frame } from './Frame';

interface Props {
  step: Step;
  prevStep?: Step;
  isError: boolean;
}

/** Stack frames, top of the stack first. */
export function CallStack({ step, prevStep, isError }: Props) {
  const frames = [...step.stack].reverse();
  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false} mode="popLayout">
        {frames.map((frame, i) => {
          const isTop = i === 0;
          return (
            <Frame
              key={frame.id}
              frame={frame}
              prevFrame={prevStep?.stack.find((f) => f.id === frame.id)}
              heap={step.heap}
              prevHeap={prevStep?.heap}
              loops={step.loops.filter((l) => l.id.startsWith(`${frame.id}:`))}
              isTop={isTop}
              isError={isTop && isError}
              returnValue={isTop && step.event === 'return' ? step.returnValue : undefined}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
