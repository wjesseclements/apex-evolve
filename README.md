# apex-evolve

Neuroevolution racing in the browser: a population of cars, each driven by a
tiny neural network, learns a 2D race track through a genetic algorithm written
from scratch — no ML libraries, no backpropagation.

**Status:** Slice 1 — keyboard-drivable car with the arcade physics model,
edge collision, the 7-ray sensors that will feed the neural network, and the
checkpoint-based progress metric that will be its fitness. No learning yet. See [SLICES.md](SLICES.md) for the build plan and
[SPEC.md](SPEC.md) for the design.

## Try it

**Evolve** (default): watch the population learn. The yellow car is the current
leader (or the car you clicked); dim red cars are dead. Speed <kbd>1</kbd>–<kbd>4</kbd>
(1× / 4× / 16× / max), <kbd>space</kbd> pauses, <kbd>R</kbd> restarts the run.
Click any living car to inspect it (steering / throttle / brake bars, speed,
fitness; <kbd>Esc</kbd> or click empty track to deselect). The chart shows best
and mean fitness per generation. Type a seed and press Enter to restart with it —
the URL updates to `?seed=…`, and because the whole simulation is
engine-independent, that link replays the exact same evolution for anyone.
The mutation-rate slider and crossover toggle apply live at the next
generation; changing them mid-run (or importing a genome) marks the run
**modified**, meaning the seed alone no longer reproduces it — the badge says
so, and so does the export file. **Export best genome** downloads a JSON
document with the 112 weights plus honest metadata (seed, GA config,
generation, fitness, `modified`); **Import genome…** drops a genome into car #0
of a restarted episode and selects it, so you can watch a saved champion drive
— identically, every time.

**Tracks:** A (training, 440 m, clockwise) and B (held-out, 509 m,
counter-clockwise, one tight corner). Pick one in the Run panel or with
`?track=heldout`; **"Test best on B"** carries the current champion onto the
other track as car #0 so you can watch whether it copes.

**Drive** (<kbd>M</kbd> or the toggle): race the algorithm yourself —
arrow keys drive the car (and yes, you have to brake now): <kbd>↑</kbd> throttle, <kbd>↓</kbd> brake,
<kbd>←</kbd>/<kbd>→</kbd> steer. <kbd>R</kbd> resets after a crash,
<kbd>S</kbd> toggles the sensor rays, <kbd>D</kbd> toggles the debug overlay
(left edge red, right edge blue, heading arrow, car's left side dotted).
Touching a track edge kills the car for the rest of the run.

## How the learning works (Slice 2 baseline)

- **Network:** 8 inputs (7 ray distances + speed) → 10 tanh → 2 tanh
  (steering, throttle). Genome = 112 float32 weights/biases in one flat array.
- **Fitness:** metres of centerline covered (checkpoints in order) plus, once
  a car has completed a lap, `2000 / bestLapSeconds` (a 20 s lap adds 100
  metre-equivalents). Both numbers are shown; the chart plots fitness.
- **Generation:** all 100 cars run simultaneously as ghosts (no inter-car
  collision) until the 30 s timer, or until every car has died — by touching
  a wall or by the stall rule (below 0.5 m/s for 3 s of sim time).
- **Selection:** top 5 elites copied unchanged; 95 offspring from tournament
  selection (k = 4), optional uniform crossover (off by default; the Slice 3
  toggle is the A/B experiment), then per-gene mutation with probability 0.1
  and Gaussian σ = 0.2.
- **Randomness:** one seeded PRNG drives everything, and the math is engine-
  independent, so seed 42 gives the same generation-by-generation history in
  every browser and in Node — `node scripts/evolve-headless.ts 30 42` prints it.

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
  nn/          8→10→2 tanh network, Float32Array genome, allocation-free forward
  ga/          tournament / elitism / uniform crossover / Gaussian mutation
  engine/      World (fixed-timestep stepWorld over N ghost cars, stall + wall deaths)
               and Evolution (episodes → scoring → next generation, history)
src/render/  Canvas 2D drawing; depends on sim/ only
src/ui/      React chrome + the rAF/accumulator loop (the only place wall-clock time exists);
             Evolve / Drive sessions, zustand UI store, tick planner (speed/pause), inspector,
             run controls (seed, knobs, genome export/import), fitness chart
scripts/     gen-track.ts (track authoring), evolve-headless.ts (learning-curve table),
             inspect-champion.ts (brake/coast/speed dissection), generalize.ts (A→B / B→A protocol),
             CI purity grep
docs/        CONVENTIONS.md (locked conventions), FINDINGS.md (grip, lap bonus, crossover, generalization)
docs/        CONVENTIONS.md — locked coordinate conventions
```

## Physics (Slice 0)

Per fixed tick (`dt = 1/60 s`), in this order:

1. `v += throttle · ACCEL · dt`, clamped to `[0, V_MAX]` (no reverse; brake decel = accel)
2. `v *= (1 − DRAG · dt)`
3. `θ += steering · STEER_RATE · (v / V_MAX) · dt` — no turning at standstill
4. `position += (cos θ, sin θ) · v · dt`

5. **Grip limit** (Slice 4): the yaw rate is clamped so lateral acceleration
   `v·ω ≤ A = 20 m/s²` — turn radius at speed can't drop below `v²/A`
   (45 m at 30 m/s), i.e. the car understeers unless it slows down. Corner
   speed for radius R is `√(A·R)`: 19 m/s at R = 18.

Constants (`src/sim/config.ts`): `V_MAX = 30 m/s`, `ACCEL = 12 m/s²`,
`DRAG = 0.3 /s`, `STEER_RATE = 2.5 rad/s`, `A = 20 m/s²`, car `4.0 × 1.8 m`.
Below ≈ 15.5 m/s the grip limit is inactive and the minimum turn radius is
`V_MAX / STEER_RATE = 12 m`.

Coordinates: meters, **+y down** (screen-native), heading 0 = east, positive
angles / positive steering = clockwise on screen = right turn. Full details in
[docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Process

Built slice-by-slice under the working agreement in [CLAUDE.md](CLAUDE.md);
kickoff instructions in [KICKOFF.md](KICKOFF.md). Every PR is CI-gated
(typecheck, lint incl. `sim/` purity rules, tests, build) and squash-merged.
