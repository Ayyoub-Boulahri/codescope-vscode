import { useLayoutEffect, useState } from 'react';

interface Props {
  containerRef: React.RefObject<HTMLElement | null>;
  /** Changes whenever the drawing must be recomputed (e.g. current step). */
  version: unknown;
}

interface Arrow {
  key: string;
  d: string;
  x2: number;
  y2: number;
}

const ANIMATION_MS = 450;

/** SVG overlay drawing arrows from every [data-ref-src] dot to its [data-heap-id] card. */
export function Arrows({ containerRef, version }: Props) {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const compute = () => {
      const base = container.getBoundingClientRect();
      const ox = base.left - container.scrollLeft;
      const oy = base.top - container.scrollTop;
      const next: Arrow[] = [];
      container.querySelectorAll<HTMLElement>('[data-ref-src]').forEach((src, i) => {
        const id = src.dataset.refSrc!;
        const target = container.querySelector<HTMLElement>(`[data-heap-id="${CSS.escape(id)}"]`);
        if (!target || target.contains(src)) return;
        const a = src.getBoundingClientRect();
        const b = target.getBoundingClientRect();
        const x1 = a.left + a.width / 2 - ox;
        const y1 = a.top + a.height / 2 - oy;
        // Enter the target from the side facing the source.
        const fromLeft = x1 < b.left - ox;
        const x2 = (fromLeft ? b.left : b.left + 12) - ox;
        const y2 = fromLeft ? b.top + 14 - oy : b.top - oy;
        const dx = Math.max(40, Math.abs(x2 - x1) / 2);
        const d = fromLeft
          ? `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
          : `M ${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 + 40} ${y2 - 30}, ${x2} ${y2}`;
        next.push({ key: `${id}-${i}`, d, x2, y2 });
      });
      setArrows(next);
      setSize({ w: container.scrollWidth, h: container.scrollHeight });
    };

    // Follow layout animations for a moment after each change.
    let frame = 0;
    const start = performance.now();
    const tick = () => {
      compute();
      if (performance.now() - start < ANIMATION_MS) frame = requestAnimationFrame(tick);
    };
    tick();

    const observer = new ResizeObserver(compute);
    observer.observe(container);
    container.addEventListener('scroll', compute, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener('scroll', compute);
    };
  }, [containerRef, version]);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 text-cyan-500"
      width={size.w}
      height={size.h}
      aria-hidden
    >
      <defs>
        <marker id="cv-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
        </marker>
      </defs>
      {arrows.map((a) => (
        <path
          key={a.key}
          d={a.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          markerEnd="url(#cv-arrow)"
          opacity={0.8}
        />
      ))}
    </svg>
  );
}
