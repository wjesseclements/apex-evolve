/**
 * Generalization protocol (fixed BEFORE running — Slice 4 approval):
 *   training seeds 42, 43, 44, 45, 46; 40 generations each; the champion
 *   (bestEver) is run SOLO for one 30 s episode on the OTHER track; report
 *   progress, laps, death cause + tick. Both directions (A→B and B→A). For
 *   context the champion is also replayed solo on its own track.
 *
 *   node scripts/generalize.ts [generations=40] [seeds=42,43,44,45,46]
 */
import { DEFAULT_GA, DEFAULT_NN, DEFAULT_SIM } from '../src/sim/config.ts';
import { createEvolution, runGenerations } from '../src/sim/engine/evolution.ts';
import { createWorld, stepWorld } from '../src/sim/engine/world.ts';
import { createScratch, forward, type Genome } from '../src/sim/nn/network.ts';
import { HELDOUT_TRACK, TRAINING_TRACK, type TrackId } from '../src/sim/track/tracks.ts';
import type { Track } from '../src/sim/track/track.ts';

const generations = Number(process.argv[2] ?? 40);
const seeds = (process.argv[3] ?? '42,43,44,45,46').split(',').map((s) => Number(s));

interface Solo {
  progress: number;
  laps: number;
  lapTimes: number[];
  cause: 'wall' | 'stall' | 'alive';
  tick: number;
}

function solo(track: Track, genome: Genome): Solo {
  let w = createWorld(track, DEFAULT_SIM, 1);
  const out = new Float64Array(2);
  const scratch = createScratch(DEFAULT_NN);
  let t = 0;
  for (; t < 1800; t++) {
    w = stepWorld(w, (_, car) => {
      forward(DEFAULT_NN, genome, car.sensors.inputs, out, scratch);
      return { steering: out[0] ?? 0, throttle: out[1] ?? 0 };
    });
    if (!w.cars[0]?.alive) break;
  }
  const car = w.cars[0];
  if (!car) throw new Error('no car');
  const lapTimes: number[] = [];
  let prev = 0;
  for (const lt of car.lapTicks) {
    lapTimes.push((lt - prev) / 60);
    prev = lt;
  }
  return {
    progress: car.progress.progress,
    laps: car.lapTicks.length,
    lapTimes,
    cause: car.alive ? 'alive' : (car.deathCause ?? 'wall'),
    tick: car.alive ? 1800 : (car.crashedAtTick ?? t),
  };
}

const fmt = (s: Solo) =>
  `${s.progress.toFixed(1).padStart(6)} m  laps ${s.laps}${s.lapTimes.length ? ' [' + s.lapTimes.map((x) => x.toFixed(1)).join(',') + ' s]' : ''}  ${s.cause}@${s.tick}`;

const tracks: Record<TrackId, Track> = { training: TRAINING_TRACK, heldout: HELDOUT_TRACK };
for (const [from, to] of [
  ['training', 'heldout'],
  ['heldout', 'training'],
] as const) {
  process.stdout.write(
    `\n=== train on ${from} (${tracks[from].totalLength.toFixed(0)} m), ${generations} generations → test champion solo on ${to} (${tracks[to].totalLength.toFixed(0)} m)\n`,
  );
  process.stdout.write(
    'seed | champ gen | train fitness | first lap gen | own-track solo                                | other-track solo\n',
  );
  for (const seed of seeds) {
    const evo = createEvolution(tracks[from], {
      sim: DEFAULT_SIM,
      ga: DEFAULT_GA,
      nn: DEFAULT_NN,
      seed,
    });
    runGenerations(evo, generations);
    const best = evo.bestEver;
    if (!best) continue;
    const firstLap = evo.history.findIndex((r) => r.lapCompletions > 0);
    const own = solo(tracks[from], best.genome);
    const other = solo(tracks[to], best.genome);
    process.stdout.write(
      `${String(seed).padStart(4)} | ${String(best.generation).padStart(9)} | ${best.fitness.toFixed(1).padStart(13)} | ${String(firstLap).padStart(13)} | ${fmt(own).padEnd(45)} | ${fmt(other)}\n`,
    );
  }
}
