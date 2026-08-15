/**
 * Car sensors = the neural network's inputs (SPEC "Sensors"):
 *   7 ray distances at angles [−90°, −60°, −30°, 0°, +30°, +60°, +90°]
 *   relative to heading (negative = car's LEFT, positive = RIGHT — the same
 *   sign convention as steering), each normalized by the sensor range and
 *   clamped to [0, 1]; then normalized speed v / vMax. 8 inputs total, all in
 *   [0, 1].
 *
 * RAY ORIGIN vs COLLISION BODY — read this before diagnosing "the ray said
 * 2 m but the car crashed": rays are cast from the car's CENTRE (SPEC), while
 * collision is tested on the four corners of the car's body rectangle
 * (carLength × carWidth). So at the moment the nose touches a wall head-on the
 * forward ray still reads carLength/2 (2.0 m by default), a side ray reads
 * ≥ carWidth/2 when the flank touches, and rays never read 0 for a living car.
 * That offset is intentional and constant; the network can learn it. What a
 * ray reads is exact distance from the centre to the rendered edge.
 */

import type { SensorConfig, SimConfig } from '../config.ts';
import { cos, sin } from '../math/dmath.ts';
import type { CarState } from '../physics/car.ts';
import type { Track } from '../track/track.ts';
import { castRay, type RayHit } from './raycast.ts';

/** Number of NN inputs: one per ray plus normalized speed. */
export const SENSOR_INPUT_COUNT = 8;

export interface SensorReading {
  /** One entry per configured ray angle, in order. */
  readonly rays: readonly RayHit[];
  /** The 8 NN inputs, all in [0, 1]: normalized ray distances then v / vMax. */
  readonly inputs: readonly number[];
}

/** Normalized reading for one ray: min(distance, range) / range. */
export function normalizeRay(hit: RayHit, range: number): number {
  const d = hit.distance < range ? hit.distance : range;
  return d < 0 ? 0 : d / range;
}

/** Cast all configured rays from the car centre. */
export function castCarRays(
  track: Track,
  car: CarState,
  segmentHint: number,
  cfg: SensorConfig,
): RayHit[] {
  const origin = { x: car.x, y: car.y };
  const rays: RayHit[] = [];
  for (const a of cfg.angles) {
    const angle = car.heading + a;
    rays.push(castRay(track, origin, { x: cos(angle), y: sin(angle) }, cfg.range, segmentHint));
  }
  return rays;
}

/** Full sensor reading (rays + NN inputs) for a car at `car`. */
export function senseCar(
  track: Track,
  car: CarState,
  segmentHint: number,
  cfg: SimConfig,
): SensorReading {
  const rays = castCarRays(track, car, segmentHint, cfg.sensors);
  const inputs: number[] = rays.map((r) => normalizeRay(r, cfg.sensors.range));
  const v = car.speed / cfg.physics.vMax;
  inputs.push(v < 0 ? 0 : v > 1 ? 1 : v);
  return { rays, inputs };
}
