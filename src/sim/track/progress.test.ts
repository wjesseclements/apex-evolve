import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../math/vec2.ts';
import { SQUARE } from '../testing/fixtures.ts';
import { arcPosition, buildCheckpoints, pointAtArc } from './checkpoints.ts';
import {
  initialProgress,
  lapsOf,
  nextCheckpointIndex,
  updateProgress,
  type ProgressState,
} from './progress.ts';
import { buildTrack } from './track.ts';
import { HELDOUT_TRACK, TRAINING_TRACK } from './tracks.ts';

const square = buildTrack(SQUARE); // 400 m, clockwise: (0,0)→(100,0)→(100,100)→(0,100)

/** Point on the square's centerline at arc s (hand-computable). */
function squarePoint(s: number): Vec2 {
  let a = s % 400;
  if (a < 0) a += 400;
  if (a < 100) return { x: a, y: 0 };
  if (a < 200) return { x: 100, y: a - 100 };
  if (a < 300) return { x: 300 - a, y: 100 };
  return { x: 0, y: 400 - a };
}

describe('buildCheckpoints', () => {
  it('spacing 100 on the 400 m square → 4 checkpoints at 0,100,200,300', () => {
    const c = buildCheckpoints(square, 100);
    expect(c.count).toBe(4);
    expect(c.spacing).toBe(100);
    expect(c.arcs).toEqual([0, 100, 200, 300]);
    expect(c.totalLength).toBe(400);
  });

  it('rounds the count so spans are uniform: spacing 30 → 13 checkpoints of 30.77 m', () => {
    const c = buildCheckpoints(square, 30);
    expect(c.count).toBe(13);
    expect(c.spacing).toBeCloseTo(400 / 13, 12);
    expect(c.arcs[12]).toBeCloseTo(12 * (400 / 13), 12);
  });

  it('training track at 5 m: 88 checkpoints, spacing ≈ 5 m', () => {
    const c = buildCheckpoints(TRAINING_TRACK, 5);
    expect(c.count).toBe(Math.round(TRAINING_TRACK.totalLength / 5));
    expect(c.spacing).toBeCloseTo(5, 1);
  });

  it('rejects non-positive spacing', () => {
    expect(() => buildCheckpoints(square, 0)).toThrow();
  });
});

describe('arcPosition / pointAtArc — square, hand-computed', () => {
  it.each([
    [{ x: 50, y: 0 }, 50],
    [{ x: 100, y: 50 }, 150],
    [{ x: 50, y: 100 }, 250],
    [{ x: 0, y: 50 }, 350],
    [{ x: 0, y: 0 }, 0],
    [{ x: 50, y: -8 }, 50], // off the centerline projects perpendicularly
    [{ x: 104, y: 20 }, 120],
  ])('%j → arc %d', (p, arc) => {
    expect(arcPosition(square, p).arc).toBeCloseTo(arc, 9);
  });

  it('pointAtArc inverts arcPosition on the centerline, wrapping and negative arcs included', () => {
    for (const s of [0, 25, 100, 150, 299.5, 399, 400, 450, -50]) {
      const p = pointAtArc(square, s);
      const q = squarePoint(s);
      expect(p.x).toBeCloseTo(q.x, 9);
      expect(p.y).toBeCloseTo(q.y, 9);
    }
  });
});

describe('progress — square with checkpoints every 100 m', () => {
  const cps = buildCheckpoints(square, 100);
  const start = () => initialProgress(square, cps, { x: 0, y: 0 }, 0);

  /** Move along the centerline arc from `from` to `to` in `step`-metre increments. */
  function drive(state: ProgressState, from: number, to: number, step: number): ProgressState {
    let st = state;
    const dir = Math.sign(to - from) || 1;
    for (let s = from + dir * step; dir > 0 ? s <= to + 1e-9 : s >= to - 1e-9; s += dir * step) {
      st = updateProgress(square, cps, st, squarePoint(s));
    }
    return st;
  }

  it('starts at the start line: progress 0, nothing passed, next checkpoint 1', () => {
    const p = start();
    expect(p.progress).toBe(0);
    expect(p.passed).toBe(0);
    expect(nextCheckpointIndex(p, cps)).toBe(1);
    expect(lapsOf(p, cps)).toBe(0);
  });

  it('driving forward: progress equals distance travelled and increases strictly every step', () => {
    let st = start();
    let prev = 0;
    for (let s = 3; s <= 399; s += 3) {
      st = updateProgress(square, cps, st, squarePoint(s));
      expect(st.progress).toBeCloseTo(s, 9);
      expect(st.progress).toBeGreaterThan(prev);
      prev = st.progress;
    }
    expect(st.passed).toBe(3); // 100, 200, 300 crossed; start line not yet
    expect(nextCheckpointIndex(st, cps)).toBe(0);
  });

  it('completing a lap: crossing the start line again increments laps; progress continues past 400', () => {
    let st = drive(start(), 0, 399, 3);
    st = updateProgress(square, cps, st, squarePoint(402)); // → (2, 0)
    expect(st.passed).toBe(4);
    expect(lapsOf(st, cps)).toBe(1);
    expect(st.progress).toBeCloseTo(402, 9);
    st = drive(st, 402, 852, 3);
    expect(lapsOf(st, cps)).toBe(2);
    expect(st.progress).toBeCloseTo(852, 9);
  });

  it('backing up from the start line: progress stays 0 and nothing is passed', () => {
    let st = start();
    for (let s = -3; s >= -150; s -= 3) {
      st = updateProgress(square, cps, st, squarePoint(s)); // arc wraps to 397, 394, …
      expect(st.progress).toBe(0);
      expect(st.passed).toBe(0);
    }
    expect(st.s).toBeCloseTo(-150, 9);
  });

  it('driving the whole loop BACKWARDS collects nothing, even when arriving at checkpoints from the wrong side', () => {
    let st = start();
    for (let s = -3; s >= -800; s -= 3) {
      st = updateProgress(square, cps, st, squarePoint(s));
      expect(st.progress).toBe(0);
      expect(st.passed).toBe(0);
    }
    // …and coming back forward the same way earns nothing until the car is past the start again.
    st = drive(st, -800, -3, 3);
    expect(st.progress).toBe(0);
    st = drive(st, -3, 30, 3);
    expect(st.progress).toBeCloseTo(30, 9);
    expect(st.passed).toBe(0);
  });

  it('within a span, backing up decreases progress but never below the last checkpoint, and never gains', () => {
    let st = drive(start(), 0, 150, 5); // passed checkpoint 1 (arc 100), 50 m into span 2
    expect(st.progress).toBeCloseTo(150, 9);
    st = drive(st, 150, 120, 5);
    expect(st.progress).toBeCloseTo(120, 9);
    expect(st.passed).toBe(1);
    st = drive(st, 120, 80, 5); // behind checkpoint 1 now
    expect(st.progress).toBeCloseTo(100, 9); // clamped at the last checkpoint's arc
    expect(st.passed).toBe(1); // never un-passed
    st = drive(st, 80, 130, 5);
    expect(st.progress).toBeCloseTo(130, 9);
    expect(st.passed).toBe(1); // re-crossing checkpoint 1 does not count twice
  });

  it('driving in circles plateaus: oscillating over the same stretch never advances past the far end', () => {
    // A car "circling" between arcs 240 and 260 forever: passes checkpoint 200
    // once, its progress tops out at 260 and returns there every time.
    let st = drive(start(), 0, 260, 5);
    const top = st.progress;
    expect(top).toBeCloseTo(260, 9);
    for (let k = 0; k < 20; k++) {
      st = drive(st, 260, 240, 5);
      st = drive(st, 240, 260, 5);
      expect(st.progress).toBeLessThanOrEqual(top + 1e-9);
      expect(st.passed).toBe(2);
    }
  });

  it('a large forward step crosses several checkpoints at once', () => {
    const fine = buildCheckpoints(square, 10);
    let st = initialProgress(square, fine, { x: 0, y: 0 }, 0);
    st = updateProgress(square, fine, st, squarePoint(35));
    expect(st.passed).toBe(3); // 10, 20, 30
    expect(st.progress).toBeCloseTo(35, 9);
  });

  it('spawning mid-track: last checkpoint is the one behind the spawn point', () => {
    const st = initialProgress(square, cps, { x: 100, y: 50 }, 1); // arc 150
    expect(st.passed).toBe(1);
    expect(st.progress).toBeCloseTo(150, 9);
    expect(nextCheckpointIndex(st, cps)).toBe(2);
  });
});

describe.each([
  ['training', TRAINING_TRACK],
  ['heldout', HELDOUT_TRACK],
])('progress — %s track sanity', (_name, track) => {
  it('walking the centerline forward with 5 m checkpoints is monotone and ends at ~one lap', () => {
    const cps = buildCheckpoints(track, 5);
    let st = initialProgress(track, cps, track.centerline[0]!, 0);
    let prev = 0;
    const n = track.centerline.length;
    for (let i = 1; i <= n; i++) {
      st = updateProgress(track, cps, st, track.centerline[i % n]!);
      expect(st.progress).toBeGreaterThan(prev);
      prev = st.progress;
    }
    // Back at the start vertex: exactly one lap.
    expect(lapsOf(st, cps)).toBe(1);
    expect(st.progress).toBeCloseTo(track.totalLength, 6);
  });
});
