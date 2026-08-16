/**
 * UI state (SPEC: Zustand for speed multiplier, pause, selected car, …).
 * Nothing in here is simulation state; the sim loop reads it via getState()
 * once per frame and never subscribes per tick.
 */
import { create } from 'zustand';
import type { Speed } from './tickPlanner.ts';

export type Mode = 'evolve' | 'drive';

export interface UiState {
  readonly mode: Mode;
  readonly speed: Speed;
  readonly paused: boolean;
  readonly showSensors: boolean;
  readonly debug: boolean;
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
  setMode: (mode) => set({ mode }),
  toggleMode: () => set((s) => ({ mode: s.mode === 'evolve' ? 'drive' : 'evolve' })),
  setSpeed: (speed) => set({ speed }),
  setPaused: (paused) => set({ paused }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleSensors: () => set((s) => ({ showSensors: !s.showSensors })),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
}));
