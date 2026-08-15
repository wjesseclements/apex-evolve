import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS, DEFAULT_SIM } from '../config.ts';
import type { CarControls } from '../physics/car.ts';
import { SQUARE } from '../testing/fixtures.ts';
import { buildTrack } from '../track/track.ts';
import { TRAINING_TRACK } from '../track/tracks.ts';
import { createWorld, resetWorld, stepWorld, type World } from './world.ts';

const square = buildTrack(SQUARE);
const FULL_THROTTLE: CarControls = { steering: 0, throttle: 1 };
const HARD_RIGHT: CarControls = { steering: 1, throttle: 1 };

function run(world: World, controls: CarControls, ticks: number): World {
  let w = world;
  for (let i = 0; i < ticks; i++) w = stepWorld(w, () => controls);
  return w;
}

describe('createWorld / resetWorld', () => {
  it('spawns cars at rest at the start pose', () => {
    const w = createWorld(square, DEFAULT_SIM, 3);
    expect(w.cars).toHaveLength(3);
    for (const c of w.cars) {
      expect(c.state).toEqual({ x: 0, y: 0, heading: 0, speed: 0 });
      expect(c.alive).toBe(true);
    }
    expect(w.tick).toBe(0);
    expect(w.time).toBe(0);
  });

  it('reset returns to the initial state after driving', () => {
    const w0 = createWorld(square, DEFAULT_SIM);
    const w1 = run(w0, FULL_THROTTLE, 120);
    expect(w1.cars[0]!.state.x).toBeGreaterThan(0);
    expect(resetWorld(w1)).toEqual(w0);
  });
});

describe('stepWorld', () => {
  it('advances tick and time by exactly one dt per call', () => {
    const w = run(createWorld(square, DEFAULT_SIM), FULL_THROTTLE, 60);
    expect(w.tick).toBe(60);
    expect(w.time).toBeCloseTo(1, 12);
  });

  it('records the controls applied to each car', () => {
    const w = stepWorld(createWorld(square, DEFAULT_SIM), () => HARD_RIGHT);
    expect(w.cars[0]!.controls).toEqual(HARD_RIGHT);
  });

  it('driving straight down the 100 m side of the square never crashes', () => {
    // 100 m of straight, then the car needs ~10 m of width to run into the wall.
    const w = run(createWorld(square, DEFAULT_SIM), FULL_THROTTLE, 240); // 4 s ≈ 70 m
    expect(w.cars[0]!.alive).toBe(true);
    expect(w.cars[0]!.state.x).toBeGreaterThan(50);
  });

  it('a car that runs into the wall dies, freezes in place, and stays dead', () => {
    // Full throttle straight on the square: eventually reaches x ≈ 110 (outer edge).
    let w = createWorld(square, DEFAULT_SIM);
    let crashTick = -1;
    for (let t = 1; t <= 1200; t++) {
      w = stepWorld(w, () => FULL_THROTTLE);
      if (!w.cars[0]!.alive) {
        crashTick = t;
        break;
      }
    }
    expect(crashTick).toBeGreaterThan(0);
    const dead = w.cars[0]!;
    expect(dead.crashedAtTick).toBe(crashTick);
    // The nose (2 m ahead of centre) has just crossed x = 110.
    expect(dead.state.x + DEFAULT_PHYSICS.carLength / 2).toBeGreaterThan(110);
    expect(dead.state.x + DEFAULT_PHYSICS.carLength / 2).toBeLessThan(110 + 1); // < one tick of travel past it

    // Frozen: further ticks do not move it, even with input.
    const later = run(w, HARD_RIGHT, 100);
    expect(later.cars[0]!.state).toEqual(dead.state);
    expect(later.cars[0]!.alive).toBe(false);
    expect(later.cars[0]!.crashedAtTick).toBe(crashTick);
    expect(later.tick).toBe(w.tick + 100);
  });

  it('cars are independent: one crashing does not affect another', () => {
    const w0 = createWorld(square, DEFAULT_SIM, 2);
    // Car 0 drives flat out into the far wall; car 1 potters along at 20%
    // throttle (terminal speed 8 m/s → < 80 m in 10 s, well short of the wall).
    let w = w0;
    for (let t = 0; t < 600; t++) {
      w = stepWorld(w, (i) => (i === 0 ? FULL_THROTTLE : { steering: 0, throttle: 0.2 }));
    }
    expect(w.cars[0]!.alive).toBe(false);
    expect(w.cars[1]!.alive).toBe(true);
    expect(w.cars[1]!.state.x).toBeGreaterThan(30);
  });

  /** Deterministic scripted controls (no Math.* so the input itself is engine-independent). */
  const scriptedControls = (t: number): CarControls => ({
    steering: ((t % 97) / 97) * 0.6 - 0.3,
    throttle: t % 100 < 70 ? 1 : -0.5,
  });
  const driveScripted = () => {
    let w = createWorld(TRAINING_TRACK, DEFAULT_SIM, 2);
    for (let t = 0; t < 900; t++) w = stepWorld(w, (i) => scriptedControls(t + i * 7));
    return w;
  };

  it('is deterministic: two worlds stepped with identical inputs are deeply equal', () => {
    expect(driveScripted()).toStrictEqual(driveScripted());
  });

  it('golden: 900 scripted ticks on the training track — BIT-EXACT on every engine', () => {
    // Pinned on macOS/arm64, verified on CI (Linux/x64). Exercises stepCar,
    // dmath trig, mitered edges and the localized collision test end to end.
    const w = driveScripted();
    const c0 = w.cars[0]!;
    const c1 = w.cars[1]!;
    expect(c0.state).toEqual({
      x: 101.4497285885484,
      y: 3.3680870870252653,
      heading: 0.015895596235454643,
      speed: 19.549352013749544,
    });
    expect(c0.alive).toBe(false);
    expect(c0.crashedAtTick).toBe(431);
    expect(c1.state).toEqual({
      x: 102.37045190939392,
      y: 4.301863957415418,
      heading: 0.029426509836316204,
      speed: 20.86415146250684,
    });
    expect(c1.alive).toBe(false);
    expect(c1.crashedAtTick).toBe(439);
  });

  it('on the training track, full throttle straight from the start crashes at the first corner', () => {
    let w = createWorld(TRAINING_TRACK, DEFAULT_SIM);
    for (let t = 0; t < 1800 && w.cars[0]!.alive; t++) w = stepWorld(w, () => FULL_THROTTLE);
    const car = w.cars[0]!;
    expect(car.alive).toBe(false);
    // The opening straight is 80 m east, then a right-hander of radius 30: the
    // car should die past x = 80 but before x = 80 + 30 + 6 (outer edge apex).
    expect(car.state.x).toBeGreaterThan(80);
    expect(car.state.x).toBeLessThan(118);
  });
});
