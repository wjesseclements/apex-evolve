/**
 * Track geometry: a closed centerline polyline with uniform width, and the
 * left/right edge polylines derived from it.
 *
 * Conventions (docs/CONVENTIONS.md):
 * - Units meters. +x right, +y DOWN on screen.
 * - Direction of travel = centerline point order; the loop is closed (the last
 *   point connects back to the first; no duplicated vertex).
 * - For travel direction d, LEFT normal = (d.y, −d.x), RIGHT normal = (−d.y, d.x).
 * - leftEdge[i] / rightEdge[i] are the offsets of centerline[i] by width/2
 *   along the vertex's mitered left/right normal, so that both edges stay
 *   exactly width/2 from the adjacent centerline segments.
 *
 * Segment i runs from centerline[i] to centerline[(i+1) % n]. The quad
 * [leftEdge[i], leftEdge[i+1], rightEdge[i+1], rightEdge[i]] is the drivable
 * region owned by segment i; the quads of consecutive segments share the
 * mitered edge through the shared vertex, so together they tile the track
 * ring exactly. This is what makes the collision test localizable (collision.ts).
 */

import { atan2, hypot2 } from '../math/dmath.ts';
import { leftNormal, normalize, sub, type Vec2 } from '../math/vec2.ts';

/** Shape of the hand-authored track JSON. */
export interface TrackData {
  readonly name: string;
  /** Full track width, meters (edges are width/2 either side of the centerline). */
  readonly width: number;
  /** Closed centerline polyline, [x, y] pairs in meters, in direction of travel. */
  readonly centerline: ReadonlyArray<readonly [number, number]>;
}

export interface StartPose {
  readonly x: number;
  readonly y: number;
  /** Heading of the first centerline segment, radians. */
  readonly heading: number;
}

export interface Track {
  readonly name: string;
  readonly width: number;
  /** n centerline vertices. */
  readonly centerline: readonly Vec2[];
  /** n left-edge vertices (car's left when driving in point order). */
  readonly leftEdge: readonly Vec2[];
  /** n right-edge vertices. */
  readonly rightEdge: readonly Vec2[];
  /** Length of segment i (centerline[i] → centerline[i+1 mod n]), meters. */
  readonly segmentLengths: readonly number[];
  /** Arc length from centerline[0] to centerline[i] along the loop, meters (segmentStart[0] = 0). */
  readonly segmentStart: readonly number[];
  /** Total centerline length, meters. */
  readonly totalLength: number;
  /** Where cars start: centerline[0], facing along segment 0. */
  readonly start: StartPose;
  /** Axis-aligned bounds of the edges (for renderers to fit the view). */
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

/** Number of centerline segments (equals number of vertices for a closed loop). */
export function segmentCount(track: Track): number {
  return track.centerline.length;
}

/** Wrap a segment/vertex index into [0, n). Works for negative i. */
export function wrapIndex(i: number, n: number): number {
  const m = i % n;
  return m < 0 ? m + n : m;
}

/**
 * Validate untrusted JSON into TrackData without type assertions. Throws with a
 * descriptive message on any structural problem.
 */
export function parseTrackData(raw: unknown): TrackData {
  if (typeof raw !== 'object' || raw === null) throw new Error('track: not an object');
  const name = 'name' in raw ? raw.name : undefined;
  const width = 'width' in raw ? raw.width : undefined;
  const centerline = 'centerline' in raw ? raw.centerline : undefined;
  if (typeof name !== 'string' || name.length === 0)
    throw new Error('track: name must be a non-empty string');
  if (typeof width !== 'number' || !(width > 0))
    throw new Error('track: width must be a positive number');
  if (!Array.isArray(centerline)) throw new Error('track: centerline must be an array');
  if (centerline.length < 3) throw new Error('track: centerline needs at least 3 points');
  const pts: (readonly [number, number])[] = [];
  centerline.forEach((p: unknown, i: number) => {
    if (!Array.isArray(p) || p.length !== 2)
      throw new Error(`track: centerline[${i}] must be [x, y]`);
    const [x, y]: unknown[] = p;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      throw new Error(`track: centerline[${i}] must be finite numbers`);
    }
    pts.push([x, y]);
  });
  return { name, width, centerline: pts };
}

/** Build the derived geometry (edges, lengths, start pose, bounds) from track data. */
export function buildTrack(data: TrackData): Track {
  const n = data.centerline.length;
  if (n < 3) throw new Error('track needs at least 3 centerline points');
  const centerline: Vec2[] = data.centerline.map(([x, y]) => ({ x, y }));
  const half = data.width / 2;

  // Unit direction and length of each segment i: c[i] → c[i+1].
  const dirs: Vec2[] = [];
  const segmentLengths: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = at(centerline, i);
    const b = at(centerline, (i + 1) % n);
    const d = sub(b, a);
    const len = hypot2(d.x, d.y);
    if (len === 0) throw new Error(`track: duplicate consecutive centerline points at ${i}`);
    dirs.push({ x: d.x / len, y: d.y / len });
    segmentLengths.push(len);
  }

  // Mitered offset at each vertex: bisector of the adjacent segments' left
  // normals, scaled so the offset point is exactly `half` from both segments.
  const leftEdge: Vec2[] = [];
  const rightEdge: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const nPrev = leftNormal(at(dirs, wrapIndex(i - 1, n)));
    const nNext = leftNormal(at(dirs, i));
    const bis = normalize({ x: nPrev.x + nNext.x, y: nPrev.y + nNext.y });
    // cos(θ/2) where θ is the turn angle: bis·nNext. For a straight, 1.
    const cosHalf = bis.x * nNext.x + bis.y * nNext.y;
    if (cosHalf < 0.1) throw new Error(`track: turn at vertex ${i} is too sharp to offset`);
    const m = half / cosHalf;
    const c = at(centerline, i);
    leftEdge.push({ x: c.x + bis.x * m, y: c.y + bis.y * m });
    rightEdge.push({ x: c.x - bis.x * m, y: c.y - bis.y * m });
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of [...leftEdge, ...rightEdge]) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const segmentStart: number[] = [];
  let acc = 0;
  for (const len of segmentLengths) {
    segmentStart.push(acc);
    acc += len;
  }

  const first = at(centerline, 0);
  const d0 = at(dirs, 0);
  return {
    name: data.name,
    width: data.width,
    centerline,
    leftEdge,
    rightEdge,
    segmentLengths,
    segmentStart,
    totalLength: acc,
    start: { x: first.x, y: first.y, heading: atan2(d0.y, d0.x) },
    bounds: { minX, minY, maxX, maxY },
  };
}

/** Bounds-checked indexing (noUncheckedIndexedAccess without non-null assertions). */
export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`index ${i} out of range (length ${arr.length})`);
  return v;
}
