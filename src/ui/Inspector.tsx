import type { Car } from '../sim/engine/world.ts';

/**
 * Car inspector (SPEC): live telemetry read straight from existing sim state.
 * Steering as a centre-zero horizontal bar (left = negative), throttle and
 * brake as vertical bars (throttle > 0 fills the throttle bar; throttle < 0
 * fills the brake bar), plus speed and fitness/progress.
 */
export function Inspector({
  car,
  vMax,
  title,
  fitness,
}: {
  car: Car;
  vMax: number;
  title: string;
  /** Fitness = progress + lap bonus (metre-equivalent). */
  fitness: number;
}) {
  const st = car.controls.steering;
  const th = car.controls.throttle;
  const throttle = Math.max(0, th);
  const brake = Math.max(0, -th);
  const speedFrac = Math.min(1, car.state.speed / vMax);
  return (
    <section className="inspector" aria-label={title}>
      <h2 className="hud__title">{title}</h2>
      <div className="inspector__row">
        <span className="inspector__label">Steering</span>
        <div
          className="steer"
          role="meter"
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={st}
          title={`steering ${st.toFixed(2)}`}
        >
          <div className="steer__centre" />
          <div
            className={st >= 0 ? 'steer__fill steer__fill--right' : 'steer__fill steer__fill--left'}
            style={
              st >= 0
                ? { left: '50%', width: `${(st * 50).toFixed(1)}%` }
                : { right: '50%', width: `${(-st * 50).toFixed(1)}%` }
            }
          />
        </div>
        <span className="inspector__val">{`${st > 0 ? '+' : ''}${st.toFixed(2)}`}</span>
      </div>
      <div className="inspector__bars">
        <VBar label="Throttle" value={throttle} className="vbar__fill--throttle" />
        <VBar label="Brake" value={brake} className="vbar__fill--brake" />
        <VBar
          label="Speed"
          value={speedFrac}
          className="vbar__fill--speed"
          text={`${car.state.speed.toFixed(1)} m/s`}
        />
        <div className="inspector__stats">
          <div>
            <span className="inspector__label">Fitness</span>
            <strong>{fitness.toFixed(1)}</strong>
            <span className="inspector__label">progress {car.progress.progress.toFixed(1)} m</span>
          </div>
          <div>
            <span className="inspector__label">Status</span>
            <strong className={car.alive ? 'hud__alive' : 'hud__dead'}>
              {car.alive ? 'ALIVE' : car.deathCause === 'stall' ? 'STALLED' : 'CRASHED'}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function VBar({
  label,
  value,
  className,
  text,
}: {
  label: string;
  value: number;
  className: string;
  text?: string;
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="vbar" title={`${label} ${v.toFixed(2)}`}>
      <div
        className="vbar__track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={v}
      >
        <div className={`vbar__fill ${className}`} style={{ height: `${(v * 100).toFixed(1)}%` }} />
      </div>
      <span className="inspector__label">{label}</span>
      <span className="inspector__val">{text ?? v.toFixed(2)}</span>
    </div>
  );
}
