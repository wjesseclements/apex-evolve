import { BENCHMARK } from '../sim/config.ts';
import { fitnessOf } from '../sim/engine/evolution.ts';
import { bestLapSeconds, isEpisodeOver } from '../sim/engine/world.ts';
import { FitnessChart } from './FitnessChart.tsx';
import { Inspector } from './Inspector.tsx';
import { lapsOf, nextCheckpointIndex } from '../sim/track/progress.ts';
import type { ReactNode } from 'react';
import type { Speed } from './tickPlanner.ts';
import type { HudSnapshot } from './useSimLoop.ts';

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

function radToDeg(r: number): number {
  return (r * 180) / Math.PI;
}

/** Wrap an unwrapped heading to (−180°, 180°] for display only. */
function headingDeg(r: number): number {
  let d = radToDeg(r) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

const INPUT_LABELS = ['L90', 'L60', 'L30', 'F', 'R30', 'R60', 'R90', 'v'];
/** Show the plateau hint once a run has gone this many generations without a lap. */
const PLATEAU_HINT_FROM = 15;

export function Hud({
  hud,
  debug,
  showSensors,
  paused,
  speed,
  runControls,
}: {
  hud: HudSnapshot | null;
  debug: boolean;
  showSensors: boolean;
  paused: boolean;
  speed: Speed;
  /** Rendered between the evolution stats/chart and the inspector (Evolve mode). */
  runControls?: ReactNode;
}) {
  const world = hud?.world;
  const evo = hud?.evolution ?? null;
  const car = world?.cars[hud?.focusIndex ?? 0];
  const s = car?.state;
  const c = car?.controls;
  const inputs = car?.sensors.inputs;
  const over = world ? isEpisodeOver(world) : false;
  const cps = world?.checkpoints;
  const prog = car?.progress;
  const laps = prog && cps ? lapsOf(prog, cps) : 0;
  const lapProgress = prog && cps ? prog.progress - laps * cps.totalLength : 0;
  const lapPct = cps ? (lapProgress / cps.totalLength) * 100 : 0;
  const status = !car
    ? '—'
    : !car.alive
      ? car.deathCause === 'stall'
        ? 'STALLED'
        : 'CRASHED'
      : over
        ? 'TIME UP'
        : 'ALIVE';
  const statusClass =
    status === 'ALIVE' ? 'hud__alive' : status === 'TIME UP' ? 'hud__over' : 'hud__dead';

  const alive = world ? world.cars.filter((x) => x.alive).length : 0;
  const liveBest = world ? Math.max(0, ...world.cars.map((x) => fitnessOf(x, world.cfg))) : 0;
  const liveLaps = world && cps ? world.cars.filter((x) => lapsOf(x.progress, cps) >= 1).length : 0;
  const lastGen = evo?.history[evo.history.length - 1];
  const dt = world?.cfg.physics.dt ?? 1 / 60;
  const liveBestLap = world
    ? world.cars.reduce<number | null>((acc, x) => {
        const t = bestLapSeconds(x, dt);
        return t !== null && (acc === null || t < acc) ? t : acc;
      }, null)
    : null;

  return (
    <aside className="hud" aria-label="Stats">
      {evo && world && evo.generation >= PLATEAU_HINT_FROM && evo.bestLapEver === null && (
        <p className="hint" role="status">
          <strong>Nothing lapping yet?</strong> That is normal here: the population is failing the
          left-hand kink at speed. On the benchmark seed {BENCHMARK.seed} the breakthrough comes at
          generation {BENCHMARK.firstLapGeneration}
          {evo.cfg.seed === BENCHMARK.seed && !evo.modified ? ' — this run' : ''}. Try <kbd>4</kbd>{' '}
          (max speed), or <a href="?seed=43">seed 43</a> /{' '}
          <a href={`?seed=${String(evo.cfg.seed)}&crossover=1`}>crossover on</a> for a faster
          learner.
        </p>
      )}
      {evo && world && (
        <>
          <h2 className="hud__title">Evolution</h2>
          <dl className="hud__grid hud__grid--big">
            <dt>Generation</dt>
            <dd>{evo.generation}</dd>
            <dt>Alive</dt>
            <dd>
              {alive} / {world.cars.length}
            </dd>
            <dt>Best (this gen)</dt>
            <dd>{fmt(liveBest)} fitness</dd>
            <dt>Best ever</dt>
            <dd>
              {evo.bestEver
                ? `${fmt(evo.bestEver.fitness)}  (gen ${evo.bestEver.generation})`
                : '—'}
            </dd>
            <dt>Mean (last gen)</dt>
            <dd>
              {lastGen
                ? `${fmt(lastGen.mean)} · best progress ${fmt(lastGen.bestProgress)} m`
                : '—'}
            </dd>
            <dt>Deaths (last gen)</dt>
            <dd>
              {lastGen
                ? `crash ${fmt(lastGen.crashRate * 100, 0)}% · stall ${fmt(lastGen.stallRate * 100, 0)}%`
                : '—'}
            </dd>
            <dt>Laps (this gen)</dt>
            <dd>{liveLaps}</dd>
            <dt>Best lap</dt>
            <dd>{liveBestLap !== null ? `${fmt(liveBestLap, 2)} s (this gen)` : '—'}</dd>
            <dt>Best lap ever</dt>
            <dd>
              {evo.bestLapEver
                ? `${fmt(evo.bestLapEver.seconds, 2)} s (gen ${evo.bestLapEver.generation})`
                : '—'}
            </dd>
            <dt>Episode</dt>
            <dd>{`${fmt(world.time)} / ${fmt(world.cfg.episode.seconds, 0)} s`}</dd>
            <dt>Speed</dt>
            <dd>
              {paused ? 'paused' : speed === 'max' ? 'max' : `${speed}×`}
              {hud ? ` · ${fmt(hud.ticksPerSecond / 60, 1)}× real time` : ''}
            </dd>
            <dt>Track</dt>
            <dd>{world.track.name === 'training' ? 'A — training' : 'B — held-out'}</dd>
            <dt>Seed</dt>
            <dd>
              {String(evo.cfg.seed)}
              {evo.modified ? ' · modified' : ''}
            </dd>
            <dt>GA</dt>
            <dd>{`mut ${evo.cfg.ga.mutationRate.toFixed(2)} · xover ${evo.cfg.ga.crossoverEnabled ? 'on' : 'off'}`}</dd>
          </dl>
          <h3 className="hud__sub">Fitness per generation (metres + lap bonus)</h3>
          <FitnessChart history={evo.history} />
          {runControls}
        </>
      )}
      {car && world && (
        <Inspector
          car={car}
          vMax={world.cfg.physics.vMax}
          fitness={fitnessOf(car, world.cfg)}
          title={
            evo
              ? hud?.selected
                ? `Inspector — car #${hud.focusIndex} (selected · Esc to deselect)`
                : `Inspector — leader (car #${hud?.focusIndex ?? 0}) · click a car to select`
              : 'Inspector — your car'
          }
        />
      )}
      <h2 className="hud__title">Telemetry</h2>
      <dl className="hud__grid">
        <dt>Status</dt>
        <dd className={statusClass}>{status}</dd>
        {!evo && (
          <>
            <dt>Episode</dt>
            <dd>{world ? `${fmt(world.time)} / ${fmt(world.cfg.episode.seconds, 0)} s` : '—'}</dd>
          </>
        )}
        <dt>Progress</dt>
        <dd>
          {prog && cps ? `${fmt(prog.progress)} m  (lap ${laps + 1}: ${fmt(lapPct, 0)}%)` : '—'}
        </dd>
        <dt>Checkpoints</dt>
        <dd>
          {prog && cps
            ? `${prog.passed - laps * cps.count} / ${cps.count}  (next #${nextCheckpointIndex(prog, cps)})`
            : '—'}
        </dd>
        <dt>Laps</dt>
        <dd>{prog ? laps : '—'}</dd>
        <dt>Speed</dt>
        <dd>{s ? `${fmt(s.speed)} m/s  (${fmt(s.speed * 3.6, 0)} km/h)` : '—'}</dd>
        <dt>Heading</dt>
        <dd>{s ? `${fmt(headingDeg(s.heading), 0)}°` : '—'}</dd>
        <dt>Position</dt>
        <dd>{s ? `${fmt(s.x)}, ${fmt(s.y)} m` : '—'}</dd>
        <dt>Steering</dt>
        <dd>{c ? `${c.steering > 0 ? '+' : ''}${fmt(c.steering, 2)}` : '—'}</dd>
        <dt>Throttle</dt>
        <dd>{c ? `${c.throttle > 0 ? '+' : ''}${fmt(c.throttle, 2)}` : '—'}</dd>
        <dt>Tick</dt>
        <dd>{world ? `${world.tick}` : '—'}</dd>
        <dt>Render</dt>
        <dd>{hud ? `${fmt(hud.fps, 0)} fps · ${fmt(hud.frameMs, 2)} ms/frame` : '—'}</dd>
        <dt>Overlay</dt>
        <dd>
          rays {showSensors ? 'on' : 'off'} · debug {debug ? 'on' : 'off'}
        </dd>
      </dl>
      <h3 className="hud__sub">Sensor inputs (NN inputs, 0–1)</h3>
      <div className="inputs" aria-label="Sensor inputs">
        {INPUT_LABELS.map((label, i) => {
          const v = inputs?.[i] ?? 0;
          return (
            <div className="inputs__col" key={label}>
              <div className="inputs__bar" title={`${label}: ${v.toFixed(3)}`}>
                <div className="inputs__fill" style={{ height: `${Math.round(v * 100)}%` }} />
              </div>
              <span className="inputs__label">{label}</span>
              <span className="inputs__val">{v.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
      <div className="hud__help">
        <p>
          <kbd>M</kbd> switch Evolve / Drive · <kbd>R</kbd> restart · <kbd>space</kbd> pause ·{' '}
          <kbd>1</kbd>–<kbd>4</kbd> speed 1× / 4× / 16× / max · <kbd>S</kbd> sensor rays ·{' '}
          <kbd>D</kbd> debug overlay
        </p>
        <p>
          Drive: <kbd>↑</kbd> throttle · <kbd>↓</kbd> brake · <kbd>←</kbd> <kbd>→</kbd> steer
        </p>
        <p className="hud__conv">
          Each car sees 7 wall distances + its speed and outputs steering + throttle. Fitness =
          metres of track covered (checkpoints in order). Every generation the top 5 survive
          unchanged and the rest are mutated copies of tournament winners. Cars are ghosts — they
          never collide with each other. Yellow = current leader. Heading 0° = east, clockwise
          positive; positive steering turns right. Rays start at the car centre; collision uses the
          body corners.
        </p>
      </div>
    </aside>
  );
}
