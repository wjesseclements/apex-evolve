import { describe, expect, it } from 'vitest';
import { DEFAULT_GA, DEFAULT_NN, type GaConfig } from '../config.ts';
import { randomGenome } from '../nn/network.ts';
import { createPrng } from '../random/prng.ts';
import {
  initPopulation,
  mutate,
  nextGeneration,
  rankIndices,
  tournamentSelect,
  uniformCrossover,
  type ScoredGenome,
} from './ga.ts';

/** A population whose fitness equals its index (0 = worst … n−1 = best). */
function ladder(n: number, len = 4): ScoredGenome[] {
  return Array.from({ length: n }, (_, i) => ({
    genome: new Float32Array(len).fill(i),
    fitness: i,
  }));
}

describe('initPopulation / rankIndices', () => {
  it('creates populationSize genomes of the right length, deterministically', () => {
    const a = initPopulation(DEFAULT_NN, DEFAULT_GA, createPrng(1));
    const b = initPopulation(DEFAULT_NN, DEFAULT_GA, createPrng(1));
    expect(a).toHaveLength(100);
    expect(a[0]!.length).toBe(112);
    expect(a.map((g) => Array.from(g))).toEqual(b.map((g) => Array.from(g)));
    expect(Array.from(a[0]!)).not.toEqual(Array.from(a[1]!));
  });

  it('ranks by fitness descending with deterministic index tie-break; NaN last', () => {
    const scored: ScoredGenome[] = [
      { genome: new Float32Array(1), fitness: 5 },
      { genome: new Float32Array(1), fitness: 9 },
      { genome: new Float32Array(1), fitness: NaN },
      { genome: new Float32Array(1), fitness: 5 },
      { genome: new Float32Array(1), fitness: 12 },
    ];
    expect(rankIndices(scored)).toEqual([4, 1, 0, 3, 2]);
  });
});

describe('tournamentSelect', () => {
  it('prefers fitter genomes: pick frequency increases with rank, k=4 vs k=1 (POOL OF 20, not the 100-car population)', () => {
    // The theory values below (0.1855, 6e-6) are for this 20-genome pool with
    // replacement; for the real population of 100 P(best) = 1 − 0.99⁴ ≈ 0.039.
    const pop = ladder(20);
    const N = 20000;
    const count = (k: number, seed: number) => {
      const rng = createPrng(seed);
      const c = new Array<number>(20).fill(0);
      for (let i = 0; i < N; i++) c[tournamentSelect(pop, k, rng)]!++;
      return c;
    };
    const c4 = count(4, 1);
    const c1 = count(1, 2);
    // Theory (k=4, with replacement): P(best) = 1 − (19/20)^4 ≈ 0.1855; P(worst) = (1/20)^4 ≈ 6e-6.
    expect(c4[19]! / N).toBeCloseTo(0.1855, 1);
    expect(c4[0]!).toBeLessThan(5);
    // Top quarter wins far more often than the bottom quarter.
    const top = c4.slice(15).reduce((a, b) => a + b, 0);
    const bottom = c4.slice(0, 5).reduce((a, b) => a + b, 0);
    expect(top / N).toBeGreaterThan(0.6);
    expect(bottom / N).toBeLessThan(0.01);
    // Broadly monotone: each rank's count ≥ the count two ranks below (allowing noise).
    for (let r = 2; r < 20; r++) expect(c4[r]!).toBeGreaterThanOrEqual(c4[r - 2]! - 60);
    // k = 1 is uniform.
    for (const c of c1) expect(Math.abs(c - N / 20)).toBeLessThan(150);
  });

  it('is deterministic for a given seed and returns a valid index', () => {
    const pop = ladder(10);
    const a = createPrng(5);
    const b = createPrng(5);
    for (let i = 0; i < 100; i++) {
      const x = tournamentSelect(pop, 4, a);
      expect(x).toBe(tournamentSelect(pop, 4, b));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(10);
    }
  });

  it('throws on an empty population', () => {
    expect(() => tournamentSelect([], 4, createPrng(1))).toThrow();
  });
});

describe('uniformCrossover', () => {
  it('every child gene equals one parent gene; the split is ≈ 50/50; parents untouched', () => {
    const rng = createPrng(3);
    const a = new Float32Array(2000).fill(1);
    const b = new Float32Array(2000).fill(-1);
    const child = uniformCrossover(a, b, rng);
    let fromA = 0;
    for (const v of child) {
      expect(v === 1 || v === -1).toBe(true);
      if (v === 1) fromA++;
    }
    expect(fromA / 2000).toBeCloseTo(0.5, 1);
    expect(a.every((v) => v === 1)).toBe(true);
    expect(b.every((v) => v === -1)).toBe(true);
  });

  it('rejects parents of different lengths', () => {
    expect(() =>
      uniformCrossover(new Float32Array(3), new Float32Array(4), createPrng(1)),
    ).toThrow();
  });
});

describe('mutate', () => {
  it('touches ≈ mutationRate of genes with N(0, sigma) perturbations; untouched genes are bit-identical', () => {
    const cfg: GaConfig = { ...DEFAULT_GA, mutationRate: 0.1, mutationSigma: 0.2 };
    const rng = createPrng(4);
    const g = new Float32Array(50000); // all zeros: any non-zero gene was mutated
    const m = mutate(g, cfg, rng);
    const deltas: number[] = [];
    for (let i = 0; i < m.length; i++) {
      const v = m[i]!;
      if (v !== 0) deltas.push(v);
    }
    const rate = deltas.length / m.length;
    expect(rate).toBeGreaterThan(0.09);
    expect(rate).toBeLessThan(0.11);
    const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    const sd = Math.sqrt(deltas.reduce((s, d) => s + (d - mean) * (d - mean), 0) / deltas.length);
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(sd).toBeGreaterThan(0.18);
    expect(sd).toBeLessThan(0.22);
    // Original untouched.
    expect(g.every((v) => v === 0)).toBe(true);
  });

  it('with a non-zero genome, unmutated genes are copied bit-exactly and mutated ones differ', () => {
    const rng = createPrng(6);
    const g = randomGenome(DEFAULT_NN, createPrng(7), 1);
    const m = mutate(g, { ...DEFAULT_GA, mutationRate: 0.5 }, rng);
    let same = 0;
    for (let i = 0; i < g.length; i++) if (m[i] === g[i]) same++;
    expect(same).toBeGreaterThan(30);
    expect(same).toBeLessThan(80);
  });

  it('rate 0 ⇒ identical copy; rate 1 ⇒ every gene perturbed', () => {
    const g = randomGenome(DEFAULT_NN, createPrng(7), 1);
    expect(Array.from(mutate(g, { ...DEFAULT_GA, mutationRate: 0 }, createPrng(1)))).toEqual(
      Array.from(g),
    );
    const all = mutate(g, { ...DEFAULT_GA, mutationRate: 1 }, createPrng(1));
    for (let i = 0; i < g.length; i++) expect(all[i]).not.toBe(g[i]);
  });
});

describe('nextGeneration', () => {
  const scoredPop = (seed: number): ScoredGenome[] => {
    const rng = createPrng(seed);
    return initPopulation(DEFAULT_NN, DEFAULT_GA, rng).map((genome, i) => ({
      genome,
      fitness: (i * 37) % 101, // scrambled but deterministic fitness
    }));
  };

  it('returns populationSize genomes; the top eliteCount are copied bit-identically in rank order', () => {
    const scored = scoredPop(1);
    const next = nextGeneration(scored, DEFAULT_GA, createPrng(2));
    expect(next).toHaveLength(100);
    const ranked = rankIndices(scored);
    for (let e = 0; e < 5; e++) {
      expect(Array.from(next[e]!)).toEqual(Array.from(scored[ranked[e]!]!.genome));
      expect(next[e]).not.toBe(scored[ranked[e]!]!.genome); // a copy, not the same object
    }
  });

  it('offspring are mutated relatives of tournament winners (mutation-only: each equals some parent except at mutated genes)', () => {
    const scored = scoredPop(1);
    const next = nextGeneration(scored, DEFAULT_GA, createPrng(2));
    for (let c = 5; c < 100; c++) {
      const child = next[c]!;
      // Find the parent with the most identical genes; ≈ 90% should match.
      let bestMatch = 0;
      for (const p of scored) {
        let same = 0;
        for (let i = 0; i < 112; i++) if (child[i] === p.genome[i]) same++;
        bestMatch = Math.max(bestMatch, same);
      }
      expect(bestMatch).toBeGreaterThan(80);
    }
  });

  it('with crossover enabled, offspring genes each come from one of two parents (before mutation)', () => {
    const scored = scoredPop(3);
    const cfg: GaConfig = { ...DEFAULT_GA, crossoverEnabled: true, mutationRate: 0 };
    const next = nextGeneration(scored, cfg, createPrng(4));
    let mixed = 0;
    for (let c = 5; c < 100; c++) {
      const child = next[c]!;
      // Every gene must appear at that position in some parent…
      for (let i = 0; i < 112; i++) {
        expect(scored.some((p) => p.genome[i] === child[i])).toBe(true);
      }
      // …and most children should not be a pure copy of any single parent.
      const isClone = scored.some((p) => p.genome.every((v, i) => v === child[i]));
      if (!isClone) mixed++;
    }
    expect(mixed).toBeGreaterThan(80);
  });

  it('is deterministic: same scored population + same seed ⇒ identical next generation', () => {
    const scored = scoredPop(9);
    const a = nextGeneration(scored, DEFAULT_GA, createPrng(10));
    const b = nextGeneration(scored, DEFAULT_GA, createPrng(10));
    expect(a.map((g) => Array.from(g))).toEqual(b.map((g) => Array.from(g)));
    const c = nextGeneration(scored, DEFAULT_GA, createPrng(11));
    expect(c.map((g) => Array.from(g))).not.toEqual(a.map((g) => Array.from(g)));
  });

  it('never mutates the input genomes', () => {
    const scored = scoredPop(12);
    const copies = scored.map((s) => Array.from(s.genome));
    nextGeneration(scored, { ...DEFAULT_GA, crossoverEnabled: true }, createPrng(13));
    expect(scored.map((s) => Array.from(s.genome))).toEqual(copies);
  });
});
