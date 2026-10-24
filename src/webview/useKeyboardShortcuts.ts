import { useEffect } from 'react';
import { useTraceStore } from './store/traceStore';

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** → next, ← previous, Space play/pause, Home/End first/last step. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useTraceStore.getState();
      if (!s.trace) return;
      const actions: Record<string, () => void> = {
        ArrowRight: s.next,
        ArrowLeft: s.prev,
        ' ': s.togglePlay,
        Home: () => s.goTo(0),
        End: () => s.goTo(s.trace!.steps.length - 1),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
