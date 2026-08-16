/**
 * A Session is what the frame loop steps: either the keyboard-driven single
 * car (Drive mode — "race the algorithm" yourself) or the evolving population
 * (Evolve mode). Both expose the current World for rendering. This is plain
 * TypeScript glue over sim/; no React, no DOM.
 */

import type { GaConfig, NetworkTopology, SimConfig } from '../sim/config.ts';
import {
  createEvolution,
  leaderIndex,
  stepEvolution,
  type Evolution,
} from '../sim/engine/evolution.ts';
import { createWorld, resetWorld, stepWorld, type World } from '../sim/engine/world.ts';
import type { CarControls } from '../sim/physics/car.ts';
import type { Track } from '../sim/track/track.ts';

export type SessionMode = 'evolve' | 'drive';

export interface Session {
  readonly mode: SessionMode;
  world(): World;
  /** Advance one fixed tick. `controls` are used by Drive mode only. */
  tick(controls: CarControls): void;
  reset(): void;
  /** The evolution run (Evolve mode) or null. */
  evolution(): Evolution | null;
  /** Index of the car to highlight (the live leader in Evolve mode, the driver's car in Drive mode). */
  focusIndex(): number;
}

export function createDriveSession(track: Track, cfg: SimConfig): Session {
  // No stall rule for a human driver: sitting still is allowed.
  const driveCfg: SimConfig = { ...cfg, episode: { ...cfg.episode, stallSeconds: null } };
  let world = createWorld(track, driveCfg);
  return {
    mode: 'drive',
    world: () => world,
    tick: (controls) => {
      world = stepWorld(world, () => controls);
    },
    reset: () => {
      world = resetWorld(world);
    },
    evolution: () => null,
    focusIndex: () => 0,
  };
}

export interface EvolveSessionConfig {
  readonly sim: SimConfig;
  readonly ga: GaConfig;
  readonly nn: NetworkTopology;
  readonly seed: number | string;
}

export function createEvolveSession(track: Track, cfg: EvolveSessionConfig): Session {
  let evo = createEvolution(track, cfg);
  return {
    mode: 'evolve',
    world: () => evo.world,
    tick: () => {
      stepEvolution(evo);
    },
    reset: () => {
      evo = createEvolution(track, cfg);
    },
    evolution: () => evo,
    focusIndex: () => leaderIndex(evo.world),
  };
}
