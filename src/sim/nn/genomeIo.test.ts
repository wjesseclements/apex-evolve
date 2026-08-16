import { describe, expect, it } from 'vitest';
import { DEFAULT_GA, DEFAULT_NN, DEFAULT_SIM, NO_GRIP_SIM } from '../config.ts';
import {
  createEvolution,
  injectGenome,
  runGenerations,
  setGaConfig,
  stepEvolution,
} from '../engine/evolution.ts';
import { createWorld, stepWorld, type World } from '../engine/world.ts';
import { createPrng } from '../random/prng.ts';
import { TRAINING_TRACK } from '../track/tracks.ts';
import { buildGenomeExport, parseGenomeExport, type GenomeExport } from './genomeIo.ts';
import { createScratch, forward, randomGenome, type Genome } from './network.ts';

/** Replay equivalence is about determinism, not dynamics: use the fast-learning no-grip model. */
const CFG = { sim: NO_GRIP_SIM, ga: DEFAULT_GA, nn: DEFAULT_NN, seed: 42 };

/** Drive one car with `g` alone for a whole episode; return its per-tick states. */
function soloTrajectory(g: Genome): { x: number; y: number; heading: number; speed: number }[] {
  let w: World = createWorld(TRAINING_TRACK, NO_GRIP_SIM, 1);
  const out = new Float64Array(2);
  const scratch = createScratch(DEFAULT_NN);
  const traj = [];
  for (let t = 0; t < 1800; t++) {
    w = stepWorld(w, (_, car) => {
      forward(DEFAULT_NN, g, car.sensors.inputs, out, scratch);
      return { steering: out[0] ?? 0, throttle: out[1] ?? 0 };
    });
    traj.push({ ...w.cars[0]!.state });
    if (!w.cars[0]!.alive) break;
  }
  return traj;
}

describe('buildGenomeExport / parseGenomeExport', () => {
  it('round-trips a genome through JSON bit-exactly with honest metadata', () => {
    const g = randomGenome(DEFAULT_NN, createPrng(5), 1);
    const exp = buildGenomeExport({
      genome: g,
      topology: DEFAULT_NN,
      generation: 12,
      fitness: 456.7,
      seed: 42,
      ga: DEFAULT_GA,
      modified: false,
      track: 'training',
      exportedAt: '2026-08-15T00:00:00.000Z',
    });
    const json: unknown = JSON.parse(JSON.stringify(exp));
    const parsed = parseGenomeExport(json, DEFAULT_NN);
    expect(Array.from(parsed.genome)).toEqual(Array.from(g));
    expect(parsed.generation).toBe(12);
    expect(parsed.fitness).toBe(456.7);
    expect(parsed.modified).toBe(false);
    expect((json as GenomeExport).seed).toBe(42);
    expect((json as GenomeExport).ga).toEqual(DEFAULT_GA);
  });

  it('accepts a bare genome array and rejects bad documents', () => {
    const g = randomGenome(DEFAULT_NN, createPrng(6), 1);
    expect(Array.from(parseGenomeExport(Array.from(g), DEFAULT_NN).genome)).toEqual(Array.from(g));
    expect(() => parseGenomeExport('x', DEFAULT_NN)).toThrow('object');
    expect(() => parseGenomeExport({ format: 'nope' }, DEFAULT_NN)).toThrow('unknown format');
    expect(() => parseGenomeExport({ format: 'apex-evolve-genome' }, DEFAULT_NN)).toThrow(
      'topology',
    );
    expect(() =>
      parseGenomeExport(
        {
          format: 'apex-evolve-genome',
          topology: { inputs: 8, hidden: 12, outputs: 2 },
          genome: [],
        },
        DEFAULT_NN,
      ),
    ).toThrow('does not match');
    expect(() =>
      parseGenomeExport(
        { format: 'apex-evolve-genome', topology: DEFAULT_NN, genome: [1, 2] },
        DEFAULT_NN,
      ),
    ).toThrow('112');
  });
});

describe('replay equivalence (checklist: exported genome re-imports and reproduces the same driving)', () => {
  it('a genome driven alone, exported, re-imported and driven again gives the identical trajectory', () => {
    const evo = createEvolution(TRAINING_TRACK, CFG);
    runGenerations(evo, 8); // seed 42 has lapping cars by gen 7
    const best = evo.bestEver!;
    const a = soloTrajectory(best.genome);
    const doc: unknown = JSON.parse(
      JSON.stringify(
        buildGenomeExport({
          genome: best.genome,
          topology: DEFAULT_NN,
          generation: best.generation,
          fitness: best.fitness,
          seed: 42,
          ga: DEFAULT_GA,
          modified: evo.modified,
          track: TRAINING_TRACK.name,
          exportedAt: 'test',
        }),
      ),
    );
    const g2 = parseGenomeExport(doc, DEFAULT_NN).genome;
    expect(soloTrajectory(g2)).toStrictEqual(a);
    expect(a.length).toBe(1800); // the champion survives the whole episode
  }, 120000);

  it('injectGenome puts the genome in slot 0, restarts the episode, marks the run modified, and car 0 replays the solo trajectory (ghost cars)', () => {
    const src = createEvolution(TRAINING_TRACK, CFG);
    runGenerations(src, 8);
    const g = src.bestEver!.genome;
    const solo = soloTrajectory(g);

    const dst = createEvolution(TRAINING_TRACK, { ...CFG, seed: 7 });
    for (let t = 0; t < 100; t++) stepEvolution(dst); // mid-episode
    expect(dst.modified).toBe(false);
    injectGenome(dst, g, 0);
    expect(dst.modified).toBe(true);
    expect(dst.world.tick).toBe(0);
    expect(Array.from(dst.population[0]!)).toEqual(Array.from(g));
    const traj = [];
    for (let t = 0; t < 1800; t++) {
      stepEvolution(dst);
      traj.push({ ...dst.world.cars[0]!.state });
    }
    expect(traj).toStrictEqual(solo);
  }, 120000);
});

describe('setGaConfig', () => {
  it('applies to later breeding, marks modified only on a real change, and refuses population size changes', () => {
    const evo = createEvolution(TRAINING_TRACK, CFG);
    setGaConfig(evo, { ...DEFAULT_GA });
    expect(evo.modified).toBe(false);
    setGaConfig(evo, { ...DEFAULT_GA, mutationRate: 0.3 });
    expect(evo.modified).toBe(true);
    expect(evo.cfg.ga.mutationRate).toBe(0.3);
    expect(() => setGaConfig(evo, { ...DEFAULT_GA, populationSize: 50 })).toThrow('populationSize');
  });

  it('a knob change changes the run relative to the seed-only run', () => {
    const a = createEvolution(TRAINING_TRACK, {
      ...CFG,
      sim: { ...DEFAULT_SIM, episode: { ...DEFAULT_SIM.episode, seconds: 6 } },
    });
    const b = createEvolution(TRAINING_TRACK, {
      ...CFG,
      sim: { ...DEFAULT_SIM, episode: { ...DEFAULT_SIM.episode, seconds: 6 } },
    });
    runGenerations(a, 1);
    runGenerations(b, 1);
    setGaConfig(b, { ...DEFAULT_GA, mutationRate: 0.4 });
    runGenerations(a, 2);
    runGenerations(b, 2);
    expect(a.history[0]).toStrictEqual(b.history[0]);
    expect(a.history[2]).not.toStrictEqual(b.history[2]);
  }, 60000);
});
