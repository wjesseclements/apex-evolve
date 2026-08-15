import { describe, expect, it } from 'vitest';
import { fitCamera, screenToWorld, worldToScreen } from './camera.ts';

describe('camera (y-down world → y-down screen: no flip)', () => {
  const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };

  it('fits a 200×100 m world into 800×600 px with 0 padding at 4 px/m, centred', () => {
    const cam = fitCamera(bounds, 800, 600, 0);
    expect(cam.scale).toBe(4);
    // World is 800×400 px; centred vertically → 100 px top margin.
    expect(worldToScreen(cam, { x: 0, y: 0 })).toEqual({ x: 0, y: 100 });
    expect(worldToScreen(cam, { x: 200, y: 100 })).toEqual({ x: 800, y: 500 });
  });

  it('a world point with larger y maps to a screen point further DOWN (larger y)', () => {
    const cam = fitCamera(bounds, 800, 600);
    const a = worldToScreen(cam, { x: 10, y: 10 });
    const b = worldToScreen(cam, { x: 10, y: 20 });
    expect(b.y).toBeGreaterThan(a.y);
    expect(b.x).toBe(a.x);
  });

  it('respects padding and round-trips through screenToWorld', () => {
    const cam = fitCamera(bounds, 800, 600, 50);
    expect(cam.scale).toBe(3.5); // (800−100)/200 = 3.5 < (600−100)/100 = 5
    const p = { x: 123.4, y: 56.7 };
    const back = screenToWorld(cam, worldToScreen(cam, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
});
