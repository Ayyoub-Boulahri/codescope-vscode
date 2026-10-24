// Messages between the extension host and the webview. Both sides import only types from here.
import type { Language, Trace } from './engines/types';

/** Lines to highlight in the real editor for the step the webview is showing. */
export interface LineMarkers {
  current?: number;
  next?: number;
  error?: number;
  /** The current line is the one that raised the error. */
  isError: boolean;
}

export type ToWebview =
  | { type: 'program'; fileName: string; language: Language }
  | { type: 'status'; status: 'loading' | 'running' | 'done' | 'error'; message?: string }
  | { type: 'trace'; trace: Trace | null }
  | { type: 'stale'; stale: boolean }
  /** The Python interpreter used for the run; null for JavaScript. */
  | { type: 'interpreter'; interpreter: { label: string; source: string } | null };

export type FromWebview =
  | { type: 'ready' }
  | { type: 'run' }
  | { type: 'stdin'; value: string }
  | { type: 'pickInterpreter' }
  | { type: 'markers'; markers: LineMarkers | null };
