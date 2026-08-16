/**
 * Seeded pseudo-random number generator for the simulation (CLAUDE.md hard
 * rule 1: ALL randomness flows through an injected instance of this).
 *
 * Core: mulberry32 — a 32-bit state, integer-only generator (Math.imul and
 * shifts are exactly specified), so it is bit-identical on every engine.
 *
 * Contract:
 * - `state()` returns the complete generator state as one uint32 and
 *   `restore(state)` puts the generator back there; the subsequent stream is
 *   identical. There is NO hidden state: `nextGaussian` uses Box-Muller and
 *   deliberately burns the second value of each pair rather than caching it,
 *   so restoring mid-way through any sequence of calls is exact.
 * - `fork()` derives an independent generator from the next draw of this one
 *   (advancing this one by one draw).
 * - Seeds may be a uint32 number (used as-is, modulo 2^32) or any string
 *   (hashed to a uint32 with FNV-1a; deterministic).
 * - `nextGaussian` uses dmath (deterministic sqrt/log/cos), never Math.*.
 */

import { cos, log } from '../math/dmath.ts';

export interface Prng {
  /** Uniform in [0, 1) with 32 bits of randomness. */
  nextFloat(): number;
  /** Uniform integer in [0, n) for 0 < n ≤ 2^32. */
  nextInt(n: number): number;
  /** Uniform in [lo, hi). */
  nextRange(lo: number, hi: number): number;
  /** Normally distributed with the given mean and standard deviation (Box-Muller). */
  nextGaussian(mean?: number, sd?: number): number;
  /** Independent generator seeded from this one's next draw. */
  fork(): Prng;
  /** Complete internal state (uint32). */
  state(): number;
  /** Restore a state previously obtained from state(). */
  restore(state: number): void;
}

/** FNV-1a 32-bit hash of a string → uint32 (deterministic, cheap). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Normalize a number/string seed into the uint32 state space. */
export function seedToState(seed: number | string): number {
  if (typeof seed === 'string') return hashSeed(seed);
  if (!Number.isFinite(seed)) return 0;
  return ((Math.floor(seed) % 4294967296) >>> 0) >>> 0;
}

class Mulberry32 implements Prng {
  private a: number;

  constructor(state: number) {
    this.a = state >>> 0;
  }

  /** Next raw uint32. */
  private nextUint32(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  nextInt(n: number): number {
    if (!(n > 0)) throw new RangeError(`nextInt: n must be positive, got ${n}`);
    return Math.floor(this.nextFloat() * n);
  }

  nextRange(lo: number, hi: number): number {
    return lo + (hi - lo) * this.nextFloat();
  }

  nextGaussian(mean = 0, sd = 1): number {
    // u1 ∈ (0, 1] so log is finite; u2 ∈ [0, 1). Second Box-Muller value is discarded.
    const u1 = 1 - this.nextFloat();
    const u2 = this.nextFloat();
    const r = Math.sqrt(-2 * log(u1));
    return mean + sd * r * cos(2 * Math.PI * u2);
  }

  fork(): Prng {
    return new Mulberry32(this.nextUint32());
  }

  state(): number {
    return this.a >>> 0;
  }

  restore(state: number): void {
    this.a = state >>> 0;
  }
}

/** Create a generator from a number or string seed. */
export function createPrng(seed: number | string): Prng {
  return new Mulberry32(seedToState(seed));
}
