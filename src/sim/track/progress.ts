/**
 * Continuous, exploit-resistant progress along the track (SPEC "Track" +
 * "Fitness"): checkpoints must be crossed in order, moving forward, and the
 * fractional part between checkpoints follows the car's actual position.
 *
 * Model — an UNWRAPPED arc coordinate per car:
 *   `s` starts at the spawn arc and each tick adds the signed forward
 *   displacement of the car's centerline projection (wrapped into
 *   (−L/2, L/2], so a car cannot "jump" a half lap in one tick either way).
 *   `passed` counts checkpoint crossings; the next checkpoint's unwrapped arc
 *   is floor((passed+1)/count)·L + arcs[(passed+1) mod count], and it is
 *   crossed exactly when s reaches it. Laps = floor(passed / count).
 *
 *   progress = lastArc + clamp(s − lastArc, 0, span)
 *   where lastArc is the unwrapped arc of the last crossed checkpoint (the
 *   spawn/start line initially) and span the distance to the next one.
 *
 * Consequences (the intended fitness semantics):
 *   - driving forward: progress increases continuously and equals s;
 *   - backing up: progress can decrease within the current span, but never
 *     below lastArc, and nothing is gained — checkpoints are never un-passed
 *     and cannot be collected from the wrong side;
 *   - driving in circles: at most the checkpoints inside the circle's forward
 *     extent are passed once; afterwards progress plateaus;
 *   - completing a lap: passing the start line with all other checkpoints
 *     passed increments laps and progress continues past L.
 */

import type { Vec2 } from '../math/vec2.ts';
import { arcPosition, type Checkpoints } from './checkpoints.ts';
import { at, type Track } from './track.ts';

export interface ProgressState {
  /** Unwrapped arc coordinate of the car's centerline projection, meters. */
  readonly s: number;
  /** Total checkpoints crossed since spawn (start line at spawn not counted). */
  readonly passed: number;
  /** Continuous progress in meters (see module doc). Non-negative. */
  readonly progress: number;
  /** Nearest segment index — collision/raycast hint. */
  readonly segment: number;
}

/** Completed laps implied by `passed`. */
export function lapsOf(state: ProgressState, cps: Checkpoints): number {
  return Math.floor(state.passed / cps.count);
}

/** Index (0..count−1) of the next checkpoint to cross. */
export function nextCheckpointIndex(state: ProgressState, cps: Checkpoints): number {
  return (state.passed + 1) % cps.count;
}

/** Unwrapped arc of the k-th crossing (k = 1 is the first checkpoint after the start). */
function crossingArc(k: number, cps: Checkpoints): number {
  return Math.floor(k / cps.count) * cps.totalLength + at(cps.arcs, k % cps.count);
}

/**
 * Progress state for a car spawned at `p` (normally the start pose, arc 0).
 * The spawn point counts as "last checkpoint = start line" only if the car is
 * spawned at arc 0; otherwise the last crossed checkpoint is the one at or
 * behind the spawn arc, and progress starts at that checkpoint's arc.
 */
export function initialProgress(track: Track, cps: Checkpoints, p: Vec2, hint = 0): ProgressState {
  const { arc, segment } = arcPosition(track, p, hint);
  const passed = Math.floor(arc / cps.spacing + 1e-9); // checkpoints at or behind the spawn arc
  return computeProgress({ s: arc, passed, progress: 0, segment }, cps);
}

function computeProgress(state: ProgressState, cps: Checkpoints): ProgressState {
  const lastArc = crossingArc(state.passed, cps);
  const span = crossingArc(state.passed + 1, cps) - lastArc;
  let off = state.s - lastArc;
  if (off < 0) off = 0;
  else if (off > span) off = span;
  return { ...state, progress: lastArc + off };
}

/** Advance the progress state to the car's new position `p`. */
export function updateProgress(
  track: Track,
  cps: Checkpoints,
  prev: ProgressState,
  p: Vec2,
): ProgressState {
  const L = cps.totalLength;
  const { arc, segment } = arcPosition(track, p, prev.segment);
  // Signed forward displacement of the projection, wrapped into (−L/2, L/2].
  let prevWrapped = prev.s % L;
  if (prevWrapped < 0) prevWrapped += L;
  let delta = arc - prevWrapped;
  if (delta > L / 2) delta -= L;
  else if (delta <= -L / 2) delta += L;
  const s = prev.s + delta;
  let passed = prev.passed;
  // Cross every checkpoint reached (normally 0 or 1 per tick).
  while (s >= crossingArc(passed + 1, cps)) passed++;
  return computeProgress({ s, passed, progress: 0, segment }, cps);
}
