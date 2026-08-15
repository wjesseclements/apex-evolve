import { describe, expect, it } from 'vitest';
import { rampSteering, smoothKeyboardControls, type SteerRampConfig } from './inputSmoothing.ts';

const CFG: SteerRampConfig = { windOnRate: 2, returnRate: 4 };
const dt = 0.1;

describe('rampSteering', () => {
  it('winds on toward the target at windOnRate', () => {
    expect(rampSteering(0, 1, dt, CFG)).toBeCloseTo(0.2, 12);
    expect(rampSteering(0.9, 1, dt, CFG)).toBe(1); // clamps at target, no overshoot
  });

  it('returns to centre at returnRate (faster than winding on)', () => {
    expect(rampSteering(1, 0, dt, CFG)).toBeCloseTo(0.6, 12);
    expect(rampSteering(0.3, 0, dt, CFG)).toBe(0);
  });

  it('crossing from right to left uses the return rate', () => {
    expect(rampSteering(0.5, -1, dt, CFG)).toBeCloseTo(0.1, 12);
  });

  it('is symmetric for left', () => {
    expect(rampSteering(0, -1, dt, CFG)).toBeCloseTo(-0.2, 12);
    expect(rampSteering(-1, 0, dt, CFG)).toBeCloseTo(-0.6, 12);
  });

  it('holds the target once reached', () => {
    expect(rampSteering(1, 1, dt, CFG)).toBe(1);
    expect(rampSteering(0, 0, dt, CFG)).toBe(0);
  });
});

describe('smoothKeyboardControls', () => {
  it('ramps steering but passes throttle straight through', () => {
    const c = smoothKeyboardControls(
      { steering: 0, throttle: 0 },
      { steering: 1, throttle: -1 },
      dt,
      CFG,
    );
    expect(c).toEqual({ steering: 0.2, throttle: -1 });
  });
});
