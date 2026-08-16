# Coordinate & unit conventions (locked)

These were approved at the Slice 0 plan gate and are permanent. Every geometry
function's JSDoc restates the parts it relies on.

## Units

- Distances in **meters**, time in **seconds**, angles in **radians**.
- The world lives in meters; the renderer chooses pixels-per-meter.

## Axes (screen-native)

- `+x` = right (east), **`+y` = down (south)** on screen.
- Rendering is therefore a pure scale + translate — no axis flip — so what the
  unit tests assert about coordinates is literally what appears on screen.

## Heading & steering

- Heading `θ = 0` points along `+x` (east).
- `θ` increases **clockwise on screen** (from `+x` toward `+y`).
- Heading is kept unwrapped (no modulo); consumers that need a bounded angle
  normalize locally.
- **Positive steering (+1) = turn right = clockwise on screen.** Negative = left.
- Direction of travel for heading `θ` is `(cos θ, sin θ)`.

## Left / right of travel

For a unit direction `d = (dx, dy)`:

- **left normal** = `(dy, −dx)`  (facing east → screen-up `(0,−1)`)
- **right normal** = `(−dy, dx)` (facing east → screen-down `(0, 1)`)

Track **left edge** = centerline + `(width/2) · leftNormal`; right edge likewise.
Track direction of travel = centerline point order.

## Sensors (Slice 1+)

Ray angle offsets are relative to heading; **negative = car's left, positive =
car's right** — the same sign convention as steering.

## Physics tick order (SPEC)

Per fixed `dt = 1/60 s`, in this exact order:

1. `v += throttle · ACCEL · dt`, clamp to `[0, V_MAX]`
2. `v *= (1 − DRAG · dt)`
3. `θ += steering · STEER_RATE · (v / V_MAX) · dt`
4. `position += (cos θ, sin θ) · v · dt`

Note: minimum turn radius `v/ω = V_MAX / STEER_RATE` is speed-independent in
this model. Track corners must be authored with centerline radius comfortably
above it.

## Determinism (cross-engine bit-identity)

`sim/` never calls engine-dependent `Math` functions. ECMA-262 only requires
"implementation-approximated" results for `Math.sin/cos/tan/atan2/exp/tanh/
pow/hypot/log…`, and engines really do differ in the last bits (observed:
macOS/arm64 Node 26 vs Linux/x64 Node 22 on a 1200-tick physics trajectory).
Instead, `src/sim/math/dmath.ts` provides `sin, cos, atan, atan2, exp, tanh,
log, hypot2` built from fdlibm's minimax kernels using only IEEE-754 basic
arithmetic, `Math.sqrt` (hardware, correctly rounded), `floor/trunc/abs`. Those
operations are exactly specified, so every sim result is bit-identical on every
engine — a seed shared between two people replays the same run.

Enforced by ESLint (`no-restricted-properties` on `src/sim/**`, non-test files)
and `scripts/check-sim-purity.sh` in CI, and proven by exact (`Object.is`)
golden pins in `dmath.test.ts`, `car.test.ts`, and `world.test.ts` that must
match on the developer machine and CI.

## Randomness

All randomness in `sim/` flows through an injected `Prng` from
`src/sim/random/prng.ts` (mulberry32; integer-only core, so bit-identical
everywhere). Its state is a single uint32 — `state()`/`restore()` are exact and
there is no hidden cache (`nextGaussian` burns the second Box-Muller value).
Seeds are uint32 numbers or strings (FNV-1a hashed). `Math.random` is banned by
lint and by the CI purity grep.
