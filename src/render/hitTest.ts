/**
 * Click → car selection. Pure: screen-space nearest LIVING car centre within
 * `radiusPx` of the click, or null (clicking empty track deselects). Dead cars
 * are never selectable (SPEC: "click any living car").
 */

import type { World } from '../sim/engine/world.ts';
import type { Vec2 } from '../sim/math/vec2.ts';
import { worldToScreen, type Camera } from './camera.ts';

export function hitTestCar(
  world: World,
  cam: Camera,
  screen: Vec2,
  radiusPx: number,
): number | null {
  let best: number | null = null;
  let bestD = radiusPx * radiusPx;
  world.cars.forEach((car, i) => {
    if (!car.alive) return;
    const p = worldToScreen(cam, car.state);
    const dx = p.x - screen.x;
    const dy = p.y - screen.y;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export interface Selection {
  readonly index: number;
  /** Generation the selection was made in; a new generation has new cars. */
  readonly generation: number;
}

/**
 * Keep a selection only while its car exists and is alive: it clears when
 * the car dies (crash or stall) or when the generation changes.
 */
export function resolveSelection(
  sel: Selection | null,
  world: World,
  generation: number,
): Selection | null {
  if (!sel) return null;
  if (sel.generation !== generation) return null;
  const car = world.cars[sel.index];
  if (!car || !car.alive) return null;
  return sel;
}
