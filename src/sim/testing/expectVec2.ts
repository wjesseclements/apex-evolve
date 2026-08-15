import { expect } from 'vitest';
import type { Vec2 } from '../math/vec2.ts';

/**
 * Assert two vectors are equal to within `digits` decimal places. Uses
 * toBeCloseTo so that -0 and floating-point noise do not fail geometry tests
 * whose expected values are hand-computed.
 */
export function expectVec2(actual: Vec2, expected: Vec2, digits = 9): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}
