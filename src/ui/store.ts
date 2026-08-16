/**
 * UI state (SPEC: Zustand for speed multiplier, pause, selected car, …).
 * Nothing in here is simulation state; the sim loop reads it via getState()
 * once per frame and never subscribes per tick.
 */
import { create } from 'zustand';
import type { Selection } from '../render/hitTest.ts';
import { DEFAULT_GA } from '../sim/config.ts';
import type { Genome } from '../sim/nn/network.ts';
import { isTrackId, type TrackId } from '../sim/track/tracks.ts';
import type { Speed } from './tickPlanner.ts';

/** SPEC "default seed": the run everyone sees first, and the one the tests pin. */
export const DEFAULT_SEED = 42;

/** Parse a seed typed by the user or taken from ?seed=: digits → number, else the string itself. */
export function parseSeed(text: string): number | string {
  const t = text.trim();
  if (t === '') return DEFAULT_SEED;
  return /^\d{1,10}$/.test(t) ? Number(t) : t;
}

function seedFromUrl(): number | string {
  if (typeof window === 'undefined') return DEFAULT_SEED;
  const q = new URLSearchParams(window.location.search).get('seed');
  return q === null ? DEFAULT_SEED : parseSeed(q);
}

function trackFromUrl(): TrackId {
  if (typeof window === 'undefined') return 'training';
  const q = new URLSearchParams(window.location.search).get('track');
  return q !== null && isTrackId(q) ? q : 'training';
}

/** Reflect seed + track in the address bar so a run is a shareable link. */
export function syncUrl(seed: number | string, track: TrackId): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  if (track === 'training') url.searchParams.delete('track');
  else url.searchParams.set('track', track);
  window.history.replaceState(null, '', url.toString());
}

export type Mode = 'evolve' | 'drive';

export interface UiState {
  readonly mode: Mode;
  readonly speed: Speed;
  readonly paused: boolean;
  readonly showSensors: boolean;
  readonly debug: boolean;
  /** Car selected in the inspector (Evolve mode), or null → the live leader is shown. */
  readonly selection: Selection | null;
  /** Seed for the (next) evolution run. */
  readonly seed: number | string;
  /** Live GA knobs (applied at the next breeding step of the current run and to new runs). */
  readonly mutationRate: number;
  readonly crossoverEnabled: boolean;
  /** Last import/export status line, or null. */
  readonly notice: string | null;
  /** Which track the (next) session runs on. */
  readonly trackId: TrackId;
  /** A genome to inject as car #0 when the next Evolve session is created (used by "test on the other track"). */
  readonly pendingGenome: Genome | null;
  setSelection: (selection: Selection | null) => void;
  setTrackId: (trackId: TrackId) => void;
  setPendingGenome: (genome: Genome | null) => void;
  setSeed: (seed: number | string) => void;
  setMutationRate: (rate: number) => void;
  setCrossoverEnabled: (on: boolean) => void;
  setNotice: (notice: string | null) => void;
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
  seed: seedFromUrl(),
  mutationRate: DEFAULT_GA.mutationRate,
  crossoverEnabled: DEFAULT_GA.crossoverEnabled,
  notice: null,
  trackId: trackFromUrl(),
  pendingGenome: null,
  setSelection: (selection) => set({ selection }),
  setTrackId: (trackId) => set({ trackId, selection: null }),
  setPendingGenome: (pendingGenome) => set({ pendingGenome }),
  setSeed: (seed) => set({ seed }),
  setMutationRate: (mutationRate) => set({ mutationRate }),
  setCrossoverEnabled: (crossoverEnabled) => set({ crossoverEnabled }),
  setNotice: (notice) => set({ notice }),
  setMode: (mode) => set({ mode, selection: null }),
  toggleMode: () =>
    set((s) => ({ mode: s.mode === 'evolve' ? 'drive' : 'evolve', selection: null })),
  setSpeed: (speed) => set({ speed }),
  setPaused: (paused) => set({ paused }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleSensors: () => set((s) => ({ showSensors: !s.showSensors })),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
}));
