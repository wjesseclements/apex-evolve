/**
 * UI state (SPEC: Zustand for speed multiplier, pause, selected car, …).
 * Nothing in here is simulation state; the sim loop reads it via getState()
 * once per frame and never subscribes per tick.
 */
import { create } from 'zustand';
import type { Selection } from '../render/hitTest.ts';
import type { Speed } from './tickPlanner.ts';

export type Mode = 'evolve' | 'drive';

export interface UiState {
  readonly mode: Mode;
  readonly speed: Speed;
  readonly paused: boolean;
  readonly showSensors: boolean;
  readonly debug: boolean;
  /** Car selected in the inspector (Evolve mode), or null → the live leader is shown. */
  readonly selection: Selection | null;
  setSelection: (selection: Selection | null) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
  setSpeed: (speed: Speed) => void;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
  toggleSensors: () => void;
  toggleDebug: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  mode: 'evolve',
  speed: 1,
  paused: false,
  showSensors: true,
  debug: false,
  selection: null,
  setSelection: (selection) => set({ selection }),
  setMode: (mode) => set({ mode, selection: null }),
  toggleMode: () =>
    set((s) => ({ mode: s.mode === 'evolve' ? 'drive' : 'evolve', selection: null })),
  setSpeed: (speed) => set({ speed }),
  setPaused: (paused) => set({ paused }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleSensors: () => set((s) => ({ showSensors: !s.showSensors })),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
}));
