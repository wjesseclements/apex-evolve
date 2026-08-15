# SLICES.md — Build Plan

Each slice ends with a working, deployable state and a demo checklist the
supervisor verifies before the next slice begins. Estimated PR counts are
guidance, not quotas.

---

## Slice 0 — Scaffold + drivable car (2-4 PRs)

Repo scaffold (Vite, TS strict, Vitest, ESLint, GitHub Actions CI, Vercel
deploy). Canvas render loop with fixed-timestep sim engine. One hand-authored
track (JSON centerline + width) rendered with derived edges. One car,
keyboard-drivable (arrow keys), with the arcade physics model and edge
collision (car stops/dies on contact). No NN, no GA.

Purpose: prove the physics feels right and the geometry is correct BEFORE any
learning code exists. If the car model is janky, evolution will learn janky
driving and it will be hard to tell why.

Demo checklist:
- [ ] Deployed URL loads; track renders with visually correct edges
- [ ] Car drives with keyboard; positive steering turns the expected direction
- [ ] Car cannot turn at standstill; collision kills the car
- [ ] Physics determinism test passes (same inputs ⇒ same trajectory)
- [ ] CI green

## Slice 1 — Sensors + progress metric (2-3 PRs)

Raycast sensors (7 rays, normalized distances) with a debug visualization
toggle drawing the rays on the driven car. Checkpoint generation along the
centerline; continuous progress metric; on-screen progress readout while
driving manually. Episode timer.

Demo checklist:
- [ ] Rays visibly terminate at walls; lengths update correctly through corners
- [ ] Raycast unit tests against hand-computed geometry pass
- [ ] Progress readout increases monotonically driving forward, never increases
      driving backward or in circles
- [ ] Progress metric unit tests pass

## Slice 2 — NN + GA core, population runs (3-5 PRs)

From-scratch feedforward NN (genome ⇄ Float32Array). GA module: population
init, tournament selection, elitism, uniform crossover (behind config flag),
Gaussian mutation — all through the seeded PRNG. Engine orchestrates
generations: run 100 cars simultaneously, score, select, repeat. Minimal UI:
generation counter, alive count, best fitness number. Watch at 1x only.

Demo checklist:
- [ ] 100 cars run and evolve; visible improvement across ~20 generations
      (later crashes, further progress)
- [ ] Reproducibility test passes: same seed ⇒ identical gen-10 best fitness
      across two fresh runs
- [ ] GA statistical tests pass (tournament prefers fitter genomes; mutation
      perturbation distribution sane)
- [ ] 60 fps with 100 cars at 1x

## Slice 3 — Evolution UX (3-5 PRs)

Speed multiplier (1x/4x/16x/max with budget-per-frame ticking). Pause/resume.
Stats panel (gen, alive, best/mean fitness, best lap time). Fitness-over-
generations line chart (best + mean). Best-car highlight + sensor-ray toggle.
Car inspector per SPEC.md: click-to-select any living car; live telemetry
panel (steering/throttle/brake bars, speed, fitness) driven by existing sim
state; sensor rays on the selected car. Restart with seed input. Live
mutation-rate slider and crossover toggle. Export/import best genome as JSON
file.

Demo checklist:
- [ ] "Max" speed runs ≥20 generations/minute; UI stays responsive
- [ ] Chart matches per-generation records; speed changes don't alter results
      (determinism holds across speed settings — test this explicitly)
- [ ] Clicking a car selects it; inspector bars visibly track the car's
      behavior (steering bar swings through corners, brake shows on entry);
      selection clears on crash/deselect
- [ ] Exported genome re-imports and reproduces the same driving behavior

## Slice 4 — Racing lines + generalization (2-4 PRs)

Add the grip-limit refinement to physics (lateral acceleration cap) so racing
lines matter, and add the lap-time fitness bonus so evolution optimizes speed
after completion, not just survival. Add a second, held-out track; UI to
switch tracks and load a trained genome onto the unseen track. Document
observed behavior (does the genome generalize or overfit?) in the README.

Demo checklist:
- [ ] With grip limit on, evolved cars visibly brake for corners and take
      wider entries (screenshot/GIF evidence)
- [ ] Lap times decrease over generations after first completion
- [ ] Train-on-A / test-on-B result documented, whatever the outcome

## Slice 5 — Portfolio polish (2-3 PRs)

README rewrite: what/why, GIFs of gen 1 vs gen 100, architecture diagram,
"how the GA works" section, honest findings (including crossover A/B result
and any exploits evolution found). Landing UX pass: sensible defaults, brief
in-app explainer so a cold visitor understands in 30 seconds. Performance
audit. Optional blog-post draft outline.

Demo checklist:
- [ ] Cold-visitor test: someone with no context understands the demo quickly
- [ ] README presents well on GitHub; demo link prominent
- [ ] Lighthouse/perf sanity pass

## Stretch (explicitly out of core scope)

- NEAT (topology evolution + speciation)
- Live neural-network activation view in the car inspector: draw the 8-10-2
  network for the selected car with connection color/thickness from weights
  and node brightness from live activations
- Real F1 circuit import: one-off Python script using FastF1 (reusing the
  f1-telemetry-replay pipeline) to export a real circuit centerline + width
  as track JSON; use as a held-out generalization track
- Track editor
- Ghost replay of best genome per generation overlaid
- Side-by-side comparison harness for the future PPO project
