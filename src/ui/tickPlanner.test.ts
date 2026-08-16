import { describe, expect, it } from 'vitest';
import { maxTicksPerFrame, planTicks, runBudgeted } from './tickPlanner.ts';

const dt = 1 / 60;

describe('planTicks', () => {
  it('1× at 60 Hz: exactly one tick per frame, accumulator stays tiny', () => {
    let acc = 0;
    let total = 0;
    for (let f = 0; f < 600; f++) {
      const p = planTicks(1, acc, 1 / 60, dt);
      acc = p.acc;
      total += p.ticks;
    }
    expect(total).toBe(600);
    expect(acc).toBeLessThan(dt);
  });

  it('1× at 120 Hz: ticks alternate 0/1 and average one per 1/60 s', () => {
    let acc = 0;
    let total = 0;
    const seq: number[] = [];
    for (let f = 0; f < 120; f++) {
      const p = planTicks(1, acc, 1 / 120, dt);
      acc = p.acc;
      total += p.ticks;
      seq.push(p.ticks);
    }
    expect(total).toBe(60);
    expect(seq.every((t) => t === 0 || t === 1)).toBe(true);
  });

  it('4× and 16× at 60 Hz run 4 and 16 ticks per frame', () => {
    expect(planTicks(4, 0, 1 / 60, dt).ticks).toBe(4);
    expect(planTicks(16, 0, 1 / 60, dt).ticks).toBe(16);
    let acc = 0;
    let total = 0;
    for (let f = 0; f < 60; f++) {
      const p = planTicks(16, acc, 1 / 60, dt);
      acc = p.acc;
      total += p.ticks;
    }
    expect(total).toBe(960);
  });

  it('a long hitch is capped and the backlog dropped (never a catch-up burst)', () => {
    const p = planTicks(1, 0, 0.25, dt); // 250 ms gap = 15 ticks owed
    expect(p.ticks).toBe(maxTicksPerFrame(1)); // 5
    expect(p.acc).toBe(0);
    const q = planTicks(16, 0, 0.25, dt); // 240 ticks owed, cap 80
    expect(q.ticks).toBe(80);
    expect(q.acc).toBe(0);
  });

  it('never returns negative ticks and never loses fractional time below the cap', () => {
    const p = planTicks(1, 0.5 * dt, 0.4 * dt, dt);
    expect(p.ticks).toBe(0);
    expect(p.acc).toBeCloseTo(0.9 * dt, 12);
    const q = planTicks(1, p.acc, 0.2 * dt, dt);
    expect(q.ticks).toBe(1);
    expect(q.acc).toBeCloseTo(0.1 * dt, 9);
  });
});

describe('runBudgeted', () => {
  it('runs ticks until the budget is spent (fake clock: 1 ms per tick)', () => {
    let t = 0;
    let ticks = 0;
    const n = runBudgeted(
      () => {
        ticks++;
      },
      () => t++,
      10,
    );
    expect(n).toBe(ticks);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(11);
  });

  it('always runs at least one tick and respects maxTicks', () => {
    let ticks = 0;
    expect(
      runBudgeted(
        () => ticks++,
        () => 1e9,
        0,
      ),
    ).toBe(1);
    expect(
      runBudgeted(
        () => ticks++,
        () => 0,
        1000,
        7,
      ),
    ).toBe(7);
  });
});
