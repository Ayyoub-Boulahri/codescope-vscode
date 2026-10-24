import type { HeapObject, SerializedValue, Step } from '../../engines/types';

/** Heap objects ordered by first reference (depth-first from the bottom frame), so chains read top-down. */
export function orderHeap(step: Step): HeapObject[] {
  const seen = new Set<string>();
  const out: HeapObject[] = [];
  const visit = (v: SerializedValue | string | number) => {
    if (typeof v !== 'object' || v.type !== 'ref' || seen.has(v.id)) return;
    const obj = step.heap[v.id];
    if (!obj) return;
    seen.add(v.id);
    out.push(obj);
    for (const e of obj.entries) {
      visit(e.key);
      visit(e.value);
    }
  };
  for (const frame of step.stack) {
    for (const name of frame.localsOrder) {
      const v = frame.locals[name];
      if (v) visit(v);
    }
  }
  if (step.returnValue) visit(step.returnValue);
  for (const obj of Object.values(step.heap)) if (!seen.has(obj.id)) out.push(obj);
  return out;
}
