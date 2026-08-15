import { useCallback, useRef } from 'react';
import { DEFAULT_SIM } from '../sim/config.ts';
import { NEUTRAL_CONTROLS, type CarControls } from '../sim/physics/car.ts';
import { TRAINING_TRACK } from '../sim/track/tracks.ts';
import { Hud } from './Hud.tsx';
import { useKeyboardControls } from './useKeyboardControls.ts';
import { useSimLoop } from './useSimLoop.ts';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<CarControls>(NEUTRAL_CONTROLS);
  const sim = useSimLoop(canvasRef, TRAINING_TRACK, DEFAULT_SIM, controlsRef);
  const { reset, toggleDebug, toggleSensors } = sim;
  const onKey = useCallback(
    (key: string) => {
      if (key === 'r') reset();
      if (key === 'd') toggleDebug();
      if (key === 's') toggleSensors();
    },
    [reset, toggleDebug, toggleSensors],
  );
  useKeyboardControls(controlsRef, onKey);

  return (
    <main className="app">
      <header className="app__header">
        <h1>apex-evolve</h1>
        <p>
          Slice 1 — drive the car with the arrow keys; watch its 7 sensor rays and lap progress.
          Neuroevolution arrives in later slices.
        </p>
      </header>
      <div className="app__body">
        <div className="canvas-wrap">
          <canvas ref={canvasRef} className="sim-canvas" aria-label="Simulation" />
        </div>
        <div className="side">
          <Hud hud={sim.hud} debug={sim.debug} showSensors={sim.showSensors} />
          <div className="controls">
            <button type="button" onClick={reset}>
              Reset (R)
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
