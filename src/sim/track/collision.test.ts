import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS, type PhysicsConfig } from '../config.ts';
import { createCarState } from '../physics/car.ts';
import {
  NEAREST_SEGMENT_WINDOW,
  carCollides,
  isInsideTrack,
  nearestSegment,
  pointInSegmentQuad,
} from './collision.ts';
import { buildTrack, type Track } from './track.ts';
import { SQUARE } from '../testing/fixtures.ts';
import { HELDOUT_TRACK, TRAINING_TRACK } from './tracks.ts';

const square: Track = buildTrack(SQUARE);

describe('nearestSegment — square loop', () => {
  it('finds the segment and projection parameter for points beside each side', () => {
    // Beside segment 0 (y = 0, x 0..100), 25% along.
    expect(nearestSegment(square, { x: 25, y: -3 })).toMatchObject({ index: 0, distSq: 9 });
    expect(nearestSegment(square, { x: 25, y: -3 }).t).toBeCloseTo(0.25, 12);
    // Beside segment 1 (x = 100, y 0..100).
    expect(nearestSegment(square, { x: 104, y: 50 })).toMatchObject({ index: 1, distSq: 16 });
    // Beside segment 3 (x = 0, y 100..0), going north: t measured from (0,100).
    const s3 = nearestSegment(square, { x: 2, y: 80 });
    expect(s3.index).toBe(3);
    expect(s3.t).toBeCloseTo(0.2, 12);
  });

  it('a corner-region point beside the shared vertex picks the closer segment', () => {
    // (105, 5): distance to seg 0 is √50 (to vertex (100,0)); to seg 1 is 5.
    expect(nearestSegment(square, { x: 105, y: 5 }).index).toBe(1);
  });
});

describe('pointInSegmentQuad — square loop, hand-computed', () => {
  it('quad 0 is the trapezoid (−10,−10),(110,−10),(90,10),(10,10)', () => {
    expect(pointInSegmentQuad(square, 0, { x: 50, y: 0 })).toBe(true);
    expect(pointInSegmentQuad(square, 0, { x: 50, y: -9.99 })).toBe(true);
    expect(pointInSegmentQuad(square, 0, { x: 50, y: -10.01 })).toBe(false);
    expect(pointInSegmentQuad(square, 0, { x: 50, y: 10.01 })).toBe(false);
    // Boundary counts as inside.
    expect(pointInSegmentQuad(square, 0, { x: 50, y: -10 })).toBe(true);
    // Beyond the miter line x + y = 100 belongs to quad 1, not quad 0.
    expect(pointInSegmentQuad(square, 0, { x: 105, y: 5 })).toBe(false);
    expect(pointInSegmentQuad(square, 1, { x: 105, y: 5 })).toBe(true);
  });
});

describe('isInsideTrack — square loop', () => {
  it.each([
    [{ x: 50, y: 0 }, true, 'on the centerline'],
    [{ x: 50, y: -9.9 }, true, 'just inside the outer (left) edge'],
    [{ x: 50, y: -10.1 }, false, 'just outside the outer edge'],
    [{ x: 50, y: 9.9 }, true, 'just inside the inner (right) edge'],
    [{ x: 50, y: 10.1 }, false, 'just outside the inner edge — in the hole'],
    [{ x: 50, y: 50 }, false, 'middle of the hole'],
    [{ x: 109, y: -7 }, true, 'outer corner region (mitered) is drivable'],
    [{ x: 111, y: -7 }, false, 'past the outer corner'],
    [{ x: 89, y: 11 }, false, 'just inside the hole near its corner (90,10)'],
    [{ x: 91, y: 11 }, true, 'beside the hole corner: x > 90 is on track'],
    [{ x: 89, y: 9 }, true, 'beside the hole corner: y < 10 is on track'],
    [{ x: -50, y: -50 }, false, 'far outside'],
  ])('%j → %s (%s)', (p, expected) => {
    expect(isInsideTrack(square, p).inside).toBe(expected);
  });
});

describe.each([
  ['training', TRAINING_TRACK],
  ['heldout', HELDOUT_TRACK],
])('localized search agrees with the full scan — %s', (_name, t) => {
  it('hinted nearestSegment/isInsideTrack match unhinted for a sweep of points', () => {
    const n = t.centerline.length;
    let checked = 0;
    for (let i = 0; i < n; i++) {
      const c = t.centerline[i]!;
      const L = t.leftEdge[i]!;
      // Sweep from beyond the left edge, across the track, to beyond the right edge.
      for (let f = -1.4; f <= 1.4; f += 0.2) {
        const p = { x: c.x + (L.x - c.x) * f, y: c.y + (L.y - c.y) * f };
        const full = isInsideTrack(t, p);
        const fullDist = nearestSegment(t, p).distSq;
        // Correct hints: this segment and its neighbours (what a moving car supplies).
        for (const h of [i, (i + 1) % n, (i - 1 + n) % n]) {
          const hinted = isInsideTrack(t, p, h);
          expect(hinted.inside).toBe(full.inside);
          // Segments may differ only at exact ties (a point on a shared vertex).
          expect(nearestSegment(t, p, h).distSq).toBeCloseTo(fullDist, 9);
          checked++;
        }
        // Points strictly inside/outside the ring by construction:
        if (Math.abs(f) < 0.99) expect(full.inside).toBe(true);
        if (Math.abs(f) > 1.01) expect(full.inside).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('a stale hint (car reset to the other side of the track) falls back to a full scan', () => {
    const t = TRAINING_TRACK;
    const n = t.centerline.length;
    const far = Math.floor(n / 2);
    const p = t.centerline[far]!;
    const res = nearestSegment(t, p, 0);
    // p is the shared vertex of segments far−1 and far: either is exactly nearest.
    expect([far - 1, far]).toContain(res.index);
    expect(res.distSq).toBe(0);
    expect(NEAREST_SEGMENT_WINDOW).toBeLessThan(far);
  });
});

describe('carCollides — square loop, hand-computed', () => {
  // Car body 4 × 1.8 (half-width 0.9). Facing east on the outer straight,
  // the left corners sit 0.9 m toward −y (screen-up = toward the outer edge).
  const cfg: PhysicsConfig = DEFAULT_PHYSICS;

  it('a car centred on the centerline is not colliding', () => {
    expect(carCollides(square, createCarState(50, 0, 0), cfg).collided).toBe(false);
  });

  it('left corners at y = −10.0 (touching the outer edge) → not yet dead', () => {
    expect(carCollides(square, createCarState(50, -9.1, 0), cfg).collided).toBe(false);
  });

  it('left corners at y = −10.1 (past the outer edge) → dead', () => {
    expect(carCollides(square, createCarState(50, -9.2, 0), cfg).collided).toBe(true);
  });

  it('right corners past the inner edge (y = 10.1) → dead', () => {
    expect(carCollides(square, createCarState(50, 9.2, 0), cfg).collided).toBe(true);
  });

  it('a car turned 90° (facing screen-down) is longer across the track: nose at y=+2 → fine, at y=+10.1 → dead', () => {
    // Facing +π/2 the front corners are 2 m ahead in +y.
    expect(carCollides(square, createCarState(50, 0, Math.PI / 2), cfg).collided).toBe(false);
    expect(carCollides(square, createCarState(50, 8.1, Math.PI / 2), cfg).collided).toBe(true);
  });

  it('returns the nearest segment for use as next tick’s hint, and the hint reproduces the result', () => {
    const first = carCollides(square, createCarState(50, 0, 0), cfg);
    expect(first.segment).toBe(0);
    const again = carCollides(square, createCarState(50.5, 0, 0), cfg, first.segment);
    expect(again).toEqual({ collided: false, segment: 0 });
  });

  it('training track: a car at the start pose is on track; shifted 6.5 m to either side it is dead', () => {
    const t = TRAINING_TRACK;
    const s = t.start;
    expect(carCollides(t, createCarState(s.x, s.y, s.heading), cfg).collided).toBe(false);
    // Start segment runs east, so ±y is across the track.
    expect(carCollides(t, createCarState(s.x, s.y - 6.5, s.heading), cfg).collided).toBe(true);
    expect(carCollides(t, createCarState(s.x, s.y + 6.5, s.heading), cfg).collided).toBe(true);
  });
});
