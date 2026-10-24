import { create } from 'zustand';

interface SessionState {
  /** Base name of the file being visualized. */
  fileName: string;
  /** The file was edited after the trace was recorded. */
  stale: boolean;
  /** Python interpreter of the last run (shortened path and where it came from). */
  interpreter: { label: string; source: string } | null;
}

export const useSession = create<SessionState>(() => ({
  fileName: '',
  stale: false,
  interpreter: null,
}));
