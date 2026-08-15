/**
 * Minimal 2D vector helpers for the simulation core.
 *
 * Coordinate conventions (locked project-wide, see docs/CONVENTIONS.md):
 * - Units are meters. +x is right (east), +y is DOWN (south) — screen-native.
 * - Angles are radians. Angle 0 points along +x; positive angles rotate
 *   clockwise on screen (from +x toward +y).
 *
 * All functions are pure and allocate a fresh result; none mutate inputs.
 * Transcendentals come from ./dmath.ts so results are bit-identical across
 * JS engines (Math.hypot / Math.sin / Math.cos are not).
 */

import { cos, hypot2, sin } from './dmath.ts';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** 2D cross product (z-component of the 3D cross product). */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function length(a: Vec2): number {
  return hypot2(a.x, a.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return hypot2(a.x - b.x, a.y - b.y);
}

/** Unit vector in the direction of `a`; returns (0,0) for the zero vector. */
export function normalize(a: Vec2): Vec2 {
  const len = hypot2(a.x, a.y);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

/** Unit vector pointing along `angle` (radians, 0 = +x, clockwise-positive on screen). */
export function fromAngle(angle: number): Vec2 {
  return { x: cos(angle), y: sin(angle) };
}

/**
 * Perpendicular to `d` on the LEFT of the direction of travel.
 * With +y down on screen, facing east (1,0) → left is screen-up (0,-1).
 */
export function leftNormal(d: Vec2): Vec2 {
  return { x: d.y, y: -d.x };
}

/**
 * Perpendicular to `d` on the RIGHT of the direction of travel.
 * With +y down on screen, facing east (1,0) → right is screen-down (0,1).
 */
export function rightNormal(d: Vec2): Vec2 {
  return { x: -d.y, y: d.x };
}

/** Rotate `a` by `angle` radians (positive = clockwise on screen, per convention). */
export function rotate(a: Vec2, angle: number): Vec2 {
  const c = cos(angle);
  const s = sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}
