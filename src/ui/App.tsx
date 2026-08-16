import { useCallback, useMemo, useRef } from 'react';
import { DEFAULT_GA, DEFAULT_NN, DEFAULT_SIM } from '../sim/config.ts';
import { NEUTRAL_CONTROLS, type CarControls } from '../sim/physics/car.ts';
import { TRAINING_TRACK } from '../sim/track/tracks.ts';
import { Hud } from './Hud.tsx';
import { createDriveSession, createEvolveSession } from './session.ts';
import { useUiStore } from './store.ts';
import { SPEEDS, type Speed } from './tickPlanner.ts';
import { useKeyboardControls } from './useKeyboardControls.ts';
import { useSimLoop } from './useSimLoop.ts';

/** SPEC "default seed": the run everyone sees first, and the one the tests pin. */
export const DEFAULT_SEED = 42;

const SPEED_KEYS: Record<string, Speed> = { '1': 1, '2': 4, '3': 16, '4': 'max' };

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<CarControls>(NEUTRAL_CONTROLS);
  const mode = useUiStore((s) => s.mode);
  const speed = useUiStore((s) => s.speed);
  const paused = useUiStore((s) => s.paused);
  const showSensors = useUiStore((s) => s.showSensors);
  const debug = useUiStore((s) => s.debug);
  const { setMode, toggleMode, setSpeed, togglePaused, toggleSensors, toggleDebug } =
    useUiStore.getState();

  const createSession = useMemo(
    () =>
      mode === 'evolve'
        ? () =>
            createEvolveSession(TRAINING_TRACK, {
              sim: DEFAULT_SIM,
              ga: DEFAULT_GA,
              nn: DEFAULT_NN,
              seed: DEFAULT_SEED,
            })
        : () => createDriveSession(TRAINING_TRACK, DEFAULT_SIM),
    [mode],
  );
  const sim = useSimLoop(canvasRef, createSession, controlsRef);
  const { reset } = sim;
  const onKey = useCallback(
    (key: string) => {
      if (key === 'r') reset();
      else if (key === 'd') toggleDebug();
      else if (key === 's') toggleSensors();
      else if (key === 'm') toggleMode();
      else if (key === ' ') togglePaused();
      else if (key in SPEED_KEYS) setSpeed(SPEED_KEYS[key] ?? 1);
    },
    [reset, toggleDebug, toggleSensors, toggleMode, togglePaused, setSpeed],
  );
  useKeyboardControls(controlsRef, onKey);

  return (
    <main className="app">
      <header className="app__header">
        <div>
          <h1>apex-evolve</h1>
          <p>
            {mode === 'evolve'
              ? '100 cars, each steered by a tiny neural network, learn the track by evolution — no gradients, just selection and mutation.'
              : 'Drive mode — race the algorithm yourself with the arrow keys.'}
          </p>
        </div>
        <div className="toolbar">
          <div className="seg" role="tablist" aria-label="Mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'evolve'}
              className={mode === 'evolve' ? 'seg__btn seg__btn--on' : 'seg__btn'}
              onClick={() => setMode('evolve')}
            >
              Evolve
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'drive'}
              className={mode === 'drive' ? 'seg__btn seg__btn--on' : 'seg__btn'}
              onClick={() => setMode('drive')}
            >
              Drive
            </button>
          </div>
          <div className="seg" role="group" aria-label="Speed">
            {SPEEDS.map((sp, i) => (
              <button
                key={String(sp)}
                type="button"
                className={speed === sp ? 'seg__btn seg__btn--on' : 'seg__btn'}
                onClick={() => setSpeed(sp)}
                disabled={mode === 'drive'}
                title={`Speed ${sp === 'max' ? 'max' : `${sp}×`} (key ${i + 1})`}
                aria-pressed={speed === sp}
              >
                {sp === 'max' ? 'max' : `${sp}×`}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={paused ? 'seg__btn seg__btn--on seg__btn--solo' : 'seg__btn seg__btn--solo'}
            onClick={togglePaused}
            aria-pressed={paused}
            title="Pause / resume (space)"
          >
            {paused ? '▶ Resume' : '❚❚ Pause'}
          </button>
        </div>
      </header>
      <div className="app__body">
        <div className="canvas-wrap">
          <canvas ref={canvasRef} className="sim-canvas" aria-label="Simulation" />
        </div>
        <div className="side">
          <Hud
            hud={sim.hud}
            debug={debug}
            showSensors={showSensors}
            paused={paused}
            speed={speed}
          />
          <div className="controls">
            <button type="button" onClick={reset}>
              {mode === 'evolve' ? 'Restart evolution (R)' : 'Reset car (R)'}
            </button>
            <button type="button" onClick={toggleSensors} aria-pressed={showSensors}>
              Sensor rays (S): {showSensors ? 'on' : 'off'}
            </button>
            <button type="button" onClick={toggleDebug} aria-pressed={debug}>
              Debug overlay (D): {debug ? 'on' : 'off'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
