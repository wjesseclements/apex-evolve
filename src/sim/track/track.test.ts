import { describe, expect, it } from 'vitest';
import { expectVec2 } from '../testing/expectVec2.ts';
import { SQUARE, distToLine } from '../testing/fixtures.ts';
import { at, buildTrack, parseTrackData, wrapIndex, type Track } from './track.ts';
import { TRAINING_TRACK } from './tracks.ts';

/** Distance from p to the infinite line of centerline segment i. */
function distToSegmentLine(t: Track, i: number, p: { x: number; y: number }): number {
  const n = t.centerline.length;
  return distToLine(at(t.centerline, i), at(t.centerline, (i + 1) % n), p);
}

describe('buildTrack — square loop, hand-computed', () => {
  const t: Track = buildTrack(SQUARE);

  it('has 4 segments of 100 m, total 400 m', () => {
    expect(t.segmentLengths).toEqual([100, 100, 100, 100]);
    expect(t.totalLength).toBe(400);
  });

  it('start pose is centerline[0] facing along segment 0 (east, heading 0)', () => {
    expect(t.start).toEqual({ x: 0, y: 0, heading: 0 });
  });

  it('LEFT edge of an east-bound segment is screen-UP (y = −10): the outer edge of a clockwise loop', () => {
    // Vertex 0: prev dir north (0,−1), next dir east (1,0). Left normals
    // (−1,0) and (0,−1); bisector (−1,−1)/√2; miter length 10·√2 → (−10,−10).
    expectVec2(t.leftEdge[0]!, { x: -10, y: -10 });
    // Vertex 1: prev east, next south → left normals (0,−1),(1,0) → (110,−10).
    expectVec2(t.leftEdge[1]!, { x: 110, y: -10 });
    expectVec2(t.leftEdge[2]!, { x: 110, y: 110 });
    expectVec2(t.leftEdge[3]!, { x: -10, y: 110 });
  });

  it('RIGHT edge is the inner square (10..90)', () => {
    expectVec2(t.rightEdge[0]!, { x: 10, y: 10 });
    expectVec2(t.rightEdge[1]!, { x: 90, y: 10 });
    expectVec2(t.rightEdge[2]!, { x: 90, y: 90 });
    expectVec2(t.rightEdge[3]!, { x: 10, y: 90 });
  });

  it('bounds cover the outer edge', () => {
    expect(t.bounds).toEqual({ minX: -10, minY: -10, maxX: 110, maxY: 110 });
  });

  it('mitered edge vertices are exactly half-width from the lines of both adjacent segments', () => {
    for (let i = 0; i < 4; i++) {
      for (const edge of [t.leftEdge, t.rightEdge]) {
        const p = edge[i]!;
        expect(distToSegmentLine(t, i, p)).toBeCloseTo(10, 9);
        expect(distToSegmentLine(t, wrapIndex(i - 1, 4), p)).toBeCloseTo(10, 9);
      }
    }
  });
});

describe('buildTrack — a counter-clockwise loop puts the LEFT edge on the inside', () => {
  it('east → north → west → south: left edge of segment 0 is still screen-up (y=−10) but that is now the inner edge', () => {
    const ccw = buildTrack({
      name: 'ccw',
      width: 20,
      centerline: [
        [0, 0],
        [100, 0],
        [100, -100],
        [0, -100],
      ],
    });
    // Driving east then turning LEFT (toward −y): left of travel is −y, which is
    // the inside of this loop. Vertex 1: prev east (1,0), next north (0,−1);
    // left normals (0,−1),(−1,0) → bisector (−1,−1)/√2 → (90,−10).
    expectVec2(ccw.leftEdge[1]!, { x: 90, y: -10 });
    expectVec2(ccw.rightEdge[1]!, { x: 110, y: 10 });
  });
});

describe('parseTrackData', () => {
  it('accepts well-formed data', () => {
    expect(
      parseTrackData({
        name: 'a',
        width: 1,
        centerline: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      }),
    ).toEqual({
      name: 'a',
      width: 1,
      centerline: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    });
  });

  it.each([
    [null, 'not an object'],
    [
      {
        width: 1,
        centerline: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
      'name',
    ],
    [
      {
        name: 'a',
        width: -1,
        centerline: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      },
      'width',
    ],
    [
      {
        name: 'a',
        width: 1,
        centerline: [
          [0, 0],
          [1, 0],
        ],
      },
      'at least 3',
    ],
    [{ name: 'a', width: 1, centerline: [[0, 0], [1, 0], [1]] }, 'centerline[2]'],
    [
      {
        name: 'a',
        width: 1,
        centerline: [
          [0, 0],
          [1, 'x'],
          [1, 1],
        ],
      },
      'centerline[1]',
    ],
  ])('rejects %j', (raw, msg) => {
    expect(() => parseTrackData(raw)).toThrow(msg);
  });
});

describe('buildTrack — rejects degenerate input', () => {
  it('throws on duplicate consecutive points', () => {
    expect(() =>
      buildTrack({
        name: 'dup',
        width: 1,
        centerline: [
          [0, 0],
          [0, 0],
          [1, 1],
        ],
      }),
    ).toThrow('duplicate');
  });
});

describe('TRAINING_TRACK (shipped JSON)', () => {
  const t = TRAINING_TRACK;

  it('is a 12 m wide closed loop of ~440 m starting at the origin heading east', () => {
    expect(t.width).toBe(12);
    expect(t.centerline.length).toBeGreaterThan(50);
    expect(t.totalLength).toBeGreaterThan(400);
    expect(t.totalLength).toBeLessThan(500);
    expect(t.start.x).toBe(0);
    expect(t.start.y).toBe(0);
    expect(t.start.heading).toBeCloseTo(0, 12);
  });

  it('every edge vertex is exactly 6 m from the lines of both adjacent centerline segments', () => {
    const n = t.centerline.length;
    for (let i = 0; i < n; i++) {
      for (const edge of [t.leftEdge, t.rightEdge]) {
        const p = edge[i]!;
        expect(distToSegmentLine(t, i, p)).toBeCloseTo(6, 6);
        expect(distToSegmentLine(t, wrapIndex(i - 1, n), p)).toBeCloseTo(6, 6);
      }
    }
  });

  it('is driven clockwise on screen overall, so the LEFT edge is the longer outer loop', () => {
    const perimeter = (pts: readonly { x: number; y: number }[]) =>
      pts.reduce((s, p, i) => {
        const q = pts[(i + 1) % pts.length]!;
        return s + Math.hypot(q.x - p.x, q.y - p.y);
      }, 0);
    expect(perimeter(t.leftEdge)).toBeGreaterThan(perimeter(t.rightEdge));
  });

  it('segments are short enough for the localized nearest-segment search (≤ 6 m)', () => {
    for (const len of t.segmentLengths) expect(len).toBeLessThanOrEqual(6);
  });
});
