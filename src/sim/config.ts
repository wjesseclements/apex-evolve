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
 * reachable in ~4.6 s from rest; minimum turn radius = 30/3 = 10 m.
 */
export const DEFAULT_PHYSICS: PhysicsConfig = {
  dt: 1 / 60,
  vMax: 30,
  accel: 12,
  drag: 0.3,
  steerRate: 3.0,
  carLength: 4.0,
  carWidth: 1.8,
};
