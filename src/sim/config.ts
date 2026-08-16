/**
 * Single typed home for all simulation constants (CLAUDE.md: no magic numbers
 * scattered in logic). Every value is documented with its unit.
 *
 * Units: meters, seconds, radians. See docs/CONVENTIONS.md.
 */

export interface PhysicsConfig {
  /** Fixed simulation timestep, seconds. Rendering framerate must never affect this. */
  readonly dt: number;
  /** Maximum forward speed, m/s. Speed is clamped to [0, vMax]. */
  readonly vMax: number;
  /** Full-throttle acceleration (and full-brake deceleration), m/s². */
  readonly accel: number;
  /** Linear drag coefficient, 1/s: each tick v *= (1 - drag·dt). Terminal speed accel/drag must exceed vMax. */
  readonly drag: number;
  /** Yaw rate at full steering and v = vMax, rad/s. Minimum turn radius = vMax / steerRate (speed-independent). */
  readonly steerRate: number;
  /** Car body length (along heading), meters. Used for collision corners and rendering. */
  readonly carLength: number;
  /** Car body width (across heading), meters. */
  readonly carWidth: number;
}

/**
 * Default arcade-model constants. Tuned by feel in Slice 0; final values are
 * reported at each slice's demo gate.
 *
 * With these numbers: terminal speed (accel/drag) = 40 m/s > vMax, so vMax is
 * reachable in ~4.6 s from rest; minimum turn radius = 30/2.5 = 12 m.
 */
export const DEFAULT_PHYSICS: PhysicsConfig = {
  dt: 1 / 60,
  vMax: 30,
  accel: 12,
  drag: 0.3,
  steerRate: 2.5,
  carLength: 4.0,
  carWidth: 1.8,
};

export interface SensorConfig {
  /**
   * Ray angles relative to the car's heading, radians. Negative = car's LEFT,
   * positive = car's RIGHT (same sign convention as steering). SPEC: 7 rays at
   * [−90°, −60°, −30°, 0°, +30°, +60°, +90°].
   */
  readonly angles: readonly number[];
  /** Maximum ray length, meters. Readings are distance / range, clamped to [0, 1]. */
  readonly range: number;
}

const DEG = Math.PI / 180;

export const DEFAULT_SENSORS: SensorConfig = {
  angles: [-90 * DEG, -60 * DEG, -30 * DEG, 0, 30 * DEG, 60 * DEG, 90 * DEG],
  // ~2 s of look-ahead at vMax; the longest straight on the training track is 80 m.
  range: 60,
};

export interface ProgressConfig {
  /** Target arc-length spacing between checkpoints along the centerline, meters. */
  readonly checkpointSpacing: number;
}

export const DEFAULT_PROGRESS: ProgressConfig = {
  checkpointSpacing: 5,
};

export interface EpisodeConfig {
  /** Episode length in simulated seconds; when reached the world stops advancing. */
  readonly seconds: number;
}

export const DEFAULT_EPISODE: EpisodeConfig = {
  seconds: 30,
};

/** Everything the simulation needs to run one world. */
export interface SimConfig {
  readonly physics: PhysicsConfig;
  readonly sensors: SensorConfig;
  readonly progress: ProgressConfig;
  readonly episode: EpisodeConfig;
}

export const DEFAULT_SIM: SimConfig = {
  physics: DEFAULT_PHYSICS,
  sensors: DEFAULT_SENSORS,
  progress: DEFAULT_PROGRESS,
  episode: DEFAULT_EPISODE,
};

export interface NetworkTopology {
  readonly inputs: number;
  readonly hidden: number;
  readonly outputs: number;
}

/** SPEC: 8 inputs (7 rays + speed) → 10 tanh hidden → 2 tanh outputs (steering, throttle). */
export const DEFAULT_NN: NetworkTopology = { inputs: 8, hidden: 10, outputs: 2 };
