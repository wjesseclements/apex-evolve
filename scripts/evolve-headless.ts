/**
 * Headless evolution run — prints a gen-by-gen history table. Node ≥ 22.18
 * (native TypeScript stripping):
 *
 *   node scripts/evolve-headless.ts [generations=30] [seed=42] [crossover=0|1]
 *
 * Nothing here is used by the app; it exists so learning curves can be
 * produced (and compared across seeds / crossover settings) without a browser.
 */
import { DEFAULT_GA, DEFAULT_NN, DEFAULT_SIM } from '../src/sim/config.ts';
import { createEvolution, runGenerations } from '../src/sim/engine/evolution.ts';
import { TRAINING_TRACK } from '../src/sim/track/tracks.ts';

const generations = Number(process.argv[2] ?? 30);
const seedArg = process.argv[3] ?? '42';
const seed: number | string = /^\d+$/.test(seedArg) ? Number(seedArg) : seedArg;
const crossoverEnabled = (process.argv[4] ?? '0') === '1';

const evo = createEvolution(TRAINING_TRACK, {
  sim: DEFAULT_SIM,
  ga: { ...DEFAULT_GA, crossoverEnabled },
  nn: DEFAULT_NN,
  seed,
});

const pad = (v: string | number, w: number) => String(v).padStart(w);
process.stdout.write(
  `seed=${String(seed)} crossover=${crossoverEnabled ? 'on' : 'off'} pop=${DEFAULT_GA.populationSize} episode=${DEFAULT_SIM.episode.seconds}s stall=${DEFAULT_SIM.episode.stallSeconds ?? 'off'}s\n`,
);
process.stdout.write('gen |   best |   mean | median | crash | stall | laps | ticks |   ms\n');
const t0 = performance.now();
for (let g = 0; g < generations; g++) {
  const s = performance.now();
  runGenerations(evo, 1);
  const r = evo.history[evo.history.length - 1];
  if (!r) break;
  process.stdout.write(
    `${pad(r.generation, 3)} | ${pad(r.best.toFixed(1), 6)} | ${pad(r.mean.toFixed(1), 6)} | ${pad(r.median.toFixed(1), 6)} | ${pad((r.crashRate * 100).toFixed(0) + '%', 5)} | ${pad((r.stallRate * 100).toFixed(0) + '%', 5)} | ${pad(r.lapCompletions, 4)} | ${pad(r.ticks, 5)} | ${pad((performance.now() - s).toFixed(0), 4)}\n`,
  );
}
process.stdout.write(
  `total ${(performance.now() - t0).toFixed(0)} ms; best ever ${evo.bestEver?.fitness.toFixed(1)} m at gen ${evo.bestEver?.generation}\n`,
);
