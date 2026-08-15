/**
 * Checkpoints at (near-)uniform arc-length intervals along the centerline,
 * and the arc-length position of a point on the track.
 *
 * Checkpoint 0 is the start/finish line (arc 0 = centerline[0]). The count is
 * round(totalLength / targetSpacing) and the actual spacing is exactly
 * totalLength / count, so every span between consecutive checkpoints —
 * including the last one back to the start line — is identical.
 *
 * Conventions: meters; arc length increases in the direction of travel
 * (centerline point order). See docs/CONVENTIONS.md.
 */

import type { Vec2 } from '../math/vec2.ts';
import { nearestSegment } from './collision.ts';
import { at, type Track } from './track.ts';

export interface Checkpoints {
  /** Number of checkpoints (≥ 1). */
  readonly count: number;
  /** Actual spacing = totalLength / count, meters. */
  readonly spacing: number;
  /** Arc length of checkpoint i, meters: arcs[i] = i · spacing. */
  readonly arcs: readonly number[];
  /** Total centerline length, meters (the arc of "checkpoint count" = the start line again). */
  readonly totalLength: number;
}

export function buildCheckpoints(track: Track, targetSpacing: number): Checkpoints {
  if (!(targetSpacing > 0)) throw new Error('checkpoint spacing must be positive');
  const L = track.totalLength;
  const count = Math.max(1, Math.round(L / targetSpacing));
  const spacing = L / count;
  const arcs: number[] = [];
  for (let i = 0; i < count; i++) arcs.push(i * spacing);
  return { count, spacing, arcs, totalLength: L };
}

export interface ArcPosition {
  /** Arc length of the projection of the point onto the centerline, in [0, totalLength). */
  readonly arc: number;
  /** Nearest segment index — pass back as `hint` next tick. */
  readonly segment: number;
}

/** Arc-length position of p along the centerline (projection onto the nearest segment). */
export function arcPosition(track: Track, p: Vec2, hint?: number): ArcPosition {
  const near = nearestSegment(track, p, hint);
  let arc = at(track.segmentStart, near.index) + near.t * at(track.segmentLengths, near.index);
  if (arc >= track.totalLength) arc -= track.totalLength; // t = 1 on the last segment
  return { arc, segment: near.index };
}

/** World point at arc length `arc` along the centerline (arc taken modulo totalLength). */
export function pointAtArc(track: Track, arc: number): Vec2 {
  const L = track.totalLength;
  let s = arc % L;
  if (s < 0) s += L;
  const n = track.centerline.length;
  // Linear scan is fine: this is used for rendering checkpoints, not in the tick loop.
  let i = 0;
  while (i + 1 < n && at(track.segmentStart, i + 1) <= s) i++;
  const a = at(track.centerline, i);
  const b = at(track.centerline, (i + 1) % n);
  const t = (s - at(track.segmentStart, i)) / at(track.segmentLengths, i);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
