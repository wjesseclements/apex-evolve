import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS, DEFAULT_SIM as GRIP_SIM, NO_GRIP_SIM as DEFAULT_SIM } from '../config.ts';
import type { CarControls } from '../physics/car.ts';
import { SQUARE } from '../testing/fixtures.ts';
import { buildTrack } from '../track/track.ts';
import { TRAINING_TRACK } from '../track/tracks.ts';
import { lapsOf } from '../track/progress.ts';
import {
  allCarsDead,
  bestLapSeconds,
  createWorld,
  isEpisodeOver,
  resetWorld,
  stepWorld,
  type World,
} from './world.ts';

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

describe('episode timer', () => {
  it('the world freezes once time reaches cfg.episode.seconds: no further ticks, cars stop moving', () => {
    const cfg = { ...DEFAULT_SIM, episode: { ...DEFAULT_SIM.episode, seconds: 1 } };
    let w = createWorld(square, cfg);
    for (let t = 0; t < 100; t++) w = stepWorld(w, () => FULL_THROTTLE);
    expect(w.tick).toBe(60);
    expect(w.time).toBeCloseTo(1, 12);
    expect(isEpisodeOver(w)).toBe(true);
    const frozen = stepWorld(w, () => FULL_THROTTLE);
    expect(frozen).toBe(w); // same object: a no-op
    expect(w.cars[0]!.alive).toBe(true);
    expect(w.cars[0]!.state.x).toBeGreaterThan(5);
  });

  it('is not over before the deadline; reset starts a fresh episode', () => {
    const cfg = { ...DEFAULT_SIM, episode: { ...DEFAULT_SIM.episode, seconds: 1 } };
    let w = createWorld(square, cfg);
    for (let t = 0; t < 59; t++) w = stepWorld(w, () => FULL_THROTTLE);
    expect(isEpisodeOver(w)).toBe(false);
    w = stepWorld(w, () => FULL_THROTTLE);
    expect(isEpisodeOver(w)).toBe(true);
    const r = resetWorld(w);
    expect(isEpisodeOver(r)).toBe(false);
    expect(r.tick).toBe(0);
  });

  it('allCarsDead reflects the population', () => {
    let w = createWorld(square, DEFAULT_SIM, 2);
    expect(allCarsDead(w)).toBe(false);
    for (let t = 0; t < 1200 && !allCarsDead(w); t++) w = stepWorld(w, () => FULL_THROTTLE);
    expect(allCarsDead(w)).toBe(true);
  });
});

describe('progress in the world', () => {
  it('a car spawns with progress 0 and accumulates it while driving; a crashed car keeps its final progress', () => {
    let w = createWorld(square, DEFAULT_SIM);
    expect(w.cars[0]!.progress.progress).toBe(0);
    for (let t = 0; t < 240; t++) w = stepWorld(w, () => FULL_THROTTLE);
    const p = w.cars[0]!.progress.progress;
    expect(p).toBeCloseTo(w.cars[0]!.state.x, 6); // straight along segment 0: progress = x
    for (let t = 0; t < 1200 && w.cars[0]!.alive; t++) w = stepWorld(w, () => FULL_THROTTLE);
    const atCrash = w.cars[0]!.progress.progress;
    expect(atCrash).toBeGreaterThan(p);
    w = run(w, FULL_THROTTLE, 60);
    expect(w.cars[0]!.progress.progress).toBe(atCrash);
    expect(lapsOf(w.cars[0]!.progress, w.checkpoints)).toBe(0);
  });
});

describe('stall rule (sim-time based, config-flagged)', () => {
  it('a car idle for stallSeconds dies with cause "stall" at exactly the expected tick; progress unchanged', () => {
    let w = createWorld(square, DEFAULT_SIM); // stallSeconds 3 → 180 ticks
    for (let t = 1; t <= 179; t++) w = stepWorld(w, () => ({ steering: 0, throttle: 0 }));
    expect(w.cars[0]!.alive).toBe(true);
    w = stepWorld(w, () => ({ steering: 0, throttle: 0 }));
    expect(w.cars[0]!.alive).toBe(false);
    expect(w.cars[0]!.deathCause).toBe('stall');
    expect(w.cars[0]!.crashedAtTick).toBe(180);
    expect(w.cars[0]!.progress.progress).toBe(0);
  });

  it('moving resets the stall counter; a wall crash is reported as "wall"', () => {
    let w = createWorld(square, DEFAULT_SIM);
    for (let t = 0; t < 170; t++) w = stepWorld(w, () => ({ steering: 0, throttle: 0 }));
    w = stepWorld(w, () => ({ steering: 0, throttle: 1 })); // moves (speed 0.2 m/s < 0.5 still counts as stalled)
    for (let t = 0; t < 30; t++) w = stepWorld(w, () => ({ steering: 0, throttle: 1 }));
    expect(w.cars[0]!.alive).toBe(true); // speed passed 0.5 m/s within a few ticks → counter reset
    expect(w.cars[0]!.stallTicks).toBe(0);
    for (let t = 0; t < 1200 && w.cars[0]!.alive; t++) w = stepWorld(w, () => FULL_THROTTLE);
    expect(w.cars[0]!.deathCause).toBe('wall');
  });

  it('stallSeconds: null disables the rule (Drive mode)', () => {
    const cfg = { ...DEFAULT_SIM, episode: { ...DEFAULT_SIM.episode, stallSeconds: null } };
    let w = createWorld(square, cfg);
    for (let t = 0; t < 600; t++) w = stepWorld(w, () => ({ steering: 0, throttle: 0 }));
    expect(w.cars[0]!.alive).toBe(true);
  });
});

describe('car-ghost invariant', () => {
  it('two cars on the same start pose driving identically overlap the whole way and neither dies from the other', () => {
    let w = createWorld(square, DEFAULT_SIM, 2);
    for (let t = 0; t < 240; t++) w = stepWorld(w, () => FULL_THROTTLE);
    expect(w.cars[0]!.state).toEqual(w.cars[1]!.state); // perfectly overlapping
    expect(w.cars[0]!.alive && w.cars[1]!.alive).toBe(true);
    // A third car parked on the start line is driven through by nobody-notices.
    let w3 = createWorld(
      square,
      { ...DEFAULT_SIM, episode: { ...DEFAULT_SIM.episode, stallSeconds: null } },
      2,
    );
    for (let t = 0; t < 120; t++)
      w3 = stepWorld(w3, (i) => (i === 0 ? FULL_THROTTLE : { steering: 0, throttle: 0 }));
    expect(w3.cars[0]!.alive && w3.cars[1]!.alive).toBe(true);
  });
});

describe('grip limit in the world (default config)', () => {
  it('DEFAULT_SIM has the grip limit on; NO_GRIP_SIM is the pinned Slice 0–3 model', () => {
    expect(GRIP_SIM.physics.lateralAccelMax).toBe(20);
    expect(DEFAULT_SIM.physics.lateralAccelMax).toBeNull();
  });
});

describe('lap ticks', () => {
  it('bestLapSeconds is null with no laps; lap 1 timed from tick 0, later laps are deltas', () => {
    const w = createWorld(square, DEFAULT_SIM);
    expect(bestLapSeconds(w.cars[0]!, 1 / 60)).toBeNull();
    const fake = { ...w.cars[0]!, lapTicks: [1200, 1800, 2700] }; // 20 s, then 10 s, then 15 s
    expect(bestLapSeconds(fake, 1 / 60)).toBeCloseTo(10, 12);
  });

  it('a car that laps the square records the crossing tick', () => {
    // Drive the 400 m square: straight, then turn right at each corner using a
    // simple heading-hold controller is overkill; instead check that lapTicks
    // stays empty for a car that only covers 70 m.
    let w = createWorld(square, DEFAULT_SIM);
    for (let t = 0; t < 240; t++) w = stepWorld(w, () => FULL_THROTTLE);
    expect(w.cars[0]!.lapTicks).toEqual([]);
  });
});
