/**
 * Genetic algorithm operators (SPEC "Genetic algorithm"). Everything random
 * draws from the injected Prng, in a fixed order, so a seed fully determines
 * the next generation. Genomes are treated as immutable: every operator
 * returns a new Float32Array.
 *
 * nextGeneration(scored, cfg, rng):
 *   1. sort by fitness descending (ties broken by original index — deterministic);
 *   2. copy the top `eliteCount` genomes unchanged (bit-identical);
 *   3. fill the rest with offspring: parent(s) by tournament selection
 *      (k random contestants, best wins), uniform crossover of two parents when
 *      `crossoverEnabled` (each gene from either parent, p = 0.5) else a clone
 *      of one parent, then per-gene Gaussian mutation with probability
 *      `mutationRate` and standard deviation `mutationSigma`.
 */

import type { GaConfig, NetworkTopology } from '../config.ts';
import { randomGenome, type Genome } from '../nn/network.ts';
import type { Prng } from '../random/prng.ts';

export interface ScoredGenome {
  readonly genome: Genome;
  readonly fitness: number;
}

/** Fresh random population. */
export function initPopulation(t: NetworkTopology, cfg: GaConfig, rng: Prng): Genome[] {
  const pop: Genome[] = [];
  for (let i = 0; i < cfg.populationSize; i++) pop.push(randomGenome(t, rng, cfg.initSigma));
  return pop;
}

/**
 * Indices of `scored` sorted by fitness descending; equal fitness keeps the
 * lower original index first. Non-finite fitness sorts last.
 */
export function rankIndices(scored: readonly ScoredGenome[]): number[] {
  const idx = scored.map((_, i) => i);
  const key = (i: number): number => {
    const f = scored[i]?.fitness ?? -Infinity;
    return Number.isFinite(f) ? f : -Infinity;
  };
  idx.sort((a, b) => key(b) - key(a) || a - b);
  return idx;
}

/**
 * Tournament selection: draw k contestants uniformly (with replacement) and
 * return the index of the fittest (ties → the earliest drawn contestant).
 */
export function tournamentSelect(scored: readonly ScoredGenome[], k: number, rng: Prng): number {
  if (scored.length === 0) throw new Error('tournamentSelect: empty population');
  let best = rng.nextInt(scored.length);
  let bestFit = scored[best]?.fitness ?? -Infinity;
  for (let i = 1; i < k; i++) {
    const c = rng.nextInt(scored.length);
    const f = scored[c]?.fitness ?? -Infinity;
    if (f > bestFit) {
      best = c;
      bestFit = f;
    }
  }
  return best;
}

/** Uniform crossover: each gene comes from parent a or b with probability ½. */
export function uniformCrossover(a: Genome, b: Genome, rng: Prng): Genome {
  if (a.length !== b.length) throw new Error('uniformCrossover: parents differ in length');
  const child = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) child[i] = rng.nextFloat() < 0.5 ? (a[i] ?? 0) : (b[i] ?? 0);
  return child;
}

/** Per-gene Gaussian mutation; untouched genes are copied bit-exactly. */
export function mutate(g: Genome, cfg: GaConfig, rng: Prng): Genome {
  const out = new Float32Array(g.length);
  for (let i = 0; i < g.length; i++) {
    const v = g[i] ?? 0;
    out[i] = rng.nextFloat() < cfg.mutationRate ? v + rng.nextGaussian(0, cfg.mutationSigma) : v;
  }
  return out;
}

/** Breed the next generation from a scored population. */
export function nextGeneration(
  scored: readonly ScoredGenome[],
  cfg: GaConfig,
  rng: Prng,
): Genome[] {
  if (scored.length === 0) throw new Error('nextGeneration: empty population');
  const ranked = rankIndices(scored);
  const next: Genome[] = [];
  const elites = Math.min(cfg.eliteCount, cfg.populationSize, ranked.length);
  for (let e = 0; e < elites; e++) {
    const src = scored[ranked[e] ?? 0];
    if (src) next.push(new Float32Array(src.genome));
  }
  while (next.length < cfg.populationSize) {
    const p1 = scored[tournamentSelect(scored, cfg.tournamentK, rng)];
    if (!p1) throw new Error('nextGeneration: selection failed');
    let child: Genome;
    if (cfg.crossoverEnabled) {
      const p2 = scored[tournamentSelect(scored, cfg.tournamentK, rng)];
      if (!p2) throw new Error('nextGeneration: selection failed');
      child = uniformCrossover(p1.genome, p2.genome, rng);
    } else {
      child = p1.genome;
    }
    next.push(mutate(child, cfg, rng));
  }
  return next;
}
