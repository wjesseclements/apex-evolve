/**
 * Pure tick-planning for the frame loop (kept out of the React hook so it can
 * be unit-tested). Rendering framerate must never affect simulation results:
 * the world only ever advances in whole fixed ticks, and how many happen per
 * frame is the ONLY thing speed changes.
 *
 *   speed 1 / 4 / 16 : an accumulator gathers `frameDt × speed` seconds of
 *                       simulated time and releases whole ticks of `dt`,
 *                       capped per frame (spiral-of-death guard); a capped
 *                       backlog is dropped, never caught up.
 *   speed 'max'      : the caller runs ticks until a wall-clock budget is
 *                       spent, then renders once (see runBudgeted).
 */

export type Speed = 1 | 4 | 16 | 'max';
export const SPEEDS: readonly Speed[] = [1, 4, 16, 'max'];

/** Per-frame tick cap for a fixed speed: 5 real frames' worth at that speed (≥ 5). */
export function maxTicksPerFrame(speed: Exclude<Speed, 'max'>): number {
  return Math.max(5, speed * 5);
}

export interface TickPlan {
  /** Ticks to run this frame. */
  readonly ticks: number;
  /** Accumulator carried into the next frame, seconds of simulated time. */
  readonly acc: number;
}

/**
 * Plan the ticks for one frame at a fixed speed. `acc` is the accumulator
 * from the previous frame, `frameDt` the real seconds since the last frame
 * (already clamped by the caller), `dt` the fixed physics step.
 */
export function planTicks(
  speed: Exclude<Speed, 'max'>,
  acc: number,
  frameDt: number,
  dt: number,
): TickPlan {
  let a = acc + frameDt * speed;
  const cap = maxTicksPerFrame(speed);
  let ticks = Math.floor(a / dt);
  if (ticks >= cap) {
    // Fell behind (tab hidden, hitch): run the cap and drop the rest.
    return { ticks: cap, acc: 0 };
  }
  a -= ticks * dt;
  if (ticks < 0) ticks = 0;
  return { ticks, acc: a };
}

/**
 * Run `tick()` repeatedly until `budgetMs` of wall-clock time has elapsed
 * according to `now()` (or `maxTicks`, whichever first). Returns the number
 * of ticks run. Always runs at least one tick so progress is guaranteed.
 */
export function runBudgeted(
  tick: () => void,
  now: () => number,
  budgetMs: number,
  maxTicks = 100000,
): number {
  const start = now();
  let n = 0;
  do {
    tick();
    n++;
  } while (n < maxTicks && now() - start < budgetMs);
  return n;
}
