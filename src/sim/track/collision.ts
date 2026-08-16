/**
 * Track containment and car collision.
 *
 * Design note (Slice 0 → Slice 2): the inside-track test is LOCALIZED. Rather
 * than a point-in-polygon over the whole ring, we find the centerline segment
 * nearest the query point — searching only a small window around a caller-
 * supplied hint (the segment found last tick) — and then test the point
 * against that segment's drivable quad and its two neighbours. Because the
 * per-segment quads tile the ring exactly (see track.ts), this is exact, and
 * O(window) instead of O(n) per query once a hint is available.
 *
 * Conventions: meters, +y down, see docs/CONVENTIONS.md.
 */

import type { PhysicsConfig } from '../config.ts';
import { at, segmentCount, wrapIndex, type Track } from './track.ts';
import type { Vec2 } from '../math/vec2.ts';
import { carCorners, type CarState } from '../physics/car.ts';

/** How many segments either side of the hint to search before falling back to a full scan. */
export const NEAREST_SEGMENT_WINDOW = 3;

export interface NearestSegment {
  /** Index of the nearest centerline segment. */
  readonly index: number;
  /** Parameter t ∈ [0, 1] of the closest point along that segment. */
  readonly t: number;
  /** Squared distance from the query point to that closest point. */
  readonly distSq: number;
}

/**
 * Squared distance from p to segment i and the closest-point parameter t.
 * Exported for tests; hot-loop callers use nearestSegment.
 */
export function pointSegmentDistSq(
  track: Track,
  i: number,
  p: Vec2,
): { t: number; distSq: number } {
  const n = segmentCount(track);
  const a = at(track.centerline, i);
  const b = at(track.centerline, (i + 1) % n);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq === 0 ? 0 : (apx * abx + apy * aby) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  return { t, distSq: dx * dx + dy * dy };
}

/**
 * Find the centerline segment nearest to p.
 *
 * With `hint` (the index found for this object on the previous tick) only
 * segments within ±NEAREST_SEGMENT_WINDOW of the hint are examined. If the best
 * candidate lies on the edge of that window the object may have moved
 * further than expected (e.g. it was reset), so we fall back to a full scan
 * to stay exact. Without a hint, all segments are scanned.
 */
export function nearestSegment(track: Track, p: Vec2, hint?: number): NearestSegment {
  const n = segmentCount(track);
  if (hint !== undefined && n > 2 * NEAREST_SEGMENT_WINDOW + 1) {
    let best = scanRange(track, p, hint - NEAREST_SEGMENT_WINDOW, hint + NEAREST_SEGMENT_WINDOW);
    const offset = wrapIndex(best.index - hint + NEAREST_SEGMENT_WINDOW, n);
    if (offset === 0 || offset === 2 * NEAREST_SEGMENT_WINDOW) {
      best = scanRange(track, p, 0, n - 1);
    }
    return best;
  }
  return scanRange(track, p, 0, n - 1);
}

function scanRange(track: Track, p: Vec2, from: number, to: number): NearestSegment {
  const n = segmentCount(track);
  let bestIndex = wrapIndex(from, n);
  let bestT = 0;
  let bestDistSq = Infinity;
  for (let k = from; k <= to; k++) {
    const i = wrapIndex(k, n);
    const { t, distSq } = pointSegmentDistSq(track, i, p);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
      bestT = t;
    }
  }
  return { index: bestIndex, t: bestT, distSq: bestDistSq };
}

/**
 * Is p inside the drivable quad owned by segment i? The quad is
 * [L[i], L[i+1], R[i+1], R[i]]; it is convex for any well-formed track, so p is
 * inside iff it lies on the same side of all four edges (boundary counts as
 * inside, so a car exactly touching the wall is not yet dead).
 */
export function pointInSegmentQuad(track: Track, i: number, p: Vec2): boolean {
  const n = segmentCount(track);
  const j = (i + 1) % n;
  const q0 = at(track.leftEdge, i);
  const q1 = at(track.leftEdge, j);
  const q2 = at(track.rightEdge, j);
  const q3 = at(track.rightEdge, i);
  const s0 = side(q0, q1, p);
  const s1 = side(q1, q2, p);
  const s2 = side(q2, q3, p);
  const s3 = side(q3, q0, p);
  // A point exactly on an edge has a cross product of ±1e-15 rather than 0; without
  // the tolerance a point on the boundary shared by two quads could be rejected by
  // BOTH (found by the held-out track sweep test). ON_EDGE_EPS is in m² (cross
  // product units) — 1e-9 m² is far below any physical scale here.
  const allNonNeg =
    s0 >= -ON_EDGE_EPS && s1 >= -ON_EDGE_EPS && s2 >= -ON_EDGE_EPS && s3 >= -ON_EDGE_EPS;
  const allNonPos =
    s0 <= ON_EDGE_EPS && s1 <= ON_EDGE_EPS && s2 <= ON_EDGE_EPS && s3 <= ON_EDGE_EPS;
  return allNonNeg || allNonPos;
}

/** Tolerance for "on the quad edge" (m²). */
const ON_EDGE_EPS = 1e-9;

/** Cross product sign of (b − a) × (p − a): which side of line ab the point p is on. */
function side(a: Vec2, b: Vec2, p: Vec2): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

export interface InsideResult {
  readonly inside: boolean;
  /** Nearest segment index — pass back as `hint` next tick. */
  readonly segment: number;
}

/**
 * Is p on the track surface? Exact with respect to the rendered edges.
 * Checks the nearest segment's quad and its two neighbours (a point in the
 * ring always lies in one of those three; see the design note above).
 */
export function isInsideTrack(track: Track, p: Vec2, hint?: number): InsideResult {
  const n = segmentCount(track);
  const { index } = nearestSegment(track, p, hint);
  const inside =
    pointInSegmentQuad(track, index, p) ||
    pointInSegmentQuad(track, wrapIndex(index - 1, n), p) ||
    pointInSegmentQuad(track, (index + 1) % n, p);
  return { inside, segment: index };
}

export interface CollisionResult {
  /** True if any body corner has left the track surface. */
  readonly collided: boolean;
  /** Nearest segment to the car's centre — pass back as `hint` next tick. */
  readonly segment: number;
}

/**
 * Car-vs-track-edge collision: the car is dead if ANY of its four body corners
 * is outside the drivable region. `hint` is the segment nearest the car's
 * centre on the previous tick (from the previous result), enabling the
 * localized search.
 */
export function carCollides(
  track: Track,
  car: CarState,
  cfg: PhysicsConfig,
  hint?: number,
): CollisionResult {
  const centre = nearestSegment(track, { x: car.x, y: car.y }, hint);
  const corners = carCorners(car, cfg);
  let collided = false;
  for (const c of corners) {
    if (!isInsideTrack(track, c, centre.index).inside) {
      collided = true;
      break;
    }
  }
  return { collided, segment: centre.index };
}
