import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { fitCamera, type Camera } from '../render/camera.ts';
import { hitTestCar, resolveSelection } from '../render/hitTest.ts';
import { renderWorld, type RenderOptions } from '../render/draw.ts';
import type { Evolution } from '../sim/engine/evolution.ts';
import type { World } from '../sim/engine/world.ts';
import type { CarControls } from '../sim/physics/car.ts';
import { smoothKeyboardControls } from './inputSmoothing.ts';
import type { Session, SessionMode } from './session.ts';
import { useUiStore } from './store.ts';
import { planTicks, runBudgeted } from './tickPlanner.ts';

/** Ignore frame gaps longer than this (tab was hidden); the backlog is dropped, not caught up. */
const MAX_FRAME_DT = 0.25;
/** Wall-clock budget per frame for 'max' speed. Leaves headroom for render + React on a 60 Hz display. */
export const MAX_SPEED_BUDGET_MS = 12;
/** How often the React HUD snapshot is refreshed. */
const HUD_INTERVAL_MS = 80;
/** Click tolerance for selecting a car, CSS px (cars are ~20 px long at the default zoom). */
export const CLICK_RADIUS_PX = 14;

export interface HudSnapshot {
  readonly mode: SessionMode;
  readonly world: World;
  /** The evolution run when in Evolve mode (a live, mutable object — read-only for display). */
  readonly evolution: Evolution | null;
  /** Index of the highlighted car (selected car if any, else leader/driver). */
  readonly focusIndex: number;
  /** True when focusIndex comes from a click selection. */
  readonly selected: boolean;
  /** Generation of the current world (0 in Drive mode). */
  readonly generation: number;
  /** Measured render frames per second (smoothed). */
  readonly fps: number;
  /** Smoothed milliseconds of sim + render work per frame. */
  readonly frameMs: number;
  /** Smoothed simulation ticks per real second (shows the effective speed). */
  readonly ticksPerSecond: number;
}

export interface SimLoopApi {
  readonly hud: HudSnapshot | null;
  readonly reset: () => void;
  /** Handle a click on the canvas at CSS-pixel coordinates: select a living car or deselect. */
  readonly clickAt: (x: number, y: number) => void;
}

/**
 * Drives a Session with a fixed-timestep accumulator on requestAnimationFrame.
 * React never re-renders per tick: the canvas is painted imperatively, and a
 * throttled snapshot feeds the HUD. Wall-clock time and rAF live HERE (ui/),
 * never in sim/.
 *
 * `createSession` is called once per mount (and again whenever it changes,
 * e.g. on a mode switch); the loop steps whatever it returns.
 */
export function useSimLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  createSession: () => Session,
  controlsRef: RefObject<CarControls>,
): SimLoopApi {
  const sessionRef = useRef<Session | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const session = createSession();
    sessionRef.current = session;

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastHud = 0;
    let fps = 0;
    let frameMs = 0;
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

    let tps = 0;
    const frame = (now: number) => {
      const workStart = performance.now();
      const frameDt = Math.min((now - last) / 1000, MAX_FRAME_DT);
      last = now;
      if (frameDt > 0) fps = fps * 0.9 + (1 / frameDt) * 0.1;

      // Speed/pause come from the UI store, read once per frame. Drive mode
      // always runs at 1×. Only the NUMBER of ticks per frame changes with
      // speed — never the tick itself — so results are speed-independent.
      const ui = useUiStore.getState();
      const dt = session.world().cfg.physics.dt;
      const speed = session.mode === 'drive' ? 1 : ui.speed;
      let ticks = 0;
      const doTick = () => {
        applied = smoothKeyboardControls(applied, controlsRef.current, dt);
        session.tick(applied);
      };
      if (ui.paused) {
        acc = 0;
      } else if (speed === 'max') {
        acc = 0;
        ticks = runBudgeted(doTick, () => performance.now(), MAX_SPEED_BUDGET_MS);
      } else {
        const plan = planTicks(speed, acc, frameDt, dt);
        acc = plan.acc;
        for (let i = 0; i < plan.ticks; i++) doTick();
        ticks = plan.ticks;
      }
      if (frameDt > 0) tps = tps * 0.9 + (ticks / frameDt) * 0.1;

      const world = session.world();
      const generation = session.generation();
      // Selection survives only while its car is alive and the generation is unchanged.
      const sel = resolveSelection(ui.selection, world, generation);
      if (sel !== ui.selection) useUiStore.getState().setSelection(sel);
      const focusIndex = sel ? sel.index : session.focusIndex();
      const cam = fitCamera(world.track.bounds, cssW, cssH);
      cameraRef.current = cam;
      const opts: RenderOptions = {
        debug: ui.debug,
        showSensors: ui.showSensors,
        focusIndex,
      };
      renderWorld(ctx, world, cam, cssW, cssH, opts);
      frameMs = frameMs * 0.9 + (performance.now() - workStart) * 0.1;

      if (now - lastHud >= HUD_INTERVAL_MS) {
        lastHud = now;
        setHud({
          mode: session.mode,
          world,
          evolution: session.evolution(),
          focusIndex,
          selected: sel !== null,
          generation,
          fps,
          frameMs,
          ticksPerSecond: tps,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sessionRef.current = null;
    };
  }, [canvasRef, controlsRef, createSession]);

  const reset = useCallback(() => {
    sessionRef.current?.reset();
    useUiStore.getState().setSelection(null);
  }, []);
  const clickAt = useCallback((x: number, y: number) => {
    const session = sessionRef.current;
    const cam = cameraRef.current;
    if (!session || !cam || session.mode !== 'evolve') return;
    const hit = hitTestCar(session.world(), cam, { x, y }, CLICK_RADIUS_PX);
    useUiStore
      .getState()
      .setSelection(hit === null ? null : { index: hit, generation: session.generation() });
  }, []);

  return { hud, reset, clickAt };
}
