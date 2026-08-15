# apex-evolve

Neuroevolution racing in the browser: a population of cars, each driven by a
tiny neural network, learns a 2D race track through a genetic algorithm written
from scratch — no ML libraries, no backpropagation.

**Status:** Slice 0 — scaffold + keyboard-drivable car with the arcade physics
model and edge collision. No learning yet. See [SLICES.md](SLICES.md) for the
build plan and [SPEC.md](SPEC.md) for the design.

## Try it

Arrow keys drive the car: <kbd>↑</kbd> throttle, <kbd>↓</kbd> brake,
<kbd>←</kbd>/<kbd>→</kbd> steer. <kbd>R</kbd> resets after a crash,
<kbd>D</kbd> toggles the debug overlay (left edge red, right edge blue, heading
arrow, car's left side dotted). Touching a track edge kills the car for the rest
of the run.

Keyboard steering is bang-bang, so the UI ramps the applied steering toward
full lock over ~0.4 s and returns it to centre faster (`src/ui/inputSmoothing.ts`).
That lives in `ui/`, not the sim: the neural-network drivers in later slices
emit continuous steering.

## Development

```bash
npm install
npm run dev        # Vite dev server
npm run check      # typecheck + lint + format + purity + tests + build (what CI runs)
```

## Layout

```
src/sim/     pure, headless simulation — no DOM, no timers, no Math.random
  config.ts    every physics constant, typed and documented with units
  physics/     arcade car model (stepCar), body corners
  track/       track JSON → mitered edges; localized nearest-segment + collision
  engine/      World: fixed-timestep stepWorld over N cars, crash = frozen
src/render/  Canvas 2D drawing; depends on sim/ only
src/ui/      React chrome + the rAF/accumulator loop (the only place wall-clock time exists)
scripts/     gen-track.ts (authoring helper that emits track JSON), CI purity grep
docs/        CONVENTIONS.md — locked coordinate conventions
```

## Physics (Slice 0)

Per fixed tick (`dt = 1/60 s`), in this order:

1. `v += throttle · ACCEL · dt`, clamped to `[0, V_MAX]` (no reverse; brake decel = accel)
2. `v *= (1 − DRAG · dt)`
3. `θ += steering · STEER_RATE · (v / V_MAX) · dt` — no turning at standstill
4. `position += (cos θ, sin θ) · v · dt`

Constants (`src/sim/config.ts`): `V_MAX = 30 m/s`, `ACCEL = 12 m/s²`,
`DRAG = 0.3 /s`, `STEER_RATE = 2.5 rad/s`, car `4.0 × 1.8 m`. Minimum turn
radius is `V_MAX / STEER_RATE = 12 m`, independent of speed.

Coordinates: meters, **+y down** (screen-native), heading 0 = east, positive
angles / positive steering = clockwise on screen = right turn. Full details in
[docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Process

Built slice-by-slice under the working agreement in [CLAUDE.md](CLAUDE.md);
kickoff instructions in [KICKOFF.md](KICKOFF.md). Every PR is CI-gated
(typecheck, lint incl. `sim/` purity rules, tests, build) and squash-merged.
