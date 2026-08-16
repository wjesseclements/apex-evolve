/**
 * Train, then dissect the champion's driving. Node ≥ 22.18:
 *
 *   node scripts/inspect-champion.ts [generations=60] [seed=42] [gripA=default|off|<m/s²>]
 *
 * Runs bestEver solo for one episode on the training track and prints: laps
 * and lap times, the fraction of ticks spent braking (throttle < 0), coasting
 * (0 ≤ throttle < 0.5) and on full throttle, mean/min speed, and a histogram
 * of WHERE along the lap the brake is applied (arc-length bins), which is the
 * "does it brake for corners" evidence.
 */
import { DEFAULT_GA, DEFAULT_NN, DEFAULT_SIM } from '../src/sim/config.ts';
import { createEvolution, runGenerations } from '../src/sim/engine/evolution.ts';
import { createWorld, stepWorld } from '../src/sim/engine/world.ts';
import { createScratch, forward } from '../src/sim/nn/network.ts';
import { TRAINING_TRACK } from '../src/sim/track/tracks.ts';

const generations = Number(process.argv[2] ?? 60);
const seedArg = process.argv[3] ?? '42';
const seed: number | string = /^\d+$/.test(seedArg) ? Number(seedArg) : seedArg;
const gripArg = process.argv[4] ?? 'default';
const lateralAccelMax =
  gripArg === 'default'
    ? DEFAULT_SIM.physics.lateralAccelMax
    : gripArg === 'off'
      ? null
      : Number(gripArg);
const sim = { ...DEFAULT_SIM, physics: { ...DEFAULT_SIM.physics, lateralAccelMax } };
const track = TRAINING_TRACK;

const evo = createEvolution(track, { sim, ga: DEFAULT_GA, nn: DEFAULT_NN, seed });
runGenerations(evo, generations);
const best = evo.bestEver;
if (!best) throw new Error('no champion');
const firstLapGen = evo.history.findIndex((r) => r.lapCompletions > 0);
process.stdout.write(
  `seed=${String(seed)} grip=${lateralAccelMax ?? 'off'} gens=${generations} champion: gen ${best.generation}, fitness ${best.fitness.toFixed(1)}; first lap at gen ${firstLapGen}; best lap ever ${evo.bestLapEver ? evo.bestLapEver.seconds.toFixed(2) + ' s (gen ' + evo.bestLapEver.generation + ')' : '—'}\n`,
);

// Solo episode
let w = createWorld(track, sim, 1);
const out = new Float64Array(2);
const scratch = createScratch(DEFAULT_NN);
const L = track.totalLength;
const BIN = 20; // metres
const bins = Math.ceil(L / BIN);
const brakeBins = new Array<number>(bins).fill(0);
const tickBins = new Array<number>(bins).fill(0);
const speedBins = new Array<number>(bins).fill(0);
let brake = 0;
let coast = 0;
let full = 0;
let ticks = 0;
let speedSum = 0;
let minSpeed = Infinity;
let maxSpeed = 0;
let prevLaps = 0;
let lapStart = 0;
const lapTimes: number[] = [];
for (let t = 1; t <= 1800; t++) {
  w = stepWorld(w, (_, car) => {
    forward(DEFAULT_NN, best.genome, car.sensors.inputs, out, scratch);
    return { steering: out[0] ?? 0, throttle: out[1] ?? 0 };
  });
  const car = w.cars[0];
  if (!car) break;
  const th = car.controls.throttle;
  ticks++;
  if (th < 0) brake++;
  else if (th < 0.5) coast++;
  else full++;
  speedSum += car.state.speed;
  minSpeed = Math.min(minSpeed, car.state.speed);
  maxSpeed = Math.max(maxSpeed, car.state.speed);
  const arc = ((car.progress.s % L) + L) % L;
  const b = Math.min(bins - 1, Math.floor(arc / BIN));
  tickBins[b] = (tickBins[b] ?? 0) + 1;
  speedBins[b] = (speedBins[b] ?? 0) + car.state.speed;
  if (th < 0) brakeBins[b] = (brakeBins[b] ?? 0) + 1;
  const laps = car.lapTicks.length;
  if (laps > prevLaps) {
    lapTimes.push((t - lapStart) * sim.physics.dt);
    lapStart = t;
    prevLaps = laps;
  }
  if (!car.alive) {
    process.stdout.write(
      `  died at tick ${t} (${car.deathCause}) after ${car.progress.progress.toFixed(1)} m\n`,
    );
    break;
  }
}
process.stdout.write(
  `  solo: ${ticks} ticks, progress ${w.cars[0]?.progress.progress.toFixed(1)} m, laps ${lapTimes.length} [${lapTimes.map((x) => x.toFixed(2)).join(', ')}] s\n` +
    `  throttle: brake ${((100 * brake) / ticks).toFixed(1)}% · coast ${((100 * coast) / ticks).toFixed(1)}% · full ${((100 * full) / ticks).toFixed(1)}% of ticks; speed mean ${(speedSum / ticks).toFixed(1)}, min ${minSpeed.toFixed(1)}, max ${maxSpeed.toFixed(1)} m/s\n` +
    `  where it brakes (arc bin → % of ticks in bin braking, mean speed):\n`,
);
for (let b = 0; b < bins; b++) {
  const n = tickBins[b] ?? 0;
  if (n === 0) continue;
  const pct = (100 * (brakeBins[b] ?? 0)) / n;
  const v = (speedBins[b] ?? 0) / n;
  const bar = '#'.repeat(Math.round(pct / 5));
  process.stdout.write(
    `    ${String(b * BIN).padStart(3)}–${String(Math.min(L, (b + 1) * BIN)).padStart(3)} m  ${pct.toFixed(0).padStart(3)}%  ${v.toFixed(1).padStart(5)} m/s  ${bar}\n`,
  );
}
