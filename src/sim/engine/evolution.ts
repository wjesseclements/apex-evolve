/**
 * Evolution orchestrator (SPEC "Simulation engine"): runs a population of
 * NN-driven cars through episodes, scores them, breeds the next generation.
 *
 * Per tick: each living car's controls are the network output for its stored
 * observation (`car.sensors.inputs`, sensed at the end of the previous tick);
 * the world steps once. When the episode ends (timer, or every car dead) the
 * generation is scored — fitness = `car.progress.progress` in metres (lap-time
 * bonus arrives in Slice 4) — a GenerationRecord is appended, the GA breeds
 * the next population and a fresh world is created.
 *
 * `Evolution` is a mutable orchestrator object (it owns the Prng, whose state
 * advances); the worlds it holds are the usual immutable snapshots. All
 * randomness comes from its single seeded Prng, so a seed determines the whole
 * run bit-for-bit — verified by the reproducibility tests.
 */

import type { GaConfig, NetworkTopology, SimConfig } from '../config.ts';
import { initPopulation, nextGeneration, type ScoredGenome } from '../ga/ga.ts';
import { createScratch, forward, genomeLength, type Genome } from '../nn/network.ts';
import { NEUTRAL_CONTROLS, type CarControls } from '../physics/car.ts';
import { createPrng, type Prng } from '../random/prng.ts';
import { lapsOf } from '../track/progress.ts';
import type { Track } from '../track/track.ts';
import {
  allCarsDead,
  bestLapSeconds,
  createWorld,
  isEpisodeOver,
  stepWorld,
  type Car,
  type World,
} from './world.ts';

export interface EvolutionConfig {
  readonly sim: SimConfig;
  readonly ga: GaConfig;
  readonly nn: NetworkTopology;
  readonly seed: number | string;
}

export interface GenerationRecord {
  /** 0-based generation index. */
  readonly generation: number;
  /** Best / mean / median FITNESS (progress + lap bonus, metre-equivalent). */
  readonly best: number;
  readonly mean: number;
  readonly median: number;
  /** Best raw progress in metres (no bonus). */
  readonly bestProgress: number;
  /** Fraction of cars that died by touching a wall. */
  readonly crashRate: number;
  /** Fraction of cars that died by the stall rule. */
  readonly stallRate: number;
  /** Cars that completed ≥ 1 lap. */
  readonly lapCompletions: number;
  /** Index (in that generation's population) of the best car. */
  readonly bestIndex: number;
  /** Ticks the episode lasted. */
  readonly ticks: number;
  /** Fastest completed lap in the generation, sim seconds, or null if no car lapped. */
  readonly bestLapTime: number | null;
}

export interface BestLap {
  readonly seconds: number;
  readonly generation: number;
  readonly carIndex: number;
}

export interface BestEver {
  readonly fitness: number;
  readonly genome: Genome;
  readonly generation: number;
}

export interface Evolution {
  /** Current config. `ga` may be replaced mid-run via setGaConfig (marks the run modified). */
  cfg: EvolutionConfig;
  readonly track: Track;
  readonly rng: Prng;
  /**
   * False while the run is a pure function of (seed, initial config). Set by
   * any mid-run knob change or genome import: from then on the seed alone no
   * longer reproduces this run, and exports say so.
   */
  modified: boolean;
  generation: number;
  population: readonly Genome[];
  world: World;
  history: GenerationRecord[];
  bestEver: BestEver | null;
  bestLapEver: BestLap | null;
  /** Scratch buffers reused every tick (never part of the observable state). */
  readonly out: Float64Array;
  readonly scratch: Float64Array;
}

export function createEvolution(track: Track, cfg: EvolutionConfig): Evolution {
  const rng = createPrng(cfg.seed);
  const population = initPopulation(cfg.nn, cfg.ga, rng);
  return {
    cfg,
    track,
    rng,
    modified: false,
    generation: 0,
    population,
    world: createWorld(track, cfg.sim, population.length),
    history: [],
    bestEver: null,
    bestLapEver: null,
    out: new Float64Array(cfg.nn.outputs),
    scratch: createScratch(cfg.nn),
  };
}

/** Controls for car i from its genome and stored observation. */
function drive(evo: Evolution, i: number, car: Car): CarControls {
  if (!car.alive) return NEUTRAL_CONTROLS;
  const genome = evo.population[i];
  if (!genome) return NEUTRAL_CONTROLS;
  forward(evo.cfg.nn, genome, car.sensors.inputs, evo.out, evo.scratch);
  return { steering: evo.out[0] ?? 0, throttle: evo.out[1] ?? 0 };
}

/**
 * Fitness of a car: progress in metres, plus — once it has completed a lap —
 * cfg.fitness.lapBonus / (best lap seconds). Metre-equivalent units, so the
 * chart and stats keep their meaning.
 */
export function fitnessOf(car: Car, cfg: SimConfig): number {
  const bonus = cfg.fitness.lapBonus;
  if (bonus === 0) return car.progress.progress;
  const lap = bestLapSeconds(car, cfg.physics.dt);
  return lap === null ? car.progress.progress : car.progress.progress + bonus / lap;
}

/** Index of the car with the highest fitness so far (ties → lowest index). */
export function leaderIndex(world: World): number {
  let best = 0;
  let bestF = -Infinity;
  world.cars.forEach((c, i) => {
    const f = fitnessOf(c, world.cfg);
    if (f > bestF) {
      bestF = f;
      best = i;
    }
  });
  return best;
}

/** Has the current episode ended (timer elapsed or every car dead)? */
export function episodeDone(evo: Evolution): boolean {
  return isEpisodeOver(evo.world) || allCarsDead(evo.world);
}

/**
 * Advance one tick. If the current episode is over, the generation is scored
 * and the next one is started instead (that call performs no world tick).
 * Returns true when a generation boundary was crossed.
 */
export function stepEvolution(evo: Evolution): boolean {
  if (episodeDone(evo)) {
    finishGeneration(evo);
    return true;
  }
  evo.world = stepWorld(evo.world, (i, car) => drive(evo, i, car));
  return false;
}

/** Score the finished episode, record it, breed the next population, reset the world. */
export function finishGeneration(evo: Evolution): GenerationRecord {
  const cars = evo.world.cars;
  const scored: ScoredGenome[] = cars.map((car, i) => ({
    genome: evo.population[i] ?? new Float32Array(0),
    fitness: fitnessOf(car, evo.cfg.sim),
  }));
  const fits = scored.map((s) => s.fitness);
  const sorted = [...fits].sort((a, b) => a - b);
  const n = fits.length;
  const bestIndex = leaderIndex(evo.world);
  let bestLapTime: number | null = null;
  let bestLapCar = -1;
  cars.forEach((c, i) => {
    const t = bestLapSeconds(c, evo.cfg.sim.physics.dt);
    if (t !== null && (bestLapTime === null || t < bestLapTime)) {
      bestLapTime = t;
      bestLapCar = i;
    }
  });
  const record: GenerationRecord = {
    generation: evo.generation,
    best: fits[bestIndex] ?? 0,
    bestProgress: cars.reduce((m, c) => Math.max(m, c.progress.progress), 0),
    mean: n ? fits.reduce((a, b) => a + b, 0) / n : 0,
    median: medianOf(sorted),
    crashRate: n ? cars.filter((c) => c.deathCause === 'wall').length / n : 0,
    stallRate: n ? cars.filter((c) => c.deathCause === 'stall').length / n : 0,
    lapCompletions: cars.filter((c) => lapsOf(c.progress, evo.world.checkpoints) >= 1).length,
    bestIndex,
    ticks: evo.world.tick,
    bestLapTime,
  };
  evo.history.push(record);
  if (bestLapTime !== null && (evo.bestLapEver === null || bestLapTime < evo.bestLapEver.seconds)) {
    evo.bestLapEver = { seconds: bestLapTime, generation: evo.generation, carIndex: bestLapCar };
  }
  const bestGenome = evo.population[bestIndex];
  if (bestGenome && (evo.bestEver === null || record.best > evo.bestEver.fitness)) {
    evo.bestEver = {
      fitness: record.best,
      genome: new Float32Array(bestGenome),
      generation: evo.generation,
    };
  }
  evo.population = nextGeneration(scored, evo.cfg.ga, evo.rng);
  evo.generation += 1;
  evo.world = createWorld(evo.track, evo.cfg.sim, evo.population.length);
  return record;
}

/**
 * Replace the GA config for subsequent breeding steps (mutation rate,
 * crossover, …). Population size cannot change mid-run. Marks the run
 * modified when anything actually changed.
 */
export function setGaConfig(evo: Evolution, ga: GaConfig): void {
  if (ga.populationSize !== evo.cfg.ga.populationSize) {
    throw new Error('populationSize cannot change mid-run; restart instead');
  }
  const prev = evo.cfg.ga;
  const changed =
    ga.eliteCount !== prev.eliteCount ||
    ga.tournamentK !== prev.tournamentK ||
    ga.crossoverEnabled !== prev.crossoverEnabled ||
    ga.mutationRate !== prev.mutationRate ||
    ga.mutationSigma !== prev.mutationSigma ||
    ga.initSigma !== prev.initSigma;
  if (!changed) return;
  evo.cfg = { ...evo.cfg, ga };
  evo.modified = true;
}

/**
 * Put `genome` into population slot `slot` and restart the current
 * generation's episode so it drives from the start line. Marks the run
 * modified (a foreign genome has entered the breeding pool).
 */
export function injectGenome(evo: Evolution, genome: Genome, slot = 0): void {
  if (genome.length !== genomeLength(evo.cfg.nn)) {
    throw new Error(`genome length ${genome.length} ≠ ${genomeLength(evo.cfg.nn)}`);
  }
  if (slot < 0 || slot >= evo.population.length) throw new RangeError(`slot ${slot} out of range`);
  const pop = evo.population.slice();
  pop[slot] = new Float32Array(genome);
  evo.population = pop;
  evo.modified = true;
  evo.world = createWorld(evo.track, evo.cfg.sim, pop.length);
}

/** Median of an ascending-sorted array (0 for empty). */
function medianOf(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  const hi = sorted[mid] ?? 0;
  if (n % 2 === 1) return hi;
  const lo = sorted[mid - 1] ?? 0;
  return (lo + hi) / 2;
}

/** Run until `count` more generations have been completed (headless helper for tests/CLI). */
export function runGenerations(evo: Evolution, count: number): void {
  const target = evo.generation + count;
  while (evo.generation < target) stepEvolution(evo);
}
