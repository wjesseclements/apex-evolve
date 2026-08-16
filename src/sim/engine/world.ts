/**
 * Fixed-timestep world: the track plus the cars on it. `stepWorld` advances
 * exactly one tick of `cfg.physics.dt` and is a pure function of its inputs — the
 * frame loop in ui/ decides how many ticks to run per frame; nothing in here
 * knows about wall-clock time or rendering.
 *
 * Slice 0 drives a single car from the keyboard, but the world holds a list
 * of cars so the Slice 2 population engine reuses this unchanged.
 */

import type { SimConfig } from '../config.ts';
import {
  NEUTRAL_CONTROLS,
  createCarState,
  stepCar,
  type CarControls,
  type CarState,
} from '../physics/car.ts';
import { senseCar, type SensorReading } from '../sensors/sensors.ts';
import { buildCheckpoints, type Checkpoints } from '../track/checkpoints.ts';
import { carCollides } from '../track/collision.ts';
import { initialProgress, lapsOf, updateProgress, type ProgressState } from '../track/progress.ts';
import type { Track } from '../track/track.ts';

export interface Car {
  readonly state: CarState;
  /** Last controls applied to this car (for telemetry / rendering). */
  readonly controls: CarControls;
  /** False once the car has died (wall contact or stall); it then freezes in place. */
  readonly alive: boolean;
  /** Tick index at which the car died, or null while alive. */
  readonly crashedAtTick: number | null;
  /** Why the car died: 'wall' = touched a track edge, 'stall' = idle past the stall rule. */
  readonly deathCause: 'wall' | 'stall' | null;
  /** Consecutive ticks spent below the stall speed threshold. */
  readonly stallTicks: number;
  /** Nearest centerline segment last tick — hint for the localized collision search. */
  readonly segmentHint: number;
  /**
   * Sensor reading taken at the END of the tick that produced `state` (or at
   * spawn). This is the observation a driver uses to choose the NEXT tick's
   * controls. Frozen (dead) cars keep their last reading.
   */
  readonly sensors: SensorReading;
  /** Checkpoint/progress bookkeeping (see track/progress.ts). Frozen when dead. */
  readonly progress: ProgressState;
  /** Tick at which each completed lap was crossed (lapTicks[k] = end of lap k+1). */
  readonly lapTicks: readonly number[];
}

export interface World {
  readonly track: Track;
  readonly cfg: SimConfig;
  /** Checkpoints derived from track + cfg.progress at world creation. */
  readonly checkpoints: Checkpoints;
  readonly cars: readonly Car[];
  /** Number of ticks stepped since creation/reset. */
  readonly tick: number;
  /** Simulated time, seconds (= tick · dt). */
  readonly time: number;
}

/** A car at rest at the track's start pose. */
export function spawnCar(track: Track, cfg: SimConfig, checkpoints: Checkpoints): Car {
  const { x, y, heading } = track.start;
  const state = createCarState(x, y, heading);
  return {
    state,
    controls: NEUTRAL_CONTROLS,
    alive: true,
    crashedAtTick: null,
    deathCause: null,
    stallTicks: 0,
    segmentHint: 0,
    sensors: senseCar(track, state, 0, cfg),
    progress: initialProgress(track, checkpoints, state, 0),
    lapTicks: [],
  };
}

export function createWorld(track: Track, cfg: SimConfig, carCount = 1): World {
  const checkpoints = buildCheckpoints(track, cfg.progress.checkpointSpacing);
  const cars: Car[] = [];
  for (let i = 0; i < carCount; i++) cars.push(spawnCar(track, cfg, checkpoints));
  return { track, cfg, checkpoints, cars, tick: 0, time: 0 };
}

/** True once simulated time has reached the configured episode length. */
export function isEpisodeOver(world: World): boolean {
  return world.time >= world.cfg.episode.seconds - 1e-9;
}

/** True when no car is alive (the episode can end early). */
export function allCarsDead(world: World): boolean {
  return world.cars.every((c) => !c.alive);
}

/** Fresh cars at the start pose, tick and time back to zero. */
export function resetWorld(world: World): World {
  return createWorld(world.track, world.cfg, world.cars.length);
}

/**
 * Advance one car by one tick. Dead cars are returned unchanged (frozen).
 * A car that leaves the track this tick keeps the state that put it there —
 * so it renders touching the wall — and is marked dead ('wall'). A car idle
 * past the stall rule dies in place ('stall').
 *
 * CAR-GHOST INVARIANT: cars never interact. There is no inter-car collision;
 * all cars spawn on the same start pose and may overlap freely for the whole
 * episode. Each car sees only the track (rays) and its own speed.
 */
export function stepCarOnTrack(
  car: Car,
  controls: CarControls,
  track: Track,
  cfg: SimConfig,
  checkpoints: Checkpoints,
  tick: number,
): Car {
  if (!car.alive) return car;
  const state = stepCar(car.state, controls, cfg.physics);
  const hit = carCollides(track, state, cfg.physics, car.segmentHint);
  const stallTicks = state.speed < cfg.episode.stallSpeed ? car.stallTicks + 1 : 0;
  const stalled =
    cfg.episode.stallSeconds !== null &&
    stallTicks * cfg.physics.dt >= cfg.episode.stallSeconds - 1e-9;
  const deathCause: Car['deathCause'] = hit.collided ? 'wall' : stalled ? 'stall' : null;
  const progress = updateProgress(track, checkpoints, car.progress, state);
  return {
    state,
    controls,
    alive: deathCause === null,
    crashedAtTick: car.crashedAtTick,
    deathCause,
    stallTicks,
    segmentHint: hit.segment,
    // A car that just hit the wall keeps its previous (on-track) reading;
    // sensing from an off-track origin would report all-zero rays.
    sensors: hit.collided ? car.sensors : senseCar(track, state, hit.segment, cfg),
    // Progress is still credited for the tick of the crash: the car did travel there.
    progress,
    lapTicks:
      lapsOf(progress, checkpoints) > lapsOf(car.progress, checkpoints)
        ? [...car.lapTicks, tick]
        : car.lapTicks,
  };
}

/**
 * Sim-seconds of the car's fastest completed lap, or null. Lap 1 is timed
 * from the standing start at tick 0; later laps are flying laps.
 */
export function bestLapSeconds(car: Car, dt: number): number | null {
  let best: number | null = null;
  let prev = 0;
  for (const t of car.lapTicks) {
    const lap = (t - prev) * dt;
    if (best === null || lap < best) best = lap;
    prev = t;
  }
  return best;
}

/**
 * Advance the whole world one tick. `controlsFor(i)` supplies the controls for
 * car i (keyboard now, neural networks later). Pure: returns a new World.
 * Once the episode timer has elapsed the world is frozen: the same World is
 * returned unchanged (tick and time stop too).
 */
export function stepWorld(
  world: World,
  controlsFor: (carIndex: number, car: Car) => CarControls,
): World {
  if (isEpisodeOver(world)) return world;
  const tick = world.tick + 1;
  const cars = world.cars.map((car, i) => {
    const next = stepCarOnTrack(
      car,
      controlsFor(i, car),
      world.track,
      world.cfg,
      world.checkpoints,
      tick,
    );
    return next.alive || !car.alive ? next : { ...next, crashedAtTick: tick };
  });
  return { ...world, cars, tick, time: tick * world.cfg.physics.dt };
}
