import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM, type SimConfig } from '../config.ts';
import { createCarState } from '../physics/car.ts';
import { SQUARE } from '../testing/fixtures.ts';
import { isInsideTrack } from '../track/collision.ts';
import { buildTrack } from '../track/track.ts';
import { HELDOUT_TRACK, TRAINING_TRACK } from '../track/tracks.ts';
import { castRay, findContainingQuad } from './raycast.ts';
import { castCarRays, normalizeRay, senseCar } from './sensors.ts';

const square = buildTrack(SQUARE);
const DEG = Math.PI / 180;
const dirOf = (deg: number) => ({ x: Math.cos(deg * DEG), y: Math.sin(deg * DEG) });

describe('castRay — square loop, hand-computed (car centre at (50,0), width 20, half 10)', () => {
  const o = { x: 50, y: 0 };
  const R = 100; // range larger than every distance below so no boundary ambiguity

  it.each([
    [-90, 10, 'up (car left) hits the outer wall y = −10'],
    [90, 10, 'down (car right) hits the inner wall y = 10'],
    [0, 60, 'east hits the outer wall x = 110'],
    [180, 60, 'west hits the outer wall x = −10'],
    [-30, 20, '10 / sin 30°'],
    [30, 20, '10 / sin 30°'],
    [-60, 10 / Math.sin(60 * DEG), '10 / sin 60° = 11.547'],
    [60, 10 / Math.sin(60 * DEG), '10 / sin 60°'],
    [-45, 10 * Math.SQRT2, '10·√2 = 14.142'],
  ])('angle %d° → distance %f (%s)', (deg, expected) => {
    const h = castRay(square, o, dirOf(deg), R, 0);
    expect(h.hit).toBe(true);
    expect(h.distance).toBeCloseTo(expected, 9);
    // End point lies on the ray at that distance.
    expect(h.x).toBeCloseTo(o.x + Math.cos(deg * DEG) * expected, 9);
    expect(h.y).toBeCloseTo(o.y + Math.sin(deg * DEG) * expected, 9);
  });

  it('walks across the mitered corner: from (95,0) east → x = 110 at 15 m (through quad 0 into quad 1)', () => {
    const h = castRay(square, { x: 95, y: 0 }, dirOf(0), 100, 0);
    expect(h.hit).toBe(true);
    expect(h.distance).toBeCloseTo(15, 9);
    expect(h.x).toBeCloseTo(110, 9);
    expect(h.y).toBeCloseTo(0, 9);
  });

  it('a ray going backwards along the track walks into the previous quad: from (5,0) west → x = −10 at 15 m', () => {
    const h = castRay(square, { x: 5, y: 0 }, dirOf(180), 100, 0);
    expect(h.distance).toBeCloseTo(15, 9);
    expect(h.hit).toBe(true);
  });

  it('a long diagonal traverses several quads: from (0,0) toward (100,100) exits through the inner corner region', () => {
    // Direction 45°: the inner square (10..90) is entered at (10,10) → hit at 10·√2.
    const h = castRay(square, { x: 0, y: 0 }, dirOf(45), 400, 0);
    expect(h.hit).toBe(true);
    expect(h.distance).toBeCloseTo(10 * Math.SQRT2, 9);
  });

  it('a hint that is a few segments off still finds the containing quad', () => {
    const h = castRay(square, o, dirOf(-90), 100, 2);
    expect(h.distance).toBeCloseTo(10, 9);
  });

  it('origin off the track surface reports a hit at 0', () => {
    expect(castRay(square, { x: 50, y: 50 }, dirOf(0), 100, 0)).toEqual({
      distance: 0,
      hit: true,
      x: 50,
      y: 50,
    });
  });
});

describe('castRay — max-range boundary is defined: hit iff wall distance < maxRange', () => {
  const o = { x: 50, y: 0 };
  const east = dirOf(0); // wall at exactly 60 m (x = 110)

  it('wall at exactly maxRange → no hit, distance = maxRange, endpoint at maxRange', () => {
    const h = castRay(square, o, east, 60, 0);
    expect(h.hit).toBe(false);
    expect(h.distance).toBe(60);
    expect(h.x).toBeCloseTo(110, 9);
  });

  it('wall just beyond maxRange → no hit', () => {
    const h = castRay(square, o, east, 59.999, 0);
    expect(h.hit).toBe(false);
    expect(h.distance).toBe(59.999);
  });

  it('wall just inside maxRange → hit at 60', () => {
    const h = castRay(square, o, east, 60.001, 0);
    expect(h.hit).toBe(true);
    expect(h.distance).toBeCloseTo(60, 9);
  });

  it('normalized reading is 1.0 in all three cases at/around the boundary', () => {
    expect(normalizeRay(castRay(square, o, east, 60, 0), 60)).toBe(1);
    expect(normalizeRay(castRay(square, o, east, 59.999, 0), 59.999)).toBe(1);
    expect(normalizeRay(castRay(square, o, east, 60.001, 0), 60.001)).toBeCloseTo(60 / 60.001, 12);
  });
});

describe('findContainingQuad', () => {
  it('finds the quad for points on the square, −1 off track', () => {
    expect(findContainingQuad(square, { x: 50, y: 0 }, 0)).toBe(0);
    expect(findContainingQuad(square, { x: 100, y: 50 }, 0)).toBe(1); // hint off by one
    expect(findContainingQuad(square, { x: 0, y: 50 }, 0)).toBe(3); // hint off by one the other way
    expect(findContainingQuad(square, { x: 50, y: 100 }, 0)).toBe(2); // full scan fallback
    expect(findContainingQuad(square, { x: 50, y: 50 }, 0)).toBe(-1);
  });
});

describe('sensors — car rays and NN inputs', () => {
  const cfg: SimConfig = { ...DEFAULT_SIM, sensors: { ...DEFAULT_SIM.sensors, range: 100 } };

  it('7 rays in SPEC order; negative angles are the car’s LEFT (facing east → screen-up)', () => {
    const rays = castCarRays(square, createCarState(50, 0, 0), 0, cfg.sensors);
    expect(rays).toHaveLength(7);
    // ray[0] is −90° = left = up: it ends on the outer wall y = −10.
    expect(rays[0]!.y).toBeCloseTo(-10, 9);
    expect(rays[0]!.distance).toBeCloseTo(10, 9);
    // ray[6] is +90° = right = down: inner wall y = 10.
    expect(rays[6]!.y).toBeCloseTo(10, 9);
    // ray[3] is straight ahead: x = 110 at 60 m.
    expect(rays[3]!.distance).toBeCloseTo(60, 9);
    expect(rays[3]!.x).toBeCloseTo(110, 9);
    // ±30° / ±60° symmetric on this centred pose.
    expect(rays[2]!.distance).toBeCloseTo(rays[4]!.distance, 9);
    expect(rays[1]!.distance).toBeCloseTo(rays[5]!.distance, 9);
    expect(rays[2]!.distance).toBeCloseTo(20, 9);
  });

  it('rays rotate with the car: facing screen-down (+π/2), −90° looks east and +90° looks west', () => {
    const rays = castCarRays(square, createCarState(50, 0, Math.PI / 2), 0, cfg.sensors);
    expect(rays[0]!.distance).toBeCloseTo(60, 9); // east to x = 110
    expect(rays[0]!.x).toBeCloseTo(110, 9);
    expect(rays[6]!.distance).toBeCloseTo(60, 9); // west to x = −10
    expect(rays[6]!.x).toBeCloseTo(-10, 9);
    expect(rays[3]!.distance).toBeCloseTo(10, 9); // ahead = down to y = 10
  });

  it('senseCar returns 8 inputs in [0,1]: 7 normalized rays then v / vMax', () => {
    const r = senseCar(square, { x: 50, y: 0, heading: 0, speed: 15 }, 0, cfg);
    expect(r.inputs).toHaveLength(8);
    expect(r.inputs[0]).toBeCloseTo(0.1, 12); // 10 / 100
    expect(r.inputs[3]).toBeCloseTo(0.6, 12); // 60 / 100
    expect(r.inputs[7]).toBeCloseTo(0.5, 12); // 15 / 30
    for (const v of r.inputs) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('a car with its nose on the wall still reads carLength/2 ahead (centre origin vs corner collision)', () => {
    // Facing east with the front corners exactly on x = 110: centre at 108.
    const r = castCarRays(square, createCarState(108, 50, 0), 1, cfg.sensors);
    expect(r[3]!.distance).toBeCloseTo(DEFAULT_SIM.physics.carLength / 2, 9);
  });
});

describe.each([
  ['training', TRAINING_TRACK],
  ['heldout', HELDOUT_TRACK],
])('sensors — %s track invariants', (_name, t) => {
  it('every ray from every centerline vertex ends on the surface (or at range) and one step beyond is off it', () => {
    const cfg = DEFAULT_SIM;
    let hits = 0;
    let misses = 0;
    for (let i = 0; i < t.centerline.length; i++) {
      const c = t.centerline[i]!;
      const nxt = t.centerline[(i + 1) % t.centerline.length]!;
      const heading = Math.atan2(nxt.y - c.y, nxt.x - c.x);
      const rays = castCarRays(t, createCarState(c.x, c.y, heading), i, cfg.sensors);
      for (const r of rays) {
        expect(r.distance).toBeGreaterThan(0);
        expect(r.distance).toBeLessThanOrEqual(cfg.sensors.range);
        // Sample along the ray up to just before its end: all on the surface.
        const dx = r.x - c.x;
        const dy = r.y - c.y;
        for (let f = 0; f < 0.999; f += 0.05) {
          expect(isInsideTrack(t, { x: c.x + dx * f, y: c.y + dy * f }).inside).toBe(true);
        }
        if (r.hit) {
          hits++;
          // 5 cm past the hit point is off the track.
          const len = r.distance;
          const px = r.x + (dx / len) * 0.05;
          const py = r.y + (dy / len) * 0.05;
          expect(isInsideTrack(t, { x: px, y: py }).inside).toBe(false);
        } else {
          misses++;
          expect(r.distance).toBe(cfg.sensors.range);
        }
      }
    }
    expect(hits).toBeGreaterThan(500);
    expect(misses).toBeGreaterThan(0); // some forward rays on the long straight see nothing within 60 m
  });

  it('side rays at the start pose read ~6 m (half the 12 m width) on both sides', () => {
    const s = TRAINING_TRACK.start;
    const rays = castCarRays(
      TRAINING_TRACK,
      createCarState(s.x, s.y, s.heading),
      0,
      DEFAULT_SIM.sensors,
    );
    // Left: quad 0's wall at y = −6 → exactly 6. Right: directly below (0,0)
    // the ray falls just outside quad 0 (its back boundary is mitered because
    // the final arc sample is tilted 4.5°), so it meets the previous segment's
    // tilted right edge at 6.0185 m — the true distance to the rendered edge.
    expect(rays[0]!.distance).toBeCloseTo(6, 6);
    expect(rays[6]!.distance).toBeCloseTo(6.0185, 3);
    expect(rays[3]!.hit).toBe(false); // 80 m straight ahead > 60 m range
  });

  it('golden sensor reading at a mid-corner pose — BIT-EXACT across engines', () => {
    const r = senseCar(
      TRAINING_TRACK,
      { x: 105, y: 20, heading: 1.2, speed: 22.5 },
      25,
      DEFAULT_SIM,
    );
    expect(r.inputs).toEqual(GOLDEN_INPUTS);
  });
});

/** Pinned on macOS/arm64; CI on Linux/x64 must match bit-for-bit. */
const GOLDEN_INPUTS: number[] = [
  0.1509419852271478, 0.1678875328669992, 0.23365266570018212, 0.48456772948195304,
  0.12815938947952177, 0.058327644375399536, 0.04924656409297861, 0.75,
];
