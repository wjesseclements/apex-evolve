import type { TrackData } from '../track/track.ts';
import type { Vec2 } from '../math/vec2.ts';

/**
 * A 100 m square driven CLOCKWISE on screen (east → south → west → north),
 * i.e. all right-hand turns, width 20 (half-width 10). Outer edge is the
 * square −10..110, inner edge (the hole) is 10..90.
 */
export const SQUARE: TrackData = {
  name: 'square',
  width: 20,
  centerline: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
};

/** Perpendicular distance from p to the infinite line through a and b. */
export function distToLine(a: Vec2, b: Vec2, p: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  return Math.abs(abx * (p.y - a.y) - aby * (p.x - a.x)) / Math.sqrt(abx * abx + aby * aby);
}
