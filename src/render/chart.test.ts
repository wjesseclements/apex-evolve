import { describe, expect, it } from 'vitest';
import { layoutFitnessChart, nearestGenerationIndex, niceStep } from './chart.ts';

describe('niceStep', () => {
  it('picks 1/2/5 × 10^k steps giving about n ticks', () => {
    expect(niceStep(100, 4)).toBe(50);
    expect(niceStep(906, 4)).toBe(500);
    expect(niceStep(29, 6)).toBe(5);
    expect(niceStep(0, 4)).toBe(1);
  });
});

describe('layoutFitnessChart', () => {
  const hist = [
    { generation: 0, best: 100, mean: 10 },
    { generation: 1, best: 250, mean: 60 },
    { generation: 2, best: 900, mean: 400 },
  ];

  it('maps generation to x across the plot width and fitness to y from the baseline', () => {
    const L = layoutFitnessChart(hist, 300, 150);
    expect(L.genMax).toBe(2);
    expect(L.yMax).toBe(1000); // step 500 for max 900 → 1000
    expect(L.best[0]!.x).toBeCloseTo(L.plot.left, 9);
    expect(L.best[2]!.x).toBeCloseTo(L.plot.left + L.plot.width, 9);
    expect(L.best[1]!.x).toBeCloseTo(L.plot.left + L.plot.width / 2, 9);
    // y: value 900 of 1000 → 10% from the top of the plot
    expect(L.best[2]!.y).toBeCloseTo(L.plot.top + 0.1 * L.plot.height, 9);
    // mean is below best (larger y) at every point
    for (let i = 0; i < hist.length; i++) expect(L.mean[i]!.y).toBeGreaterThan(L.best[i]!.y);
    // ticks span the domain
    expect(L.yTicks[0]!.value).toBe(0);
    expect(L.yTicks[L.yTicks.length - 1]!.value).toBe(1000);
    expect(L.xTicks[0]!.gen).toBe(0);
  });

  it('handles an empty and a single-point history without NaN, with integer generation ticks', () => {
    const e = layoutFitnessChart([], 300, 150);
    expect(e.best).toEqual([]);
    expect(e.xTicks.map((t) => t.gen)).toEqual([0, 1]);
    expect(Number.isFinite(e.yMax)).toBe(true);
    const one = layoutFitnessChart([{ generation: 0, best: 5, mean: 1 }], 300, 150);
    expect(one.best).toHaveLength(1);
    expect(Number.isFinite(one.best[0]!.x) && Number.isFinite(one.best[0]!.y)).toBe(true);
  });

  it('nearestGenerationIndex picks the closest point by x', () => {
    const L = layoutFitnessChart(hist, 300, 150);
    expect(nearestGenerationIndex(L, L.plot.left + 1)).toBe(0);
    expect(nearestGenerationIndex(L, L.plot.left + L.plot.width * 0.55)).toBe(1);
    expect(nearestGenerationIndex(L, 9999)).toBe(2);
    expect(nearestGenerationIndex(layoutFitnessChart([], 300, 150), 10)).toBe(-1);
  });
});
