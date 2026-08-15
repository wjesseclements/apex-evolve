/**
 * World ↔ screen mapping. The world is y-DOWN (docs/CONVENTIONS.md), exactly
 * like the Canvas, so this is a pure uniform scale + translate: no axis flip,
 * no rotation. Screen units are CSS pixels; devicePixelRatio is handled by
 * the canvas setup, not here.
 */

import type { Vec2 } from '../sim/math/vec2.ts';

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface Camera {
  /** Pixels per meter. */
  readonly scale: number;
  /** Screen position (px) of world origin. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Fit `bounds` (meters) into a `width × height` viewport (px), preserving
 * aspect ratio, centered, with `padding` px on every side.
 */
export function fitCamera(bounds: Bounds, width: number, height: number, padding = 24): Camera {
  const bw = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const bh = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const availW = Math.max(width - 2 * padding, 1);
  const availH = Math.max(height - 2 * padding, 1);
  const scale = Math.min(availW / bw, availH / bh);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    offsetX: width / 2 - cx * scale,
    offsetY: height / 2 - cy * scale,
  };
}

export function worldToScreen(cam: Camera, p: Vec2): Vec2 {
  return { x: cam.offsetX + p.x * cam.scale, y: cam.offsetY + p.y * cam.scale };
}

export function screenToWorld(cam: Camera, p: Vec2): Vec2 {
  return { x: (p.x - cam.offsetX) / cam.scale, y: (p.y - cam.offsetY) / cam.scale };
}
