import { describe, expect, it } from 'vitest';
import { expectVec2 } from '../testing/expectVec2.ts';
import {
  add,
  cross,
  distance,
  dot,
  fromAngle,
  leftNormal,
  length,
  normalize,
  rightNormal,
  rotate,
  scale,
  sub,
  vec2,
} from './vec2.ts';

describe('vec2 basics', () => {
  it('adds, subtracts, scales', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
    expect(sub(vec2(1, 2), vec2(3, 4))).toEqual({ x: -2, y: -2 });
    expect(scale(vec2(1, -2), 3)).toEqual({ x: 3, y: -6 });
  });

  it('dot, cross, length, distance', () => {
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
    expect(cross(vec2(1, 0), vec2(0, 1))).toBe(1);
    expect(cross(vec2(0, 1), vec2(1, 0))).toBe(-1);
    expect(length(vec2(3, 4))).toBe(5);
    expect(distance(vec2(1, 1), vec2(4, 5))).toBe(5);
  });

  it('normalizes and handles the zero vector', () => {
    expect(normalize(vec2(0, 5))).toEqual({ x: 0, y: 1 });
    expect(normalize(vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });
});

describe('vec2 conventions (y-down, clockwise-positive angles)', () => {
  it('fromAngle(0) points east (+x); +90° points screen-down (+y)', () => {
    expectVec2(fromAngle(0), { x: 1, y: 0 });
    expectVec2(fromAngle(Math.PI / 2), { x: 0, y: 1 });
  });

  it('leftNormal of east-facing travel is screen-up (0,-1); rightNormal is (0,1)', () => {
    expectVec2(leftNormal(vec2(1, 0)), { x: 0, y: -1 });
    expectVec2(rightNormal(vec2(1, 0)), { x: 0, y: 1 });
  });

  it('leftNormal of south-facing travel (0,1) is east (1,0)', () => {
    // Facing down the screen, your left hand points to screen-right.
    expectVec2(leftNormal(vec2(0, 1)), { x: 1, y: 0 });
    expectVec2(rightNormal(vec2(0, 1)), { x: -1, y: 0 });
  });

  it('rotate by +90° turns east into screen-down (clockwise on screen)', () => {
    expectVec2(rotate(vec2(1, 0), Math.PI / 2), { x: 0, y: 1 });
  });
});
