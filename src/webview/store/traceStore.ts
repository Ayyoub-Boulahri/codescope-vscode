import { create } from 'zustand';
import type { Language, Trace } from '../../engines/types';
import { buildHistory } from '../lib/history';

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export type RunStatus = 'idle' | 'loading' | 'running' | 'done' | 'error';

interface TraceState {
  language: Language;
  code: string;
  stdin: string;
  trace: Trace | null;
  status: RunStatus;
  statusMessage: string;
  currentStep: number;
  isPlaying: boolean;
  speed: Speed;
  selectedVar: string | null; // `${frameName}.${varName}`

  setLanguage: (language: Language) => void;
  setCode: (code: string) => void;
  setStdin: (stdin: string) => void;
  setStatus: (status: RunStatus, message?: string) => void;
  loadTrace: (trace: Trace | null) => void;
  next: () => void;
  prev: () => void;
  goTo: (n: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: Speed) => void;
  selectVar: (key: string | null) => void;
  jumpToNextChange: (key: string) => void;
}

const lastIndex = (trace: Trace | null) => (trace ? Math.max(0, trace.steps.length - 1) : 0);

export const useTraceStore = create<TraceState>((set, get) => ({
  language: 'python',
  code: '',
  stdin: '',
  trace: null,
  status: 'idle',
  statusMessage: '',
  currentStep: 0,
  isPlaying: false,
  speed: 1,
  selectedVar: null,

  setLanguage: (language) => set({ language, trace: null, currentStep: 0, isPlaying: false }),
  setCode: (code) => set({ code }),
  setStdin: (stdin) => set({ stdin }),
  setStatus: (status, statusMessage = '') => set({ status, statusMessage }),
  loadTrace: (trace) => set({ trace, currentStep: 0, isPlaying: false, selectedVar: null }),

  next: () => {
    const { currentStep, trace } = get();
    const last = lastIndex(trace);
    if (currentStep >= last) set({ isPlaying: false });
    else set({ currentStep: currentStep + 1 });
  },
  prev: () => set((s) => ({ currentStep: Math.max(0, s.currentStep - 1) })),
  goTo: (n) => set((s) => ({ currentStep: Math.min(Math.max(0, n), lastIndex(s.trace)) })),
  play: () => {
    const { trace, currentStep } = get();
    if (!trace || trace.steps.length === 0) return;
    // Restart from the beginning when playing from the last step.
    if (currentStep >= lastIndex(trace)) set({ currentStep: 0 });
    set({ isPlaying: true });
  },
  pause: () => set({ isPlaying: false }),
  togglePlay: () => (get().isPlaying ? get().pause() : get().play()),
  setSpeed: (speed) => set({ speed }),
  selectVar: (selectedVar) => set({ selectedVar }),

  jumpToNextChange: (key) => {
    const { trace, currentStep } = get();
    if (!trace) return;
    const entry = buildHistory(trace)
      .get(key)
      ?.find((e) => e.step > currentStep);
    if (entry) set({ currentStep: entry.step, isPlaying: false });
  },
}));

export function splitVarKey(key: string): [string, string] {
  const dot = key.lastIndexOf('.');
  return [key.slice(0, dot), key.slice(dot + 1)];
}
