# Project Spec: Racing Line Evolution ("apex-evolve")

## Vision

A browser-based simulation where a population of cars, each controlled by a small
neural network, learns to drive a 2D race track through neuroevolution (a genetic
algorithm). No ML libraries, no backpropagation — the GA is implemented from
scratch so every part of the system is understandable and inspectable.

The end state: open a URL, watch 100 cars evolve from crashing at the first corner
to carving a proper racing line, with live stats and a fitness-over-generations
chart. This is a portfolio project — the deployed demo, the README, and the code
quality all matter.

A follow-up project will solve the same task with PPO (Python / Stable-Baselines3),
so this codebase should keep the simulation core cleanly separated from the
learning algorithm to make conceptual comparison easy in the writeup.

## Goals

1. A deterministic 2D car simulation (fixed timestep, seeded RNG) with raycast
   sensors and track-edge collision.
2. A from-scratch fixed-topology neural network (forward pass only) and genetic
   algorithm (elitism, tournament selection, optional crossover, Gaussian mutation).
3. A Canvas visualization rendering the full population per generation, with a
   stats panel, generation chart, and simulation speed control.
4. Reproducibility: the same seed always produces the same evolution run.
5. A deployable static site (Vercel) with a README suitable for portfolio review.

## Non-Goals

- NEAT / topology evolution (stretch goal only, not core scope)
- 3D rendering, realistic tire/aero physics
- Backend/server of any kind — everything runs client-side
- Mobile-optimized UI (desktop-first is fine; must not be broken on mobile)

## Tech Stack

- Vite + TypeScript (strict mode), React for UI chrome only
- Canvas 2D for simulation rendering (the sim loop must NOT be React-driven;
  React renders controls/stats, Canvas renders the world)
- Zustand for UI state (speed multiplier, pause, selected car)
- Vitest for unit tests
- Zero runtime ML/physics dependencies — NN, GA, and physics are written from scratch
- GitHub Actions CI (typecheck, lint, test) from Slice 0
- Deployed on Vercel

## Architecture Overview

Three cleanly separated layers. The dependency direction is strictly downward:

```
ui/          React components: controls, stats panel, charts
render/      Canvas drawing: track, cars, sensors, overlays
sim/         Pure TypeScript, zero DOM dependencies:
  physics/   car model, collision, raycasts
  track/     track geometry, checkpoints, progress measurement
  nn/        feedforward network (forward pass only)
  ga/        genome, population, selection, crossover, mutation
  engine/    simulation orchestrator: ticks, episodes, generations
```

Everything in `sim/` must be pure and headless — it must run (and be testable)
without a browser. This is non-negotiable: it is what makes fast-forward mode,
unit testing, and the future PPO comparison possible.

## Simulation Design

### Car physics (arcade model, not realistic)

- State: position (x, y), heading θ, speed v
- Controls: steering ∈ [-1, 1], throttle ∈ [-1, 1] (negative = brake)
- Update per tick (fixed dt = 1/60 s):
  - v += throttle * ACCEL * dt, clamped to [0, V_MAX]
  - v *= (1 - DRAG * dt)
  - θ += steering * STEER_RATE * (v / V_MAX) * dt  (no turning at standstill)
  - position += (cos θ, sin θ) * v * dt
- Optional refinement (later slice): grip limit — lateral acceleration cap that
  induces understeer at speed, which is what makes racing lines matter.
- Collision with track edge = car is dead for the rest of the episode.

### Track

- Defined as a centerline polyline + uniform width; edges derived by offsetting.
- Checkpoints generated at fixed arc-length intervals along the centerline.
- Progress metric: index of furthest checkpoint passed, plus fractional
  projection onto the next segment (continuous, monotonic along track).
- At least 2 tracks by Slice 4 (one training, one held-out for generalization).
- Track data as plain JSON (hand-authored is fine; an editor is out of scope).

### Sensors (NN inputs)

- 7 raycasts from car center at angles [-90°, -60°, -30°, 0°, +30°, +60°, +90°]
  relative to heading; each returns distance-to-wall normalized by max range.
- Plus normalized speed v / V_MAX.
- Total: 8 inputs. All inputs normalized to [0, 1].

### Neural network

- Fixed topology: 8 inputs → 10 hidden (tanh) → 2 outputs (tanh)
- Outputs map directly to steering and throttle in [-1, 1]
- Genome = flat Float32Array of all weights + biases (~112 params)
- Forward pass only. No training code in the NN module — the GA is the trainer.

### Genetic algorithm

- Population: 100 (configurable)
- Episode: all cars run simultaneously in the same sim until crashed or
  episode timeout (configurable, ~30 s of sim time)
- Fitness: progress along centerline, with a time-efficiency bonus once a car
  completes a full lap (e.g., fitness = progress + BONUS / lapTime for finishers)
- Selection:
  - Elitism: top 5 genomes copied unchanged
  - Tournament selection (k=4) for parents
- Crossover: uniform crossover per weight, behind a config flag
  (crossoverEnabled) so mutation-only evolution can be A/B tested
- Mutation: per-weight probability 0.1, Gaussian noise σ = 0.2 (both configurable)
- All stochastic operations draw from a single seeded PRNG (e.g., mulberry32).
  Same seed ⇒ identical run, always. This is a hard requirement with tests.

### Simulation engine

- Fixed-timestep tick loop, decoupled from requestAnimationFrame
- Speed multiplier: 1x, 4x, 16x, and "max" (run ticks in a budget-per-frame
  loop, render only occasionally) — evolution must be watchable OR fast
- Per-generation record: best/mean/median fitness, crash rate, lap completions
- Export/import best genome as JSON (download/upload; no localStorage dependency)

## UI Requirements

- Canvas: track, all cars (dim), current best car highlighted, optional sensor
  ray visualization toggle
- Car inspector: click any living car on the canvas to select it (hit-test on
  car positions). Inspector panel shows that car's live telemetry, read
  directly from existing sim state (no new simulation code): steering as a
  center-zero horizontal bar, throttle and brake as vertical bars, speed
  readout, current fitness/progress. Sensor rays render on the selected car.
  Selection persists until the car crashes or is deselected; clicking empty
  track deselects.
- Stats panel: generation number, alive count, best/mean fitness, best lap time
- Chart: best and mean fitness per generation (simple Canvas or SVG line chart;
  no charting library required)
- Controls: pause/resume, speed multiplier, restart with seed input, mutation
  rate slider (live-adjustable), crossover toggle, export/import best genome

## Quality Bar

- TypeScript strict, no `any` in sim/ code
- Unit tests for: physics step determinism, raycast correctness against known
  geometry, progress metric monotonicity, GA selection/mutation statistics,
  seeded-run reproducibility (two runs, same seed, identical gen-10 fitness)
- CI green required to merge; every slice ends deployable
- README updated at the end of every slice (GIFs added in the polish slice)

## Success Criteria

1. On the training track, at least one car completes a full lap within 100
   generations on the default seed.
2. Two runs with the same seed produce bit-identical fitness histories.
3. The demo runs at 60 fps at 1x speed with 100 cars on a mid-range laptop.
4. A visitor with no ML background can open the URL and understand what is
   happening within 30 seconds.
