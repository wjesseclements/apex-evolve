import { describe, expect, it } from 'vitest';
import { DEFAULT_GA, DEFAULT_NN, DEFAULT_SIM, type SimConfig } from '../config.ts';
import { SQUARE } from '../testing/fixtures.ts';
import { buildTrack } from '../track/track.ts';
import { TRAINING_TRACK } from '../track/tracks.ts';
import {
  createEvolution,
  episodeDone,
  fitnessOf,
  finishGeneration,
  leaderIndex,
  runGenerations,
  stepEvolution,
  type EvolutionConfig,
  type GenerationRecord,
} from './evolution.ts';

const CFG: EvolutionConfig = { sim: DEFAULT_SIM, ga: DEFAULT_GA, nn: DEFAULT_NN, seed: 42 };
/** Shorter episodes keep the reproducibility runs cheap. */
const SHORT_SIM: SimConfig = { ...DEFAULT_SIM, episode: { ...DEFAULT_SIM.episode, seconds: 8 } };
const SHORT: EvolutionConfig = { ...CFG, sim: SHORT_SIM };

describe('createEvolution / stepEvolution', () => {
  it('starts at generation 0 with populationSize genomes and cars', () => {
    const evo = createEvolution(TRAINING_TRACK, CFG);
    expect(evo.generation).toBe(0);
    expect(evo.population).toHaveLength(100);
    expect(evo.world.cars).toHaveLength(100);
    expect(evo.history).toEqual([]);
    expect(evo.bestEver).toBeNull();
  });

  it('cars are driven by their networks: after some ticks, cars differ from each other and from the spawn', () => {
    const evo = createEvolution(TRAINING_TRACK, CFG);
    for (let t = 0; t < 120; t++) expect(stepEvolution(evo)).toBe(false);
    expect(evo.world.tick).toBe(120);
    const xs = new Set(evo.world.cars.map((c) => c.state.x.toFixed(3)));
    expect(xs.size).toBeGreaterThan(20);
    expect(evo.world.cars.some((c) => c.state.x > 5)).toBe(true);
  });

  it('crosses a generation boundary when the episode ends: history grows, generation increments, world resets', () => {
    const evo = createEvolution(TRAINING_TRACK, SHORT);
    let boundaries = 0;
    let steps = 0;
    while (boundaries < 2 && steps < 100000) {
      if (stepEvolution(evo)) boundaries++;
      steps++;
    }
    expect(boundaries).toBe(2);
    expect(evo.generation).toBe(2);
    expect(evo.history).toHaveLength(2);
    expect(evo.history[0]!.generation).toBe(0);
    expect(evo.history[1]!.generation).toBe(1);
    expect(evo.world.tick).toBe(0); // fresh world after the boundary
    expect(evo.world.cars.every((c) => c.alive)).toBe(true);
    expect(episodeDone(evo)).toBe(false);
  });

  it('fitness = progress in metres; leaderIndex is the argmax with lowest-index tie-break', () => {
    const evo = createEvolution(TRAINING_TRACK, CFG);
    for (let t = 0; t < 200; t++) stepEvolution(evo);
    const li = leaderIndex(evo.world);
    const best = Math.max(...evo.world.cars.map(fitnessOf));
    expect(fitnessOf(evo.world.cars[li]!)).toBe(best);
    expect(evo.world.cars.findIndex((c) => fitnessOf(c) === best)).toBe(li);
    expect(fitnessOf(evo.world.cars[li]!)).toBe(evo.world.cars[li]!.progress.progress);
  });
});

describe('finishGeneration', () => {
  it('records best/mean/median/crash/stall/laps/ticks consistently and copies the best genome into bestEver', () => {
    const evo = createEvolution(TRAINING_TRACK, SHORT);
    while (!episodeDone(evo)) stepEvolution(evo);
    const cars = evo.world.cars;
    const fits = cars.map(fitnessOf);
    const popBefore = evo.population;
    const rec = finishGeneration(evo);
    expect(rec.best).toBe(Math.max(...fits));
    expect(rec.mean).toBeCloseTo(fits.reduce((a, b) => a + b, 0) / fits.length, 9);
    const sorted = [...fits].sort((a, b) => a - b);
    expect(rec.median).toBeCloseTo((sorted[49]! + sorted[50]!) / 2, 9);
    expect(rec.crashRate + rec.stallRate).toBeLessThanOrEqual(1);
    expect(rec.crashRate).toBeCloseTo(cars.filter((c) => c.deathCause === 'wall').length / 100, 12);
    expect(rec.stallRate).toBeCloseTo(
      cars.filter((c) => c.deathCause === 'stall').length / 100,
      12,
    );
    expect(rec.lapCompletions).toBe(0);
    expect(rec.ticks).toBeGreaterThan(0);
    expect(evo.bestEver).not.toBeNull();
    expect(evo.bestEver!.fitness).toBe(rec.best);
    expect(evo.bestEver!.generation).toBe(0);
    expect(Array.from(evo.bestEver!.genome)).toEqual(Array.from(popBefore[rec.bestIndex]!));
    // Elites (top 5 by fitness) survive bit-exactly into the new population.
    const ranked = fits.map((f, i) => [f, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let e = 0; e < 5; e++) {
      expect(Array.from(evo.population[e]!)).toEqual(Array.from(popBefore[ranked[e]![1]]!));
    }
    expect(evo.population).toHaveLength(100);
    expect(evo.generation).toBe(1);
  });

  it('bestEver only improves', () => {
    const evo = createEvolution(TRAINING_TRACK, SHORT);
    runGenerations(evo, 6);
    let running = -Infinity;
    for (const r of evo.history) running = Math.max(running, r.best);
    expect(evo.bestEver!.fitness).toBe(running);
    const gen = evo.history.findIndex((r) => r.best === running);
    expect(evo.bestEver!.generation).toBe(gen);
  });
});

describe('reproducibility (SPEC success criterion 2)', () => {
  it('two fresh runs with the same seed produce identical gen-10 best fitness AND identical full histories', () => {
    const a = createEvolution(TRAINING_TRACK, SHORT);
    const b = createEvolution(TRAINING_TRACK, SHORT);
    runGenerations(a, 10);
    runGenerations(b, 10);
    expect(a.history[9]!.best).toBe(b.history[9]!.best);
    expect(a.history).toStrictEqual(b.history);
    expect(a.population.map((g) => Array.from(g))).toEqual(b.population.map((g) => Array.from(g)));
    expect(a.rng.state()).toBe(b.rng.state());
  }, 60000);

  it('a different seed produces a different history', () => {
    const a = createEvolution(TRAINING_TRACK, SHORT);
    const b = createEvolution(TRAINING_TRACK, { ...SHORT, seed: 43 });
    runGenerations(a, 2);
    runGenerations(b, 2);
    expect(a.history).not.toStrictEqual(b.history);
  }, 30000);

  it('string seeds work end to end', () => {
    const a = createEvolution(TRAINING_TRACK, { ...SHORT, seed: 'apex' });
    const b = createEvolution(TRAINING_TRACK, { ...SHORT, seed: 'apex' });
    runGenerations(a, 1);
    runGenerations(b, 1);
    expect(a.history).toStrictEqual(b.history);
  }, 30000);
});

describe('determinism across speed settings (Slice 3 checklist)', () => {
  /**
   * The frame loop only decides HOW MANY ticks run per frame; the tick itself
   * is identical. Stepping the same seed in batches of 1, 7, 60 and random
   * "budget-shaped" sizes must give bit-identical histories and worlds.
   */
  const stepInBatches = (batch: () => number, ticks: number) => {
    const evo = createEvolution(TRAINING_TRACK, SHORT);
    let done = 0;
    while (done < ticks) {
      const n = Math.min(batch(), ticks - done);
      for (let i = 0; i < n; i++) stepEvolution(evo);
      done += n;
    }
    return evo;
  };

  it('batches of 1, 7, 60 and pseudo-random sizes ⇒ identical histories, worlds, populations', () => {
    const TICKS = 3000; // a few generations of 8 s episodes
    const a = stepInBatches(() => 1, TICKS);
    const b = stepInBatches(() => 7, TICKS);
    const c = stepInBatches(() => 60, TICKS);
    let x = 12345;
    const d = stepInBatches(() => {
      x = (x * 1103515245 + 12345) % 2147483648; // LCG, test-only
      return 1 + (x % 250);
    }, TICKS);
    expect(a.history.length).toBeGreaterThan(2);
    for (const other of [b, c, d]) {
      expect(other.history).toStrictEqual(a.history);
      expect(other.generation).toBe(a.generation);
      expect(other.world.tick).toBe(a.world.tick);
      expect(other.world).toStrictEqual(a.world);
      expect(other.population.map((g) => Array.from(g))).toEqual(
        a.population.map((g) => Array.from(g)),
      );
      expect(other.rng.state()).toBe(a.rng.state());
    }
  }, 120000);
});

describe('learning (default config, seed 42, training track) — deterministic so not flaky', () => {
  it('mean progress at gen 15 far exceeds gen 0, and at least one lap is completed by gen 15', () => {
    const evo = createEvolution(TRAINING_TRACK, CFG);
    runGenerations(evo, 16);
    const g0 = evo.history[0]!;
    const g15 = evo.history[15]!;
    expect(g15.mean).toBeGreaterThan(g0.mean * 5);
    expect(g15.best).toBeGreaterThan(g0.best);
    expect(evo.history.some((r) => r.lapCompletions > 0)).toBe(true);
    expect(g15.stallRate).toBeLessThan(g0.stallRate);
  }, 120000);
});

describe('golden generation record — BIT-EXACT across engines', () => {
  it('seed 42, default config, generation 3 record', () => {
    const evo = createEvolution(TRAINING_TRACK, CFG);
    runGenerations(evo, 4);
    expect(evo.history[3]).toEqual(GOLDEN_GEN3);
  }, 60000);
});

describe('square track smoke', () => {
  it('runs on a different track without error', () => {
    const evo = createEvolution(buildTrack(SQUARE), {
      ...SHORT,
      ga: { ...DEFAULT_GA, populationSize: 10 },
    });
    runGenerations(evo, 2);
    expect(evo.history).toHaveLength(2);
    expect(evo.population).toHaveLength(10);
  });
});

const GOLDEN_GEN3: GenerationRecord = {
  generation: 3,
  best: 259.9723771089442,
  mean: 79.95278254676413,
  median: 96.7192252230252,
  crashRate: 0.98,
  stallRate: 0.02,
  lapCompletions: 0,
  bestIndex: 94,
  ticks: 617,
};
