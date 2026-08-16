import { useCallback, useMemo, useRef, useState } from 'react';
import { DEFAULT_GA, DEFAULT_NN, DEFAULT_SIM } from '../sim/config.ts';
import { NEUTRAL_CONTROLS, type CarControls } from '../sim/physics/car.ts';
import { TRAINING_TRACK } from '../sim/track/tracks.ts';
import { Hud } from './Hud.tsx';
import { createDriveSession, createEvolveSession, type SessionMode } from './session.ts';
import { useKeyboardControls } from './useKeyboardControls.ts';
import { useSimLoop } from './useSimLoop.ts';

/** SPEC "default seed": the run everyone sees first, and the one the tests pin. */
export const DEFAULT_SEED = 42;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<CarControls>(NEUTRAL_CONTROLS);
  const [mode, setMode] = useState<SessionMode>('evolve');
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
  const { reset, toggleDebug, toggleSensors } = sim;
  const onKey = useCallback(
    (key: string) => {
      if (key === 'r') reset();
      if (key === 'd') toggleDebug();
      if (key === 's') toggleSensors();
      if (key === 'm') setMode((m) => (m === 'evolve' ? 'drive' : 'evolve'));
    },
    [reset, toggleDebug, toggleSensors],
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
        <div className="mode" role="tablist" aria-label="Mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'evolve'}
            className={mode === 'evolve' ? 'mode__btn mode__btn--on' : 'mode__btn'}
            onClick={() => setMode('evolve')}
          >
            Evolve
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'drive'}
            className={mode === 'drive' ? 'mode__btn mode__btn--on' : 'mode__btn'}
            onClick={() => setMode('drive')}
          >
            Drive
          </button>
        </div>
      </header>
      <div className="app__body">
        <div className="canvas-wrap">
          <canvas ref={canvasRef} className="sim-canvas" aria-label="Simulation" />
        </div>
        <div className="side">
          <Hud hud={sim.hud} debug={sim.debug} showSensors={sim.showSensors} />
          <div className="controls">
            <button type="button" onClick={reset}>
              {mode === 'evolve' ? 'Restart evolution (R)' : 'Reset car (R)'}
            </button>
            <button type="button" onClick={toggleSensors} aria-pressed={sim.showSensors}>
              Sensor rays (S): {sim.showSensors ? 'on' : 'off'}
            </button>
            <button type="button" onClick={toggleDebug} aria-pressed={sim.debug}>
              Debug overlay (D): {sim.debug ? 'on' : 'off'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
