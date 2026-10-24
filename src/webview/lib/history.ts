import type { HeapObject, SerializedValue, Trace } from '../../engines/types';

export interface HistoryEntry {
  step: number;
  value: SerializedValue;
  /** Text rendering of the value at that step (refs are expanded, so mutations show up). */
  display: string;
}

/** Key = `${frameName}.${varName}` */
export type VariableHistory = Map<string, HistoryEntry[]>;

export function valuesEqual(a: SerializedValue | undefined, b: SerializedValue | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function formatValue(
  value: SerializedValue,
  heap: Record<string, HeapObject> = {},
  depth = 2,
): string {
  switch (value.type) {
    case 'primitive':
      if (typeof value.value === 'string') return JSON.stringify(value.value);
      if (value.value === null) return value.pyType === 'NoneType' ? 'None' : 'null';
      if (typeof value.value === 'boolean' && value.pyType === 'bool')
        return value.value ? 'True' : 'False';
      return String(value.value);
    case 'undefined':
      return 'undefined';
    case 'function':
      return `ƒ ${value.name}`;
    case 'truncated':
      return value.preview;
    case 'ref': {
      const obj = heap[value.id];
      if (!obj) return '…';
      if (depth <= 0) return obj.className ?? obj.kind;
      return formatHeapObject(obj, heap, depth - 1);
    }
  }
}

const BRACKETS: Record<HeapObject['kind'], [string, string]> = {
  list: ['[', ']'],
  array: ['[', ']'],
  tuple: ['(', ')'],
  set: ['{', '}'],
  dict: ['{', '}'],
  map: ['Map {', '}'],
  object: ['{', '}'],
  instance: ['{', '}'],
};

function formatKey(key: SerializedValue | string | number, heap: Record<string, HeapObject>) {
  return typeof key === 'object' ? formatValue(key, heap, 0) : String(key);
}

export function formatHeapObject(
  obj: HeapObject,
  heap: Record<string, HeapObject>,
  depth = 1,
): string {
  const [open, close] = BRACKETS[obj.kind];
  const sequence = obj.kind === 'list' || obj.kind === 'array' || obj.kind === 'tuple';
  const items = obj.entries.map((e) =>
    sequence || obj.kind === 'set'
      ? formatValue(e.value, heap, depth)
      : `${formatKey(e.key, heap)}: ${formatValue(e.value, heap, depth)}`,
  );
  const prefix = obj.kind === 'instance' && obj.className ? `${obj.className} ` : '';
  return `${prefix}${open}${items.join(', ')}${close}`;
}

/**
 * Per-variable history: only the steps where the (rendered) value changed.
 * Values are compared by their rendering so in-place mutations of lists/objects count as changes.
 */
export function buildHistory(trace: Trace): VariableHistory {
  const history: VariableHistory = new Map();
  for (const step of trace.steps) {
    for (const frame of step.stack) {
      for (const name of frame.localsOrder) {
        const value = frame.locals[name];
        if (!value) continue;
        const key = `${frame.name}.${name}`;
        const display = formatValue(value, step.heap);
        let entries = history.get(key);
        if (!entries) {
          entries = [];
          history.set(key, entries);
        }
        const last = entries[entries.length - 1];
        if (!last || last.display !== display) {
          entries.push({ step: step.index, value, display });
        }
      }
    }
  }
  return history;
}

/** Step indices where the given variable changed (for timeline markers). */
export function changeSteps(history: VariableHistory, key: string | null): number[] {
  if (!key) return [];
  return (history.get(key) ?? []).map((e) => e.step);
}
