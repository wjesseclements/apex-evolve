import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { fitCamera } from '../render/camera.ts';
import { renderWorld, type RenderOptions } from '../render/draw.ts';
import { createWorld, resetWorld, stepWorld, type World } from '../sim/engine/world.ts';
import type { SimConfig } from '../sim/config.ts';
import type { CarControls } from '../sim/physics/car.ts';
import type { Track } from '../sim/track/track.ts';
import { smoothKeyboardControls } from './inputSmoothing.ts';

/** Never simulate more than this many ticks in one frame (spiral-of-death guard). */
export const MAX_TICKS_PER_FRAME = 5;
/** Ignore frame gaps longer than this (tab was hidden); the backlog is dropped, not caught up. */
const MAX_FRAME_DT = 0.25;
/** How often the React HUD snapshot is refreshed. */
const HUD_INTERVAL_MS = 80;

export interface HudSnapshot {
  readonly world: World;
  /** Measured render frames per second (smoothed). */
  readonly fps: number;
}

export interface SimLoopApi {
  readonly hud: HudSnapshot | null;
  readonly reset: () => void;
  readonly debug: boolean;
  readonly toggleDebug: () => void;
  readonly showSensors: boolean;
  readonly toggleSensors: () => void;
}

/**
 * Owns the world in a ref and drives it with a fixed-timestep accumulator on
 * requestAnimationFrame. React never re-renders per tick: the canvas is
 * painted imperatively, and a throttled snapshot feeds the HUD.
 *
 * Wall-clock time and rAF live HERE (ui/), never in sim/.
 */
export function useSimLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  track: Track,
  cfg: SimConfig,
  controlsRef: RefObject<CarControls>,
): SimLoopApi {
  const worldRef = useRef<World>(createWorld(track, cfg));
  const debugRef = useRef(false);
  const [debug, setDebug] = useState(false);
  const sensorsRef = useRef(true);
  const [showSensors, setShowSensors] = useState(true);
  const [hud, setHud] = useState<HudSnapshot | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHud = 0;
    let fps = 0;
    let cssW = 0;
    let cssH = 0;
    let applied: CarControls = { steering: 0, throttle: 0 };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      cssW = Math.max(1, Math.floor(parent.clientWidth));
      cssH = Math.max(1, Math.floor(parent.clientHeight));
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const frame = (now: number) => {
      const frameDt = Math.min((now - last) / 1000, MAX_FRAME_DT);
      last = now;
      if (frameDt > 0) fps = fps * 0.9 + (1 / frameDt) * 0.1;

      // Fixed-timestep accumulator: simulation advances in whole ticks of physics.dt
      // regardless of display refresh rate.
      acc += frameDt;
      let ticks = 0;
      let world = worldRef.current;
      const dt = world.cfg.physics.dt;
      while (acc >= dt && ticks < MAX_TICKS_PER_FRAME) {
        applied = smoothKeyboardControls(applied, controlsRef.current, dt);
        const controls = applied;
        world = stepWorld(world, () => controls);
        acc -= dt;
        ticks++;
      }
      if (ticks === MAX_TICKS_PER_FRAME) acc = 0; // drop backlog rather than spiral
      worldRef.current = world;

      const cam = fitCamera(world.track.bounds, cssW, cssH);
      const opts: RenderOptions = { debug: debugRef.current, showSensors: sensorsRef.current };
      renderWorld(ctx, world, cam, cssW, cssH, opts);

      if (now - lastHud >= HUD_INTERVAL_MS) {
        lastHud = now;
        setHud({ world, fps });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvasRef, controlsRef]);

  const reset = useCallback(() => {
    worldRef.current = resetWorld(worldRef.current);
  }, []);
  const toggleDebug = useCallback(() => {
    debugRef.current = !debugRef.current;
    setDebug(debugRef.current);
  }, []);
  const toggleSensors = useCallback(() => {
    sensorsRef.current = !sensorsRef.current;
    setShowSensors(sensorsRef.current);
  }, []);

  return { hud, reset, debug, toggleDebug, showSensors, toggleSensors };
}
