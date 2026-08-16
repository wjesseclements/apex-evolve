# apex-evolve

Neuroevolution racing in the browser: a population of cars, each driven by a
tiny neural network, learns a 2D race track through a genetic algorithm written
from scratch — no ML libraries, no backpropagation.

**Status:** Slice 1 — keyboard-drivable car with the arcade physics model,
edge collision, the 7-ray sensors that will feed the neural network, and the
checkpoint-based progress metric that will be its fitness. No learning yet. See [SLICES.md](SLICES.md) for the build plan and
[SPEC.md](SPEC.md) for the design.

## Try it

Arrow keys drive the car: <kbd>↑</kbd> throttle, <kbd>↓</kbd> brake,
<kbd>←</kbd>/<kbd>→</kbd> steer. <kbd>R</kbd> resets after a crash,
<kbd>S</kbd> toggles the sensor rays, <kbd>D</kbd> toggles the debug overlay
(left edge red, right edge blue, heading arrow, car's left side dotted).
Touching a track edge kills the car for the rest of the run.

## Sensors

Seven rays from the car centre at −90°, −60°, −30°, 0°, +30°, +60°, +90° from
the heading (negative = the car's left), each reporting distance to the track
edge normalized by a 60 m range (1.0 = nothing within range), plus normalized
speed: the 8 inputs the network will see. Rays are cast exactly against the
rendered edges by walking the per-segment drivable quads (`src/sim/sensors/`).
Note that rays start at the centre while collision uses the body corners, so a
head-on forward ray reads ~2 m at the moment of impact.

## Progress metric & episodes

Checkpoints sit every ~5 m of centerline arc length (88 on the training track;
checkpoint 0 is the start line). A car's **progress** is metres of centerline:
the arc of the last checkpoint it crossed *in order, moving forward*, plus its
current offset within the next span (clamped to that span). Backing up can
lower the reading within a span but never below the last checkpoint and never
earns anything; driving in circles plateaus; crossing the start line with all
checkpoints passed counts a lap and progress carries on past the lap length.
This is the quantity the genetic algorithm will maximise. Every episode lasts
30 s of simulated time, after which the world freezes (`R` restarts). The
debug overlay (`D`) draws the checkpoints and highlights the next one.

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

## Determinism

Same seed ⇒ the same run, **bit-for-bit, on every JavaScript engine**. `sim/`
never calls `Math.sin/cos/exp/…` (engines are allowed to — and do — differ in
the last bits); it uses its own fdlibm-derived kernels in
`src/sim/math/dmath.ts` built from IEEE-754 basic arithmetic only. Exact golden
pins in the tests are checked on macOS/arm64 and Linux/x64 CI. See
[docs/CONVENTIONS.md](docs/CONVENTIONS.md#determinism-cross-engine-bit-identity).

## Layout

```
src/sim/     pure, headless simulation — no DOM, no timers, no Math.random, no Math.sin/cos/…
  config.ts    every physics constant, typed and documented with units
  math/        vec2 helpers + dmath.ts (deterministic sin/cos/atan2/exp/tanh/log)
  random/      seeded PRNG (mulberry32) — the only source of randomness
  physics/     arcade car model (stepCar), body corners
  track/       track JSON → mitered edges; localized nearest-segment + collision;
               checkpoints + progress metric
  sensors/     quad-walk raycast + the 8 NN inputs
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
