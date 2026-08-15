/**
 * Arcade car model — pure kinematics, no forces (SPEC.md "Car physics").
 *
 * Conventions (docs/CONVENTIONS.md):
 * - Units: meters, seconds, radians.
 * - +x right, +y DOWN on screen. Heading 0 = +x; heading increases clockwise
 *   on screen. Direction of travel = (cos θ, sin θ).
 * - steering ∈ [-1, 1]: +1 = full right (clockwise on screen), -1 = full left.
 * - throttle ∈ [-1, 1]: +1 = full throttle, -1 = full brake. No reverse gear:
 *   speed is clamped to [0, vMax].
 *
 * Per-tick update order (exactly as SPEC):
 *   1. v += throttle · accel · dt; clamp to [0, vMax]
 *   2. v *= (1 − drag · dt)
 *   3. θ += steering · steerRate · (v / vMax) · dt   (no turning at standstill)
 *   4. position += (cos θ, sin θ) · v · dt
 *
 * `stepCar` is a pure function of (state, controls, config): same inputs ⇒
 * bit-identical output. Heading is left unwrapped.
 */

import type { PhysicsConfig } from '../config.ts';
import { fromAngle, leftNormal, type Vec2 } from '../math/vec2.ts';

export interface CarState {
  /** Position of the car's geometric center, meters. */
  readonly x: number;
  readonly y: number;
  /** Heading θ, radians, unwrapped. 0 = +x, clockwise-positive on screen. */
  readonly heading: number;
  /** Forward speed, m/s, always within [0, vMax]. */
  readonly speed: number;
}

export interface CarControls {
  /** [-1, 1]; positive = turn right (clockwise on screen). */
  readonly steering: number;
  /** [-1, 1]; negative = brake. */
  readonly throttle: number;
}

export const NEUTRAL_CONTROLS: CarControls = { steering: 0, throttle: 0 };

function clampUnit(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/** Clamp both control channels into [-1, 1]. */
export function clampControls(c: CarControls): CarControls {
  return { steering: clampUnit(c.steering), throttle: clampUnit(c.throttle) };
}

/** Car at rest at (x, y) facing `heading`. */
export function createCarState(x: number, y: number, heading: number): CarState {
  return { x, y, heading, speed: 0 };
}

/**
 * Advance the car by one fixed timestep `cfg.dt`. Pure; does not mutate.
 * Controls are clamped to [-1, 1] before use.
 */
export function stepCar(state: CarState, controls: CarControls, cfg: PhysicsConfig): CarState {
  const { steering, throttle } = clampControls(controls);
  const dt = cfg.dt;

  // 1. throttle / brake, clamped — no reverse.
  let speed = state.speed + throttle * cfg.accel * dt;
  if (speed < 0) speed = 0;
  else if (speed > cfg.vMax) speed = cfg.vMax;

  // 2. drag
  speed *= 1 - cfg.drag * dt;

  // 3. yaw — scaled by speed so the car cannot turn at standstill.
  const heading = state.heading + steering * cfg.steerRate * (speed / cfg.vMax) * dt;

  // 4. translate along the (new) heading.
  const x = state.x + Math.cos(heading) * speed * dt;
  const y = state.y + Math.sin(heading) * speed * dt;

  return { x, y, heading, speed };
}

/**
 * The four corners of the car's body rectangle in world coordinates, in the
 * order [front-left, front-right, rear-right, rear-left] (a closed polygon
 * winding clockwise on screen). "Left" is the car's own left — with the car
 * facing east (+x), the front-left corner is at (+L/2, −W/2), i.e. screen-up.
 */
export function carCorners(state: CarState, cfg: PhysicsConfig): readonly [Vec2, Vec2, Vec2, Vec2] {
  const fwd = fromAngle(state.heading);
  const left = leftNormal(fwd);
  const hl = cfg.carLength / 2;
  const hw = cfg.carWidth / 2;
  const fx = fwd.x * hl;
  const fy = fwd.y * hl;
  const lx = left.x * hw;
  const ly = left.y * hw;
  return [
    { x: state.x + fx + lx, y: state.y + fy + ly }, // front-left
    { x: state.x + fx - lx, y: state.y + fy - ly }, // front-right
    { x: state.x - fx - lx, y: state.y - fy - ly }, // rear-right
    { x: state.x - fx + lx, y: state.y - fy + ly }, // rear-left
  ];
}
