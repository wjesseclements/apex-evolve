import { isEpisodeOver } from '../sim/engine/world.ts';
import { lapsOf, nextCheckpointIndex } from '../sim/track/progress.ts';
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

export function Hud({
  hud,
  debug,
  showSensors,
}: {
  hud: HudSnapshot | null;
  debug: boolean;
  showSensors: boolean;
}) {
  const world = hud?.world;
  const car = world?.cars[0];
  const s = car?.state;
  const c = car?.controls;
  const inputs = car?.sensors.inputs;
  const over = world ? isEpisodeOver(world) : false;
  const cps = world?.checkpoints;
  const prog = car?.progress;
  const laps = prog && cps ? lapsOf(prog, cps) : 0;
  const lapProgress = prog && cps ? prog.progress - laps * cps.totalLength : 0;
  const lapPct = cps ? (lapProgress / cps.totalLength) * 100 : 0;
  const status = !car ? '—' : !car.alive ? 'CRASHED' : over ? 'TIME UP' : 'ALIVE';
  const statusClass =
    status === 'ALIVE' ? 'hud__alive' : status === 'CRASHED' ? 'hud__dead' : 'hud__over';
  return (
    <aside className="hud" aria-label="Telemetry">
      <h2 className="hud__title">Telemetry</h2>
      <dl className="hud__grid">
        <dt>Status</dt>
        <dd className={statusClass}>{status}</dd>
        <dt>Episode</dt>
        <dd>{world ? `${fmt(world.time)} / ${fmt(world.cfg.episode.seconds, 0)} s` : '—'}</dd>
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
        <dd>{hud ? `${fmt(hud.fps, 0)} fps` : '—'}</dd>
        <dt>Debug</dt>
        <dd>{debug ? 'ON' : 'off'}</dd>
        <dt>Rays</dt>
        <dd>{showSensors ? 'shown' : 'hidden'}</dd>
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
          <kbd>↑</kbd> throttle · <kbd>↓</kbd> brake · <kbd>←</kbd> <kbd>→</kbd> steer
        </p>
        <p>
          <kbd>R</kbd> reset · <kbd>S</kbd> sensor rays · <kbd>D</kbd> debug overlay
        </p>
        <p className="hud__conv">
          Conventions: heading 0° = east, clockwise positive. Positive steering (→) turns right.
          Debug overlay: <span className="hud__left">left edge</span> /{' '}
          <span className="hud__right">right edge</span>, heading arrow, car&apos;s left side dot.
          Rays are cast from the car centre (L = car&apos;s left, R = right); collision uses the
          body corners, so the forward ray reads ~2 m when the nose touches a wall. Debug overlay
          also shows checkpoint ticks (next one highlighted). Progress = metres along the
          centerline, checkpoints crossed in order; the episode freezes at the timer.
        </p>
      </div>
    </aside>
  );
}
