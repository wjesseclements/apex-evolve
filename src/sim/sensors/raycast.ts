/**
 * Raycasting against the track edges.
 *
 * Exact and localized, using the same per-segment drivable quads as
 * collision.ts: the ray starts inside the quad that contains its origin and
 * we repeatedly find the edge through which it leaves the current quad. If
 * that edge is a wall (left/right track edge) the ray has hit; if it is the
 * boundary shared with the next/previous quad, the walk continues there.
 * Cost is O(quads traversed) — a few per ray — with no search window and no
 * dependence on track size. The wall geometry is exactly the rendered edges.
 *
 * Conventions: meters, +y down, direction vectors are unit length. See
 * docs/CONVENTIONS.md.
 *
 * Max-range boundary (defined, not emergent): a hit is registered iff the
 * wall distance is STRICTLY less than `maxRange`. A wall at exactly maxRange
 * or beyond gives `hit = false`, `distance = maxRange`. Either way the
 * normalized reading is min(distance, maxRange) / maxRange, so a wall at
 * exactly maxRange reads 1.0.
 */

import type { Vec2 } from '../math/vec2.ts';
import { pointInSegmentQuad } from '../track/collision.ts';
import { at, segmentCount, wrapIndex, type Track } from '../track/track.ts';

export interface RayHit {
  /** Distance travelled along the ray, meters: the wall distance if hit, else maxRange. */
  readonly distance: number;
  /** True iff a wall was struck strictly before maxRange. */
  readonly hit: boolean;
  /** Ray end point (the wall point if hit, else origin + dir·maxRange). */
  readonly x: number;
  readonly y: number;
}

/** Tolerance for "on the boundary" decisions, meters / parameter units. */
const EPS = 1e-9;
/** Guard against pathological loops (a ray can never traverse more quads than the track has). */
const MAX_STEPS_FACTOR = 2;

/**
 * Index of the drivable quad containing p, trying `hint` and its neighbours
 * first (a car centre is always in one of those — see collision.ts), then a
 * full scan. Returns −1 if p is off the track surface.
 */
export function findContainingQuad(track: Track, p: Vec2, hint: number): number {
  const n = segmentCount(track);
  const h = wrapIndex(hint, n);
  if (pointInSegmentQuad(track, h, p)) return h;
  const prev = wrapIndex(h - 1, n);
  if (pointInSegmentQuad(track, prev, p)) return prev;
  const next = (h + 1) % n;
  if (pointInSegmentQuad(track, next, p)) return next;
  for (let i = 0; i < n; i++) if (pointInSegmentQuad(track, i, p)) return i;
  return -1;
}

/**
 * Cyrus-Beck exit test for one edge a→b of a convex quad whose interior
 * contains (cx, cy): if the ray o + d·t points OUT through the edge's line,
 * return the t at which it crosses that line; otherwise Infinity. Edges the
 * ray enters through, or is parallel to, never count as exits — so a ray that
 * starts exactly on a shared boundary needs no special-casing.
 */
function exitT(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  a: Vec2,
  b: Vec2,
  cx: number,
  cy: number,
): number {
  // A normal to the edge; flip it to point away from the quad's centre.
  let nx = -(b.y - a.y);
  let ny = b.x - a.x;
  if ((cx - a.x) * nx + (cy - a.y) * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const dn = dx * nx + dy * ny;
  if (dn <= 1e-12) return Infinity; // parallel or pointing inward
  return ((a.x - ox) * nx + (a.y - oy) * ny) / dn;
}

const EXIT_LEFT_WALL = 0;
const EXIT_RIGHT_WALL = 1;
const EXIT_FRONT = 2;
const EXIT_BACK = 3;

/**
 * Cast a ray from `origin` along unit direction `dir` up to `maxRange`.
 * `hint` is the segment nearest the origin (e.g. the car's `segmentHint`).
 * If the origin is not on the track surface the ray reports a hit at 0.
 */
export function castRay(
  track: Track,
  origin: Vec2,
  dir: Vec2,
  maxRange: number,
  hint: number,
): RayHit {
  const n = segmentCount(track);
  let q = findContainingQuad(track, origin, hint);
  if (q < 0) return { distance: 0, hit: true, x: origin.x, y: origin.y };

  const ox = origin.x;
  const oy = origin.y;
  const dx = dir.x;
  const dy = dir.y;
  const maxSteps = n * MAX_STEPS_FACTOR;
  let tCur = 0;

  for (let step = 0; step < maxSteps; step++) {
    const j = (q + 1) % n;
    const l0 = at(track.leftEdge, q);
    const l1 = at(track.leftEdge, j);
    const r1 = at(track.rightEdge, j);
    const r0 = at(track.rightEdge, q);
    const cx = (l0.x + l1.x + r1.x + r0.x) / 4;
    const cy = (l0.y + l1.y + r1.y + r0.y) / 4;

    // Convex quad: the ray exits at the smallest crossing among the edges it
    // points out through. Ties resolve in favour of walls (a ray through a
    // corner vertex counts as touching the wall there).
    let t = exitT(ox, oy, dx, dy, l0, l1, cx, cy);
    let exit = EXIT_LEFT_WALL;
    const tRight = exitT(ox, oy, dx, dy, r1, r0, cx, cy);
    if (tRight < t) {
      t = tRight;
      exit = EXIT_RIGHT_WALL;
    }
    const tFront = exitT(ox, oy, dx, dy, l1, r1, cx, cy);
    if (tFront < t - EPS) {
      t = tFront;
      exit = EXIT_FRONT;
    }
    const tBack = exitT(ox, oy, dx, dy, r0, l0, cx, cy);
    if (tBack < t - EPS) {
      t = tBack;
      exit = EXIT_BACK;
    }

    if (t === Infinity) break; // numerically degenerate; treat as no hit in range
    if (t < tCur) t = tCur; // never move backwards (rounding on a shared boundary)
    if (t >= maxRange) break; // wall/boundary at or beyond max range → no hit (see header)

    if (exit === EXIT_LEFT_WALL || exit === EXIT_RIGHT_WALL) {
      return { distance: t, hit: true, x: ox + dx * t, y: oy + dy * t };
    }
    tCur = t;
    q = exit === EXIT_FRONT ? j : wrapIndex(q - 1, n);
  }
  return { distance: maxRange, hit: false, x: ox + dx * maxRange, y: oy + dy * maxRange };
}
