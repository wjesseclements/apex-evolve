import { describe, expect, it } from 'vitest';
import type { PhysicsConfig } from '../config.ts';
import { DEFAULT_PHYSICS } from '../config.ts';
import { expectVec2 } from '../testing/expectVec2.ts';
import {
  NEUTRAL_CONTROLS,
  carCorners,
  clampControls,
  createCarState,
  stepCar,
  type CarControls,
  type CarState,
} from './car.ts';

/** Round-number config so every expected value below can be computed by hand. */
const HAND: PhysicsConfig = {
  dt: 0.5,
  vMax: 10,
  accel: 6,
  drag: 0,
  steerRate: 2,
  carLength: 4,
  carWidth: 2,
};

/**
 * Frozen config for the golden regression pin below. Deliberately NOT
 * DEFAULT_PHYSICS: tuning the live constants must not require re-pinning; a
 * change to the *model* (stepCar) will still be caught.
 */
const GOLDEN_CFG: PhysicsConfig = {
  dt: 1 / 60,
  vMax: 30,
  accel: 12,
  drag: 0.3,
  steerRate: 3.0,
  carLength: 4.0,
  carWidth: 1.8,
};

/** Pinned final state of the determinism trajectory under GOLDEN_CFG. */
const GOLDEN = {
  x: 5.732648069503768,
  y: 3.4171097494180334,
  heading: 7.001384167430112,
  speed: 13.84979358266484,
};

function run(state: CarState, controls: CarControls, cfg: PhysicsConfig, ticks: number): CarState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = stepCar(s, controls, cfg);
  return s;
}

describe('stepCar — hand-computed single steps (SPEC update order)', () => {
  it('full throttle, straight, from rest: v = accel·dt, moves along +x by v·dt', () => {
    // 1. v = 0 + 6·0.5 = 3   2. drag 0   3. θ = 0   4. x += 3·0.5 = 1.5
    const s = stepCar(createCarState(0, 0, 0), { steering: 0, throttle: 1 }, HAND);
    expect(s.speed).toBe(3);
    expect(s.heading).toBe(0);
    expectVec2(s, { x: 1.5, y: 0 });
  });

  it('full throttle + full RIGHT steering from rest: heading += steerRate·(v/vMax)·dt, y increases', () => {
    // v = 3; θ = 2·(3/10)·0.5 = 0.3 rad (clockwise on screen);
    // pos = (cos 0.3, sin 0.3)·3·0.5 — note the NEW heading is used for translation.
    const s = stepCar(createCarState(0, 0, 0), { steering: 1, throttle: 1 }, HAND);
    expect(s.heading).toBeCloseTo(0.3, 12);
    expectVec2(s, { x: 1.5 * Math.cos(0.3), y: 1.5 * Math.sin(0.3) }, 12);
    expect(s.y).toBeGreaterThan(0); // +y is screen-down ⇒ the car curved to the right on screen
  });

  it('full LEFT steering mirrors: heading decreases, y decreases', () => {
    const s = stepCar(createCarState(0, 0, 0), { steering: -1, throttle: 1 }, HAND);
    expect(s.heading).toBeCloseTo(-0.3, 12);
    expect(s.y).toBeLessThan(0);
  });

  it('applies drag after throttle: v = (v0 + accel·dt)·(1 − drag·dt)', () => {
    const cfg: PhysicsConfig = { ...HAND, drag: 0.2 };
    // v = (4 + 3)·(1 − 0.1) = 6.3
    const s = stepCar({ x: 0, y: 0, heading: 0, speed: 4 }, { steering: 0, throttle: 1 }, cfg);
    expect(s.speed).toBeCloseTo(6.3, 12);
  });

  it('starting heading is respected: facing screen-down (+π/2) moves along +y', () => {
    const s = stepCar(createCarState(5, 5, Math.PI / 2), { steering: 0, throttle: 1 }, HAND);
    expectVec2(s, { x: 5, y: 6.5 }, 12);
  });
});

describe('stepCar — invariants', () => {
  it('cannot turn at standstill: speed 0 + full steering ⇒ heading and position unchanged', () => {
    const start = createCarState(3, 4, 1.234);
    const s = run(start, { steering: 1, throttle: 0 }, HAND, 100);
    expect(s).toEqual(start);
  });

  it('braking at standstill does not reverse: speed stays 0, position fixed', () => {
    const start = createCarState(0, 0, 0);
    const s = run(start, { steering: 0, throttle: -1 }, HAND, 50);
    expect(s.speed).toBe(0);
    expectVec2(s, { x: 0, y: 0 });
  });

  it('speed is clamped to vMax under sustained throttle (drag 0)', () => {
    const s = run(createCarState(0, 0, 0), { steering: 0, throttle: 1 }, HAND, 100);
    expect(s.speed).toBe(HAND.vMax);
  });

  it('with drag > 0, speed never exceeds vMax and settles at vMax·(1 − drag·dt)', () => {
    // After the clamp to vMax the drag multiply is applied, so the steady state
    // sits a hair under vMax; it must never exceed it.
    const cfg: PhysicsConfig = { ...HAND, drag: 0.1 };
    let s = createCarState(0, 0, 0);
    for (let i = 0; i < 200; i++) {
      s = stepCar(s, { steering: 0, throttle: 1 }, cfg);
      expect(s.speed).toBeLessThanOrEqual(cfg.vMax);
    }
    expect(s.speed).toBeCloseTo(cfg.vMax * (1 - cfg.drag * cfg.dt), 12);
  });

  it('brake decelerates at the same rate as accel and stops at 0', () => {
    // v0 = 10, brake: 10 → 7 → 4 → 1 → 0 (clamped, not −2)
    const s0: CarState = { x: 0, y: 0, heading: 0, speed: 10 };
    const s1 = stepCar(s0, { steering: 0, throttle: -1 }, HAND);
    expect(s1.speed).toBe(7);
    const s4 = run(s0, { steering: 0, throttle: -1 }, HAND, 4);
    expect(s4.speed).toBe(0);
  });

  it('with drag > 0 and no throttle, speed decays but never goes negative', () => {
    const cfg: PhysicsConfig = { ...HAND, drag: 0.5 };
    let s: CarState = { x: 0, y: 0, heading: 0, speed: 8 };
    let prev = s.speed;
    for (let i = 0; i < 50; i++) {
      s = stepCar(s, NEUTRAL_CONTROLS, cfg);
      expect(s.speed).toBeLessThan(prev);
      expect(s.speed).toBeGreaterThanOrEqual(0);
      prev = s.speed;
    }
  });

  it('out-of-range controls are clamped to [-1, 1] before use', () => {
    const a = stepCar(createCarState(0, 0, 0), { steering: 7, throttle: 42 }, HAND);
    const b = stepCar(createCarState(0, 0, 0), { steering: 1, throttle: 1 }, HAND);
    expect(a).toEqual(b);
    expect(clampControls({ steering: -3, throttle: 0.5 })).toEqual({ steering: -1, throttle: 0.5 });
  });

  it('turn radius is speed-independent: vMax/steerRate for full steering', () => {
    // Drive a full circle at two different steady speeds; the radius from the
    // circle's center should match vMax/steerRate = 5 m in both cases.
    const cfg: PhysicsConfig = { ...HAND, dt: 1 / 600 };
    for (const speed of [2, 10]) {
      let s: CarState = { x: 0, y: 0, heading: 0, speed };
      // Hold speed constant by using zero throttle & zero drag.
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      const ticks = Math.ceil((2 * Math.PI * (cfg.vMax / cfg.steerRate)) / speed / cfg.dt);
      for (let i = 0; i < ticks; i++) {
        s = stepCar(s, { steering: 1, throttle: 0 }, cfg);
        minX = Math.min(minX, s.x);
        maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y);
        maxY = Math.max(maxY, s.y);
      }
      const radius = cfg.vMax / cfg.steerRate;
      expect((maxX - minX) / 2).toBeCloseTo(radius, 1);
      expect((maxY - minY) / 2).toBeCloseTo(radius, 1);
    }
  });
});

describe('stepCar — determinism (same inputs ⇒ same trajectory)', () => {
  /** A scripted, deterministic control sequence covering all channels. */
  function controlsAt(tick: number): CarControls {
    const phase = tick % 240;
    if (phase < 60) return { steering: 0, throttle: 1 };
    if (phase < 120) return { steering: 1, throttle: 0.5 };
    if (phase < 180) return { steering: -0.7, throttle: -1 };
    return { steering: 0.25, throttle: 1 };
  }

  function trajectory(cfg: PhysicsConfig, ticks: number): CarState[] {
    const out: CarState[] = [];
    let s = createCarState(1, 2, 0.5);
    for (let t = 0; t < ticks; t++) {
      s = stepCar(s, controlsAt(t), cfg);
      out.push(s);
    }
    return out;
  }

  it('two runs with identical inputs produce bit-identical trajectories', () => {
    const a = trajectory(DEFAULT_PHYSICS, 1200);
    const b = trajectory(DEFAULT_PHYSICS, 1200);
    expect(a).toStrictEqual(b);
    // Belt and braces: exact bit equality of every field, not just deep-equal semantics.
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      const q = b[i];
      if (!p || !q) throw new Error('missing state');
      expect(Object.is(p.x, q.x) && Object.is(p.y, q.y)).toBe(true);
      expect(Object.is(p.heading, q.heading) && Object.is(p.speed, q.speed)).toBe(true);
    }
  });

  it('golden final state after 1200 ticks with GOLDEN_CFG (regression pin)', () => {
    // Pinned from the first implementation. If this changes, the physics
    // model changed — update deliberately, never casually.
    //
    // Tolerance, not bit-equality: Math.sin/Math.cos are not bit-identical
    // across JS engines (macOS/arm64 Node 26 and Linux/x64 Node 22 differed in
    // the last two bits of y after 1200 ticks). Determinism is guaranteed
    // within one engine — that is what the bit-identical test above pins.
    const s = trajectory(GOLDEN_CFG, 1200).at(-1);
    if (!s) throw new Error('empty trajectory');
    expect(s.x).toBeCloseTo(GOLDEN.x, 9);
    expect(s.y).toBeCloseTo(GOLDEN.y, 9);
    expect(s.heading).toBeCloseTo(GOLDEN.heading, 9);
    expect(s.speed).toBeCloseTo(GOLDEN.speed, 9);
  });
});

describe('carCorners', () => {
  it('facing east at origin, L=4 W=2: FL (2,−1), FR (2,1), RR (−2,1), RL (−2,−1)', () => {
    const [fl, fr, rr, rl] = carCorners(createCarState(0, 0, 0), HAND);
    expectVec2(fl, { x: 2, y: -1 }); // car's left is screen-up (−y)
    expectVec2(fr, { x: 2, y: 1 });
    expectVec2(rr, { x: -2, y: 1 });
    expectVec2(rl, { x: -2, y: -1 });
  });

  it('facing screen-down (+π/2) at (10,10): FL (11,12), FR (9,12), RR (9,8), RL (11,8)', () => {
    // Facing down the screen, the car's left is screen-right (+x).
    const [fl, fr, rr, rl] = carCorners(createCarState(10, 10, Math.PI / 2), HAND);
    expectVec2(fl, { x: 11, y: 12 });
    expectVec2(fr, { x: 9, y: 12 });
    expectVec2(rr, { x: 9, y: 8 });
    expectVec2(rl, { x: 11, y: 8 });
  });
});
