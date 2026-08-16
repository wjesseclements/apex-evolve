import { describe, expect, it } from 'vitest';
import { DEFAULT_GA, DEFAULT_NN, DEFAULT_SIM } from '../sim/config.ts';
import { createEvolution, stepEvolution } from '../sim/engine/evolution.ts';
import { createWorld, stepWorld } from '../sim/engine/world.ts';
import { SQUARE } from '../sim/testing/fixtures.ts';
import { buildTrack } from '../sim/track/track.ts';
import { TRAINING_TRACK } from '../sim/track/tracks.ts';
import { fitCamera, worldToScreen } from './camera.ts';
import { hitTestCar, resolveSelection } from './hitTest.ts';

const square = buildTrack(SQUARE);

describe('hitTestCar — hand-computed', () => {
  // Square bounds −10..110 → fit into 600×600 with 0 padding = 5 px/m, origin at (50, 50) px.
  const cam = fitCamera(square.bounds, 600, 600, 0);

  it('returns the car under the click and null on empty track', () => {
    let w = createWorld(square, DEFAULT_SIM, 3);
    // Move cars apart: car 1 and 2 drive; car 0 stays.
    for (let t = 0; t < 120; t++) {
      w = stepWorld(w, (i) =>
        i === 0 ? { steering: 0, throttle: 0 } : { steering: 0, throttle: i === 1 ? 0.5 : 1 },
      );
    }
    const p0 = worldToScreen(cam, w.cars[0]!.state);
    expect(p0).toEqual({ x: 50, y: 50 });
    expect(hitTestCar(w, cam, { x: 52, y: 49 }, 12)).toBe(0);
    const p2 = worldToScreen(cam, w.cars[2]!.state);
    expect(hitTestCar(w, cam, { x: p2.x + 3, y: p2.y - 3 }, 12)).toBe(2);
    expect(hitTestCar(w, cam, { x: 300, y: 300 }, 12)).toBeNull(); // the hole
    expect(hitTestCar(w, cam, { x: p2.x + 40, y: p2.y }, 12)).toBeNull(); // > radius
  });

  it('prefers the nearest car and ignores dead cars', () => {
    let w = createWorld(square, DEFAULT_SIM, 2);
    // Both cars go flat out; identical → overlapping. Kill car 0 by running it into the wall alone first.
    for (let t = 0; t < 700; t++)
      w = stepWorld(w, (i) =>
        i === 0 ? { steering: 0, throttle: 1 } : { steering: 0, throttle: 0.2 },
      );
    expect(w.cars[0]!.alive).toBe(false);
    const dead = worldToScreen(cam, w.cars[0]!.state);
    expect(hitTestCar(w, cam, dead, 12)).toBeNull(); // dead car not selectable
    const alive = worldToScreen(cam, w.cars[1]!.state);
    expect(hitTestCar(w, cam, alive, 12)).toBe(1);
  });
});

describe('hitTestCar — sweep over a real population', () => {
  it('clicking exactly on each living car returns that car or an overlapping/nearer living car; radius honoured', () => {
    const evo = createEvolution(TRAINING_TRACK, {
      sim: DEFAULT_SIM,
      ga: DEFAULT_GA,
      nn: DEFAULT_NN,
      seed: 42,
    });
    for (let t = 0; t < 90; t++) stepEvolution(evo); // early in gen 0: most cars still alive and spread out
    const w = evo.world;
    const cam = fitCamera(w.track.bounds, 900, 700);
    let checked = 0;
    w.cars.forEach((car, i) => {
      if (!car.alive) return;
      const p = worldToScreen(cam, car.state);
      const hit = hitTestCar(w, cam, p, 10);
      expect(hit).not.toBeNull();
      const hitCar = w.cars[hit!]!;
      expect(hitCar.alive).toBe(true);
      // The returned car is at least as close to the click as car i is (i.e. distance 0 → overlapping).
      const q = worldToScreen(cam, hitCar.state);
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThanOrEqual(1e-9);
      if (hit !== i) expect(hitCar.state).toEqual(car.state); // an exact overlap (ghost cars)
      checked++;
      // Far away from every car → null.
      expect(hitTestCar(w, cam, { x: p.x + 500, y: p.y + 500 }, 10)).toBeNull();
    });
    expect(checked).toBeGreaterThan(20);
  });
});

describe('resolveSelection', () => {
  it('keeps a live selection, clears on death or generation change', () => {
    let w = createWorld(square, DEFAULT_SIM, 2);
    const sel = { index: 0, generation: 3 };
    expect(resolveSelection(sel, w, 3)).toEqual(sel);
    expect(resolveSelection(sel, w, 4)).toBeNull();
    expect(resolveSelection(null, w, 3)).toBeNull();
    for (let t = 0; t < 700; t++)
      w = stepWorld(w, (i) =>
        i === 0 ? { steering: 0, throttle: 1 } : { steering: 0, throttle: 0.2 },
      );
    expect(w.cars[0]!.alive).toBe(false);
    expect(resolveSelection(sel, w, 3)).toBeNull();
    expect(resolveSelection({ index: 1, generation: 3 }, w, 3)).toEqual({
      index: 1,
      generation: 3,
    });
    expect(resolveSelection({ index: 9, generation: 3 }, w, 3)).toBeNull(); // no such car
  });
});
