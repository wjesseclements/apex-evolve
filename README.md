# apex-evolve

Neuroevolution racing in the browser: a population of cars, each driven by a
tiny neural network, learns a 2D race track through a genetic algorithm written
from scratch — no ML libraries, no backpropagation.

**Status:** Slice 0 (scaffold + drivable car) in progress. See
[SLICES.md](SLICES.md) for the build plan and [SPEC.md](SPEC.md) for the design.

## Development

```bash
npm install
npm run dev        # Vite dev server
npm run check      # typecheck + lint + format + purity + tests + build (what CI runs)
```

## Layout

```
src/sim/     pure, headless simulation (physics, track, nn, ga, engine) — no DOM, no timers, no Math.random
src/render/  Canvas 2D drawing; depends on sim/ only
src/ui/      React chrome (controls, stats); depends on sim/ and render/
```

Coordinate and unit conventions are locked in [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Process

This project is built slice-by-slice under the working agreement in
[CLAUDE.md](CLAUDE.md); the kickoff instructions are in [KICKOFF.md](KICKOFF.md).
