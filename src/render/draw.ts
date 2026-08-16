/**
 * Canvas 2D drawing of the world. Depends on sim/ only; never on ui/ or React.
 * All geometry comes from sim/ (edges, car corners); this file only maps it
 * through the camera and paints — no simulation logic lives here.
 */

import type { Car, World } from '../sim/engine/world.ts';
import type { Vec2 } from '../sim/math/vec2.ts';
import { carCorners } from '../sim/physics/car.ts';
import { pointAtArc, type Checkpoints } from '../sim/track/checkpoints.ts';
import { nextCheckpointIndex } from '../sim/track/progress.ts';
import type { Track } from '../sim/track/track.ts';
import { worldToScreen, type Camera } from './camera.ts';

export interface RenderOptions {
  /** Colour left/right edges differently and label them, draw the car's heading ray. */
  readonly debug: boolean;
  /** Draw sensor rays (from the car centre to each ray's end point) on the focused car. */
  readonly showSensors: boolean;
  /** Car drawn highlighted and on top (the driver's car, or the live leader). */
  readonly focusIndex: number;
}

export const COLORS = {
  background: '#0f1115',
  asphalt: '#2a2d34',
  edge: '#e6e6e6',
  edgeLeft: '#ff5c5c',
  edgeRight: '#4da3ff',
  startLine: '#f5d76e',
  carAlive: '#7CFC00',
  carNose: '#ffffff',
  carDead: '#8a2c2c',
  carDim: 'rgba(124, 252, 0, 0.45)',
  carDimDead: 'rgba(138, 44, 44, 0.45)',
  carFocus: '#ffd166',
  centerline: '#3c404a',
  debugText: '#ffd166',
  rayNear: '#ff5c5c',
  rayFar: '#7CFC00',
  rayMiss: 'rgba(230,230,230,0.35)',
  checkpoint: 'rgba(230,230,230,0.22)',
  checkpointNext: '#ffd166',
} as const;

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  width: number,
  height: number,
  opts: RenderOptions,
): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);
  drawTrack(ctx, world.track, cam, opts);
  if (opts.debug) drawCheckpoints(ctx, world, cam);
  const many = world.cars.length > 1;
  // Dead cars first, then living ones, then the focused car on top.
  for (let pass = 0; pass < 2; pass++) {
    world.cars.forEach((car, i) => {
      if (i === opts.focusIndex) return;
      if ((pass === 0) !== !car.alive) return;
      drawCar(ctx, car, world, cam, opts, many ? 'dim' : 'normal');
    });
  }
  const focus = world.cars[opts.focusIndex];
  if (focus) {
    drawCar(ctx, focus, world, cam, opts, many ? 'focus' : 'normal');
    if (opts.showSensors) drawSensors(ctx, focus, world, cam);
  }
}

/**
 * Debug overlay: a short tick across the centerline at every checkpoint, with
 * the driven car's NEXT checkpoint highlighted, so progress accounting can be
 * checked by eye.
 */
export function drawCheckpoints(ctx: CanvasRenderingContext2D, world: World, cam: Camera): void {
  const cps: Checkpoints = world.checkpoints;
  const track = world.track;
  const driven = world.cars[0];
  const next = driven ? nextCheckpointIndex(driven.progress, cps) : -1;
  ctx.save();
  for (let i = 0; i < cps.count; i++) {
    const arc = cps.arcs[i];
    if (arc === undefined) continue;
    const c = pointAtArc(track, arc);
    const ahead = pointAtArc(track, arc + 0.5);
    // Perpendicular to the local direction of travel, ±(width/4) either side.
    let dx = ahead.x - c.x;
    let dy = ahead.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const h = track.width / 4;
    const a = worldToScreen(cam, { x: c.x + dy * h, y: c.y - dx * h });
    const b = worldToScreen(cam, { x: c.x - dy * h, y: c.y + dx * h });
    ctx.strokeStyle = i === next ? COLORS.checkpointNext : COLORS.checkpoint;
    ctx.lineWidth = i === next ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Sensor rays for one car: a line from the car centre to each ray's end point,
 * red→green by normalized distance, with a dot at the wall hit; rays that
 * reach max range without a hit are drawn faint. Rays are read from the car's
 * stored SensorReading — no geometry is recomputed here.
 */
export function drawSensors(
  ctx: CanvasRenderingContext2D,
  car: Car,
  world: World,
  cam: Camera,
): void {
  const range = world.cfg.sensors.range;
  const c = worldToScreen(cam, car.state);
  ctx.save();
  ctx.lineWidth = 1.5;
  for (const ray of car.sensors.rays) {
    const e = worldToScreen(cam, ray);
    const f = Math.min(ray.distance / range, 1);
    ctx.strokeStyle = ray.hit ? mixColor(COLORS.rayNear, COLORS.rayFar, f) : COLORS.rayMiss;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    if (ray.hit) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Linear blend of two #rrggbb colours (f = 0 → a, f = 1 → b). */
function mixColor(a: string, b: string, f: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 0xff;
    const vb = (pb >> shift) & 0xff;
    return Math.round(va + (vb - va) * f);
  };
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function polyline(
  ctx: CanvasRenderingContext2D,
  pts: readonly Vec2[],
  cam: Camera,
  close: boolean,
): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = worldToScreen(cam, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  if (close) ctx.closePath();
}

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  track: Track,
  cam: Camera,
  opts: RenderOptions,
): void {
  // Asphalt: the ring between the two edges (even-odd fill of both loops).
  ctx.save();
  polyline(ctx, track.leftEdge, cam, true);
  const first = track.rightEdge[0];
  if (first) {
    const s = worldToScreen(cam, first);
    ctx.moveTo(s.x, s.y);
    track.rightEdge.forEach((p, i) => {
      if (i === 0) return;
      const q = worldToScreen(cam, p);
      ctx.lineTo(q.x, q.y);
    });
    ctx.closePath();
  }
  ctx.fillStyle = COLORS.asphalt;
  ctx.fill('evenodd');
  ctx.restore();

  // Faint centerline (direction of travel is the point order).
  ctx.save();
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = COLORS.centerline;
  ctx.lineWidth = 1;
  polyline(ctx, track.centerline, cam, true);
  ctx.stroke();
  ctx.restore();

  // Edges.
  ctx.lineWidth = 2;
  ctx.strokeStyle = opts.debug ? COLORS.edgeLeft : COLORS.edge;
  polyline(ctx, track.leftEdge, cam, true);
  ctx.stroke();
  ctx.strokeStyle = opts.debug ? COLORS.edgeRight : COLORS.edge;
  polyline(ctx, track.rightEdge, cam, true);
  ctx.stroke();

  // Start/finish line across the track at vertex 0, plus a direction arrow.
  const l0 = track.leftEdge[0];
  const r0 = track.rightEdge[0];
  const c0 = track.centerline[0];
  const c1 = track.centerline[1];
  if (l0 && r0 && c0 && c1) {
    const a = worldToScreen(cam, l0);
    const b = worldToScreen(cam, r0);
    ctx.save();
    ctx.strokeStyle = COLORS.startLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();

    // Arrow along the direction of travel, offset a little down the track.
    const dx = c1.x - c0.x;
    const dy = c1.y - c0.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const tail = worldToScreen(cam, { x: c0.x + ux * 5, y: c0.y + uy * 5 });
    const head = worldToScreen(cam, { x: c0.x + ux * 11, y: c0.y + uy * 11 });
    drawArrow(ctx, tail, head, COLORS.startLine);
  }

  if (opts.debug) {
    ctx.save();
    ctx.fillStyle = COLORS.debugText;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    // Label the edges near vertex 0 (the start).
    if (l0) {
      const s = worldToScreen(cam, l0);
      ctx.fillStyle = COLORS.edgeLeft;
      ctx.fillText('LEFT edge', s.x + 6, s.y - 10);
    }
    if (r0) {
      const s = worldToScreen(cam, r0);
      ctx.fillStyle = COLORS.edgeRight;
      ctx.fillText('RIGHT edge', s.x + 6, s.y + 10);
    }
    ctx.restore();
  }
}

export type CarStyle = 'normal' | 'dim' | 'focus';

export function drawCar(
  ctx: CanvasRenderingContext2D,
  car: Car,
  world: World,
  cam: Camera,
  opts: RenderOptions,
  style: CarStyle = 'normal',
): void {
  const [fl, fr, rr, rl] = carCorners(car.state, world.cfg.physics);
  const pts = [fl, fr, rr, rl].map((p) => worldToScreen(cam, p));
  const [sfl, sfr, srr, srl] = pts;
  if (!sfl || !sfr || !srr || !srl) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sfl.x, sfl.y);
  ctx.lineTo(sfr.x, sfr.y);
  ctx.lineTo(srr.x, srr.y);
  ctx.lineTo(srl.x, srl.y);
  ctx.closePath();
  if (style === 'dim') {
    ctx.fillStyle = car.alive ? COLORS.carDim : COLORS.carDimDead;
  } else if (style === 'focus') {
    ctx.fillStyle = car.alive ? COLORS.carFocus : COLORS.carDead;
  } else {
    ctx.fillStyle = car.alive ? COLORS.carAlive : COLORS.carDead;
  }
  ctx.fill();
  if (style !== 'dim') {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
    // Nose marker: a line across the front so the heading is unambiguous.
    ctx.beginPath();
    ctx.moveTo(sfl.x, sfl.y);
    ctx.lineTo(sfr.x, sfr.y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.carNose;
    ctx.stroke();
  }

  if (opts.debug) {
    // Heading ray from the centre, and the car's LEFT side marked, to make
    // the sign conventions visible.
    const c = worldToScreen(cam, car.state);
    const h = car.state.heading;
    const tip = worldToScreen(cam, {
      x: car.state.x + Math.cos(h) * 8,
      y: car.state.y + Math.sin(h) * 8,
    });
    drawArrow(ctx, c, tip, COLORS.debugText);
    const leftMid = worldToScreen(cam, { x: (fl.x + rl.x) / 2, y: (fl.y + rl.y) / 2 });
    ctx.fillStyle = COLORS.edgeLeft;
    ctx.beginPath();
    ctx.arc(leftMid.x, leftMid.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2, color: string): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = Math.min(10, len * 0.4);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ux * headLen - uy * headLen * 0.5, to.y - uy * headLen + ux * headLen * 0.5);
  ctx.lineTo(to.x - ux * headLen + uy * headLen * 0.5, to.y - uy * headLen - ux * headLen * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
