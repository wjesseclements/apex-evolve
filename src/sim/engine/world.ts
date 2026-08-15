/**
 * Fixed-timestep world: the track plus the cars on it. `stepWorld` advances
 * exactly one tick of `cfg.dt` and is a pure function of its inputs — the
 * frame loop in ui/ decides how many ticks to run per frame; nothing in here
 * knows about wall-clock time or rendering.
 *
 * Slice 0 drives a single car from the keyboard, but the world holds a list
 * of cars so the Slice 2 population engine reuses this unchanged.
 */

import type { PhysicsConfig } from '../config.ts';
import {
  NEUTRAL_CONTROLS,
  createCarState,
  stepCar,
  type CarControls,
  type CarState,
} from '../physics/car.ts';
import { carCollides } from '../track/collision.ts';
import type { Track } from '../track/track.ts';

export interface Car {
  readonly state: CarState;
  /** Last controls applied to this car (for telemetry / rendering). */
  readonly controls: CarControls;
  /** False once the car has touched a track edge; it then freezes in place. */
  readonly alive: boolean;
  /** Tick index at which the car crashed, or null while alive. */
  readonly crashedAtTick: number | null;
  /** Nearest centerline segment last tick — hint for the localized collision search. */
  readonly segmentHint: number;
}

export interface World {
  readonly track: Track;
  readonly cfg: PhysicsConfig;
  readonly cars: readonly Car[];
  /** Number of ticks stepped since creation/reset. */
  readonly tick: number;
  /** Simulated time, seconds (= tick · dt). */
  readonly time: number;
}

/** A car at rest at the track's start pose. */
export function spawnCar(track: Track): Car {
  const { x, y, heading } = track.start;
  return {
    state: createCarState(x, y, heading),
    controls: NEUTRAL_CONTROLS,
    alive: true,
    crashedAtTick: null,
    segmentHint: 0,
  };
}

export function createWorld(track: Track, cfg: PhysicsConfig, carCount = 1): World {
  const cars: Car[] = [];
  for (let i = 0; i < carCount; i++) cars.push(spawnCar(track));
  return { track, cfg, cars, tick: 0, time: 0 };
}

/** Fresh cars at the start pose, tick and time back to zero. */
export function resetWorld(world: World): World {
  return createWorld(world.track, world.cfg, world.cars.length);
}

/**
 * Advance one car by one tick. Dead cars are returned unchanged (frozen).
 * A car that leaves the track this tick keeps the state that put it there —
 * so it renders touching the wall — and is marked dead.
 */
export function stepCarOnTrack(
  car: Car,
  controls: CarControls,
  track: Track,
  cfg: PhysicsConfig,
): Car {
  if (!car.alive) return car;
  const state = stepCar(car.state, controls, cfg);
  const hit = carCollides(track, state, cfg, car.segmentHint);
  return {
    state,
    controls,
    alive: !hit.collided,
    crashedAtTick: hit.collided ? null : car.crashedAtTick,
    segmentHint: hit.segment,
  };
}

/**
 * Advance the whole world one tick. `controlsFor(i)` supplies the controls for
 * car i (keyboard now, neural networks later). Pure: returns a new World.
 */
export function stepWorld(
  world: World,
  controlsFor: (carIndex: number, car: Car) => CarControls,
): World {
  const tick = world.tick + 1;
  const cars = world.cars.map((car, i) => {
    const next = stepCarOnTrack(car, controlsFor(i, car), world.track, world.cfg);
    return next.alive || !car.alive ? next : { ...next, crashedAtTick: tick };
  });
  return { ...world, cars, tick, time: tick * world.cfg.dt };
}
