import type { CarControls } from '../sim/physics/car.ts';

/**
 * Keyboard input is bang-bang (−1 / 0 / +1). Feeding full lock straight into
 * the car makes it undrivable by hand at speed, so the UI ramps the *applied*
 * steering toward the key target each tick, and returns it to centre faster
 * than it winds on. This lives in ui/ on purpose: it is a property of the
 * input device, not of the car — the neural-network drivers in later slices
 * emit continuous steering and bypass this entirely.
 *
 * Throttle is applied directly (no ramp).
 */
export interface SteerRampConfig {
  /** Rate at which |steering| increases toward the target, per second (1 = full lock in 1 s). */
  readonly windOnRate: number;
  /** Rate at which steering returns toward zero, per second. */
  readonly returnRate: number;
}

export const KEYBOARD_STEER_RAMP: SteerRampConfig = {
  windOnRate: 2.5, // full lock in 0.4 s
  returnRate: 6, // back to centre in ~0.17 s
};

/** One tick of steering ramp: move `applied` toward `target` at the configured rate. */
export function rampSteering(
  applied: number,
  target: number,
  dt: number,
  cfg: SteerRampConfig,
): number {
  // Winding on = increasing |steering| in the direction already applied (or from
  // centre). Anything else (easing off, returning to centre, crossing over) uses
  // the faster return rate.
  const windingOn =
    Math.abs(target) > Math.abs(applied) &&
    (applied === 0 || Math.sign(target) === Math.sign(applied));
  const rate = windingOn ? cfg.windOnRate : cfg.returnRate;
  const maxStep = rate * dt;
  const delta = target - applied;
  if (Math.abs(delta) <= maxStep) return target;
  return applied + Math.sign(delta) * maxStep;
}

/** Apply the steering ramp to a raw keyboard control sample. */
export function smoothKeyboardControls(
  previous: CarControls,
  raw: CarControls,
  dt: number,
  cfg: SteerRampConfig = KEYBOARD_STEER_RAMP,
): CarControls {
  return {
    steering: rampSteering(previous.steering, raw.steering, dt, cfg),
    throttle: raw.throttle,
  };
}
