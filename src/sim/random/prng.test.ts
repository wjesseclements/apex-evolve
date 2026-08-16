import { describe, expect, it } from 'vitest';
import { createPrng, hashSeed, seedToState } from './prng.ts';

describe('createPrng — reproducibility & state contract', () => {
  it('same seed ⇒ identical stream (floats, ints, gaussians)', () => {
    const a = createPrng(42);
    const b = createPrng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.nextFloat()).toBe(b.nextFloat());
      expect(a.nextInt(1000)).toBe(b.nextInt(1000));
      expect(a.nextGaussian()).toBe(b.nextGaussian());
    }
  });

  it('different seeds ⇒ different streams', () => {
    const a = createPrng(1);
    const b = createPrng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) if (a.nextFloat() === b.nextFloat()) same++;
    expect(same).toBe(0);
  });

  it('string seeds are hashed deterministically and differ from each other', () => {
    expect(hashSeed('apex')).toBe(hashSeed('apex'));
    expect(hashSeed('apex')).not.toBe(hashSeed('apes'));
    expect(seedToState('apex')).toBe(hashSeed('apex'));
    expect(createPrng('apex').nextFloat()).toBe(createPrng('apex').nextFloat());
    expect(createPrng('apex').nextFloat()).not.toBe(createPrng('evolve').nextFloat());
  });

  it('numeric seeds are taken modulo 2^32; non-finite → 0', () => {
    expect(seedToState(4294967296 + 7)).toBe(7);
    expect(seedToState(-1)).toBe(4294967295);
    expect(seedToState(NaN)).toBe(0);
    expect(createPrng(4294967296 + 7).nextFloat()).toBe(createPrng(7).nextFloat());
  });

  it('state()/restore() reproduces the stream exactly, including mid-gaussian-sequence (no hidden cache)', () => {
    const p = createPrng(2024);
    for (let i = 0; i < 17; i++) p.nextGaussian();
    const st = p.state();
    const expected: number[] = [];
    for (let i = 0; i < 50; i++) expected.push(p.nextGaussian(), p.nextFloat(), p.nextInt(10));
    p.restore(st);
    const actual: number[] = [];
    for (let i = 0; i < 50; i++) actual.push(p.nextGaussian(), p.nextFloat(), p.nextInt(10));
    expect(actual).toEqual(expected);
    // Restoring into a brand-new generator works too: the state IS the whole generator.
    const q = createPrng(0);
    q.restore(st);
    const fresh: number[] = [];
    for (let i = 0; i < 50; i++) fresh.push(q.nextGaussian(), q.nextFloat(), q.nextInt(10));
    expect(fresh).toEqual(expected);
  });

  it('every call advances state by a fixed number of draws (gaussian = exactly 2)', () => {
    const p = createPrng(7);
    const s0 = p.state();
    p.nextGaussian();
    const q = createPrng(7);
    q.nextFloat();
    q.nextFloat();
    expect(p.state()).toBe(q.state());
    expect(p.state()).not.toBe(s0);
  });

  it('fork() yields an independent generator and advances the parent by one draw', () => {
    const p = createPrng(99);
    const q = createPrng(99);
    const child = p.fork();
    q.nextFloat(); // parent consumed one draw
    expect(p.state()).toBe(q.state());
    // Child stream is deterministic and differs from the parent's continuation.
    const c1 = createPrng(99).fork();
    expect(child.nextFloat()).toBe(c1.nextFloat());
    expect(child.nextFloat()).not.toBe(p.nextFloat());
  });

  it('nextInt rejects non-positive n', () => {
    expect(() => createPrng(1).nextInt(0)).toThrow(RangeError);
  });
});

describe('createPrng — distribution sanity (seeded, so exactly repeatable)', () => {
  it('nextFloat is in [0,1) and roughly uniform over 20 bins (100k draws)', () => {
    const p = createPrng(123);
    const bins = new Array<number>(20).fill(0);
    const N = 100000;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const v = p.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      bins[Math.floor(v * 20)]!++;
      sum += v;
    }
    expect(sum / N).toBeCloseTo(0.5, 2);
    // Chi-square with 19 dof: 99.9% critical value ≈ 43.8.
    const expected = N / 20;
    const chi2 = bins.reduce((acc, b) => acc + ((b - expected) * (b - expected)) / expected, 0);
    expect(chi2).toBeLessThan(43.8);
  });

  it('nextInt(6) covers all faces roughly evenly', () => {
    const p = createPrng(5);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 60000; i++) counts[p.nextInt(6)]!++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(400);
  });

  it('nextGaussian has mean ≈ 0, sd ≈ 1, and sane tails (100k draws)', () => {
    const p = createPrng(77);
    const N = 100000;
    let sum = 0;
    let sumSq = 0;
    let within1 = 0;
    let beyond3 = 0;
    for (let i = 0; i < N; i++) {
      const g = p.nextGaussian();
      expect(Number.isFinite(g)).toBe(true);
      sum += g;
      sumSq += g * g;
      if (Math.abs(g) < 1) within1++;
      if (Math.abs(g) > 3) beyond3++;
    }
    const mean = sum / N;
    const sd = Math.sqrt(sumSq / N - mean * mean);
    expect(mean).toBeCloseTo(0, 1);
    expect(sd).toBeCloseTo(1, 1);
    expect(within1 / N).toBeCloseTo(0.6827, 1);
    expect(beyond3 / N).toBeLessThan(0.006);
    expect(beyond3 / N).toBeGreaterThan(0.001);
  });

  it('nextGaussian(mean, sd) scales and shifts', () => {
    const p = createPrng(8);
    let sum = 0;
    let sumSq = 0;
    const N = 50000;
    for (let i = 0; i < N; i++) {
      const g = p.nextGaussian(10, 0.2);
      sum += g;
      sumSq += g * g;
    }
    const mean = sum / N;
    expect(mean).toBeCloseTo(10, 1);
    expect(Math.sqrt(sumSq / N - mean * mean)).toBeCloseTo(0.2, 2);
  });
});

/**
 * GOLDEN PINS — pinned on macOS/arm64; CI (Linux/x64) must match bit-for-bit.
 * These make "same seed ⇒ same evolution" a cross-engine guarantee.
 */
describe('createPrng golden pins (bit-exact across engines)', () => {
  it('seed 42: first floats, ints, gaussians', () => {
    const p = createPrng(42);
    const floats = [p.nextFloat(), p.nextFloat(), p.nextFloat()];
    const ints = [p.nextInt(100), p.nextInt(100), p.nextInt(100)];
    const gauss = [p.nextGaussian(), p.nextGaussian(), p.nextGaussian(0.5, 0.2)];
    expect(floats).toEqual(GOLDEN_FLOATS);
    expect(ints).toEqual(GOLDEN_INTS);
    expect(gauss).toEqual(GOLDEN_GAUSS);
    expect(p.state()).toBe(GOLDEN_STATE);
  });

  it('string seed "apex-evolve" hashes to a fixed state', () => {
    expect(hashSeed('apex-evolve')).toBe(GOLDEN_HASH);
  });
});

const GOLDEN_FLOATS: number[] = [0.6011037519201636, 0.44829055899754167, 0.8524657934904099];
const GOLDEN_INTS: number[] = [66, 17, 52];
const GOLDEN_GAUSS: number[] = [-0.5658325852126875, -1.9727758972262703, 0.6119028966990894];
const GOLDEN_STATE = 503953318;
const GOLDEN_HASH = 1917269241;
