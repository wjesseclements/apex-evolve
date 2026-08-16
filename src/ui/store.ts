/**
 * UI state (SPEC: Zustand for speed multiplier, pause, selected car, …).
 * Nothing in here is simulation state; the sim loop reads it via getState()
 * once per frame and never subscribes per tick.
 */
import { create } from 'zustand';
import type { Selection } from '../render/hitTest.ts';
import { BENCHMARK, DEFAULT_GA } from '../sim/config.ts';
import type { Genome } from '../sim/nn/network.ts';
import { isTrackId, type TrackId } from '../sim/track/tracks.ts';
import type { Speed } from './tickPlanner.ts';

/** SPEC "default seed": the run everyone sees first AND the pinned honesty benchmark — one number. */
export const DEFAULT_SEED: number = BENCHMARK.seed;

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

function crossoverFromUrl(): boolean {
  if (typeof window === 'undefined') return DEFAULT_GA.crossoverEnabled;
  const q = new URLSearchParams(window.location.search).get('crossover');
  return q === null ? DEFAULT_GA.crossoverEnabled : q === '1' || q === 'on' || q === 'true';
}

function trackFromUrl(): TrackId {
  if (typeof window === 'undefined') return 'training';
  const q = new URLSearchParams(window.location.search).get('track');
  return q !== null && isTrackId(q) ? q : 'training';
}

/** Reflect seed + track (+ crossover) in the address bar so a run is a shareable link. */
export function syncUrl(seed: number | string, track: TrackId, crossover?: boolean): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  if (track === 'training') url.searchParams.delete('track');
  else url.searchParams.set('track', track);
  if (crossover !== undefined) {
    if (crossover) url.searchParams.set('crossover', '1');
    else url.searchParams.delete('crossover');
  }
  window.history.replaceState(null, '', url.toString());
}

/** Landing speed: fast enough that the seed-42 plateau (gens 10–59) passes in ~30–40 s of wall clock. */
export const LANDING_SPEED: Speed = 16;

export type Mode = 'evolve' | 'drive';

export interface UiState {
  readonly mode: Mode;
  readonly speed: Speed;
  /** True once the visitor has chosen a speed themselves (disables auto-slow). */
  readonly speedTouched: boolean;
  /** True once this run has auto-slowed to 1× on its first lap. Reset on restart. */
  readonly autoSlowed: boolean;
  /** Transient message shown over the canvas (auto-slow explanation, …). */
  readonly toast: string | null;
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
  /** Manual speed choice: disables auto-slow for the rest of the visit. */
  setSpeed: (speed: Speed) => void;
  /** Auto-slow to 1× (once per run, only if the speed is untouched). */
  autoSlow: (toast: string) => void;
  /** New run: allow auto-slow again; restore the landing speed if untouched. */
  onRunRestarted: () => void;
  setToast: (toast: string | null) => void;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
  toggleSensors: () => void;
  toggleDebug: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  mode: 'evolve',
  speed: LANDING_SPEED,
  speedTouched: false,
  autoSlowed: false,
  toast: null,
  paused: false,
  showSensors: true,
  debug: false,
  selection: null,
  seed: seedFromUrl(),
  mutationRate: DEFAULT_GA.mutationRate,
  crossoverEnabled: crossoverFromUrl(),
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
  setSpeed: (speed) => set({ speed, speedTouched: true }),
  autoSlow: (toast) =>
    set((s) => (s.speedTouched || s.autoSlowed ? {} : { speed: 1, autoSlowed: true, toast })),
  onRunRestarted: () =>
    set((s) => ({
      autoSlowed: false,
      toast: null,
      speed: s.speedTouched ? s.speed : LANDING_SPEED,
    })),
  setToast: (toast) => set({ toast }),
  setPaused: (paused) => set({ paused }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleSensors: () => set((s) => ({ showSensors: !s.showSensors })),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
}));
