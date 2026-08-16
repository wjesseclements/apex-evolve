# Findings

Everything below is reproducible: the simulation is bit-identical across JS
engines, so `node scripts/evolve-headless.ts <gens> <seed> [crossover] [gripA] [lapBonus]`,
`node scripts/inspect-champion.ts …` and `node scripts/generalize.ts` print
exactly these numbers on any machine (Node ≥ 22.18).

## 1. Headline: crossover escapes the plateau 50 generations earlier

The most consequential single result of the project. Uniform crossover is
OFF by default (SPEC frames it as an A/B toggle; mutation-only is the
baseline) — and that framing is exactly what made the comparison possible:
same seed, one flag, otherwise bit-identical runs.

60 generations, seeds 42–44, everything else default:

| seed | crossover | first lap gen | gen 30 best / mean | gen 60 best / mean | best lap |
|---|---|---|---|---|---|
| 42 | off | — | 192.0 / 113.6 | 232.5 / 184.7 | — |
| 42 | **on** | **10** | 808.4 / 537.3 | 840.4 / 602.5 | 18.60 s |
| 43 | off | 9 | 830.4 / 690.5 | 848.3 / 660.1 | 18.33 s |
| 43 | on | 6 | 840.1 / 533.0 | 844.5 / 638.6 | 18.47 s |
| 44 | off | 10 | 793.1 / 562.0 | 830.7 / 643.7 | 18.72 s |
| 44 | on | 8 | 852.9 / 574.9 | 889.7 / 601.3 | 17.62 s |

On the benchmark seed, mutation alone needs 60 generations to find a genome
that lifts before the left-hand kink; with crossover the population combines
partial solutions and laps at **generation 10**. First laps also came earlier
on seeds 43 and 44 (6 vs 9, 8 vs 10); final bests were slightly higher with
crossover on for 2 of 3 seeds, means mixed (crossover keeps more diversity in
the pool). Interpretation: with a 112-parameter genome and a fitness landscape
that has a plateau in front of one specific corner, recombining two decent
parents finds "lift here" more often than 0.2-σ Gaussian nudges to a single
parent do. The default stays off so the baseline is the plainest possible GA;
the toggle (`?seed=42&crossover=1`) is a one-click experiment.

## 2. The grip limit turns "steer" into "brake, then steer"

Without a grip limit (Slices 0–3) the arcade model has a speed-independent
minimum turn radius (`vMax / steerRate = 12 m`), so every corner is takeable
flat out. Seed 42's champion held **full throttle 100 % of the time at
29.8 m/s**, lapped in **13.63 s** (32.3 m/s average on a 30 m/s car ⇒ its path
was ~7 % shorter than the 440 m centerline — the inside line, found by
evolution with no notion of "racing line") and scored 906 m in a 30 s episode
(> 900 = vMax × 30 s, for the same reason).

With the lateral-acceleration cap `A = 20 m/s²` (`|ω| ≤ A/v`, so the turn
radius at speed can't drop below `v²/A`: 45 m at 30 m/s; corner speed
`√(A·R)` = 19 m/s at R = 18), full-throttle cornering is impossible.
Dissecting the champions (`inspect-champion.ts`, solo episode on track A):

| | grip off (seed 42, gen 27) | grip 20 (seed 42, gen 98) | grip 20 (seed 43, gen 59) |
|---|---|---|---|
| best lap | **13.63 s** | 18.83 s | 18.17 s |
| full throttle / coast / brake (% of ticks) | 100 / 0 / 0 | 76 / 23 / 1.3 | 66 / 32 / 1.7 |
| speed: mean / in the kink section | 28.1 / 29.8 m/s | 23.5 / ~20 m/s | 23.7 / ~22 m/s |
| where the brake is applied | nowhere | 25 % of ticks in the 180–200 m bin (kink entry) | 54 % of ticks in 400–420 m (start-corner entry), 7 % at 100–120 m |

The evolved drivers mostly *lift* (throttle 0–0.5) for corners and *brake* on
the two hardest entries; laps are ~5 s slower than the physics-free line, and
lap times keep falling with generations (seed 42: 22.38 s at the first lap,
gen 60 → 19.02 s at gen 95).

### Tuning A (seed 42, 100 generations)

| A (m/s²) | 12 | 16 | 18 | **20** | 22 | 24 | 25 | off |
|---|---|---|---|---|---|---|---|---|
| best fitness at gen 100 | 215 | 215 | 658 | **723** | 172 | 174 | 177 | 906 |
| first lap | — | — | gen 99 | **gen 60** | — | — | — | gen 7 |

Not monotone in A: learning to brake is a hard credit-assignment problem for a
mutation-only GA and seed 42 happens to be an unlucky seed. A = 20 keeps every
corner below flat-out speed on both tracks and still meets SPEC success
criterion 1 (a lap within 100 generations on the default seed) — the seed was
never changed to make that true. Seeds 43–46 lap within 2–10 generations.

### Seed 42, default config (grip 20, lap bonus 2000, crossover off)

```
gen |   best |   mean | median | bestprog | crash | stall | laps | ticks | bestlap
  0 |  103.2 |    6.9 |    0.0 |    103.2 |   36% |   64% |    0 |   545 |       —
  5 |  156.6 |  112.6 |  115.1 |    156.6 |  100% |    0% |    0 |   436 |       —
 10 |  179.5 |  114.7 |  122.4 |    179.5 |  100% |    0% |    0 |   483 |       —
 20 |  192.0 |  111.4 |  127.8 |    192.0 |  100% |    0% |    0 |   515 |       —
 30 |  192.0 |  106.8 |  115.5 |    192.0 |  100% |    0% |    0 |   515 |       —
 40 |  198.6 |  102.1 |   93.2 |    198.6 |  100% |    0% |    0 |   589 |       —
 50 |  213.7 |  157.0 |  194.7 |    213.7 |  100% |    0% |    0 |  1246 |       —
 59 |  232.5 |  184.7 |  210.1 |    232.5 |  100% |    0% |    0 |  1179 |       —
 60 |  680.2 |  207.8 |  213.6 |    590.9 |   96% |    0% |    2 |  1800 |   22.38
 65 |  705.6 |  384.7 |  260.5 |    613.5 |   51% |    0% |   45 |  1800 |   21.70
 70 |  735.0 |  524.1 |  641.2 |    639.7 |   29% |    0% |   71 |  1800 |   20.98
 80 |  783.6 |  531.2 |  683.5 |    683.0 |   36% |    0% |   64 |  1800 |   19.85
 90 |  808.5 |  579.0 |  761.5 |    704.8 |   35% |    0% |   66 |  1800 |   19.30
 95 |  820.4 |  597.7 |  762.8 |    715.3 |   33% |    0% |   69 |  1800 |   19.02
best ever 828.9 at gen 98
```

The 60-generation plateau at ~190–230 m is the population failing the
left-hand kink at speed; the jump at gen 60 is the first genome that lifts
before it. Ten generations later most of the population laps.

## 3. The lap-time bonus: rationale stated, tested, found unnecessary — kept per SPEC

The SPEC's fitness is progress plus a lap-time bonus for finishers
(`fitness = progress + 2000 / bestLapSeconds`). The stated rationale before
testing: the completion step (~100–133 metre-equivalents) protects
lap-finishing as a trait, and it rewards lap time directly rather than 30 s
throughput.

Tested: seed 42, grip on, 100 generations, `lapBonus = 2000` vs `0`. Result:
**identical best-progress and lap-time trajectories through gen 90**
(22.38 → 19.30 s), diverging only in the fitness numbers. In a 30 s episode,
progress already ranks lap speed — a faster car simply covers more track — so
the bonus did not change a single selection decision on this seed.

Conclusion: the rationale did not survive contact with the data; on this task
the bonus is unnecessary. It is kept because the SPEC defines the fitness that
way and it makes "lap time" an explicit, readable objective — but the README
does not claim it helps. (`lapBonus: 0` in `sim/config.ts` reproduces the
comparison.)

## 4. Exploits and surprises evolution found

- **The inside line, before anyone asked for it.** Without a grip limit, the
  seed-42 champion's best lap was 13.63 s — an average of 32.3 m/s on a car
  that tops out at 30 m/s along the centerline. Its path is ~7 % shorter than
  the 440 m centerline: it hugs the inside of every corner. The same effect
  showed up as fitness 906 m > 900 m (= vMax × 30 s) — the progress metric
  measures centerline metres, so a shorter line "earns" more than the car
  physically drove.
- **Lift, don't brake.** With the grip limit, the champions mostly *coast*
  (throttle 0–0.5 for 23–32 % of ticks) and only tap the brake (1–2 %) on the
  two hardest entries. Drag does the rest. A human would brake; the network
  found that lifting early is cheaper than braking late.
- **The stall rule shaped generation 0.** 64 % of the random population stalls
  (never moves) and 36 % crashes; the rule (3 s below 0.5 m/s ⇒ dead) exists so
  those cars don't consume the whole 30 s. It changed nothing about fitness
  but everything about wall-clock.
- **Elites are visible.** Because the top 5 are copied unchanged and drive
  identically, the population visually clusters into a few "cars" — 100 ghosts,
  most exactly overlapping.

## 5. Generalization: train on A, test on B (and back)

Protocol fixed before running: seeds 42–46, 40 generations, the champion
(bestEver) run **solo** for one 30 s episode on the other track; report
progress, laps, death cause and tick. Track A: 440 m, clockwise, right-handers
dominate. Track B ("held-out"): 509 m, counter-clockwise, left-handers
dominate, one tight R = 16 corner, a 100 m straight. B is never used for
training in the default run.

```
=== train on A (440 m), 40 generations → champion solo on B (509 m)
seed | champ gen | train fitness | first lap gen | own-track solo                        | other-track solo
  42 |        39 |         198.6 |             — |  198.6 m  laps 0  wall@589            |   65.2 m  laps 0  wall@254
  43 |        39 |         835.2 |             9 |  727.9 m  laps 1 [18.6 s]  alive@1800 |  730.9 m  laps 1 [21.4 s]  alive@1800
  44 |        35 |         815.1 |            10 |  710.5 m  laps 1 [19.1 s]  alive@1800 |  717.0 m  laps 1 [22.0 s]  alive@1800
  45 |        39 |         850.8 |             2 |  741.9 m  laps 1 [18.4 s]  alive@1800 |   73.3 m  laps 0  wall@256
  46 |        39 |         839.3 |             8 |  731.6 m  laps 1 [18.6 s]  alive@1800 |  710.2 m  laps 1 [22.2 s]  alive@1800

=== train on B (509 m), 40 generations → champion solo on A (440 m)
seed | champ gen | train fitness | first lap gen | own-track solo                        | other-track solo
  42 |        38 |         194.4 |             — |  194.4 m  laps 0  wall@511            |   58.3 m  laps 0  wall@226
  43 |        39 |         494.9 |             — |  494.9 m  laps 0  alive@1800          |  119.1 m  laps 0  wall@524
  44 |        39 |         824.3 |             9 |  731.5 m  laps 1 [21.6 s]  alive@1800 |  659.6 m  laps 1 [20.6 s]  alive@1800
  45 |        35 |         842.2 |             4 |  747.4 m  laps 1 [21.1 s]  alive@1800 |  680.7 m  laps 1 [19.1 s]  wall@1710
  46 |        38 |         818.8 |             7 |  725.8 m  laps 1 [21.5 s]  alive@1800 |  163.7 m  laps 0  wall@463
```

Result: of the champions that had learned to lap their own track, **3 of 4
(A→B) and 2 of 3 (B→A) completed a lap of the unseen track** at speeds within
~15 % of their home lap; the failures crash at a specific corner early on
(tick 254–463) — the reactive ray→steering/throttle policy carries over, but
a corner shape it never met can still be fatal. Seed 42 had not learned to
lap either track by gen 40 (see §1) and generalizes accordingly. This is
generalization of a *reflex*, not a memorised line: the networks see only 7
wall distances and their speed. (Note the "own-track solo" progress is lower
than the training fitness because fitness includes the lap bonus.)

## 6. Testing strategy: property sweeps over real geometry (the project's MVP)

Every geometry module has hand-computed cases on a 100 m square (edges,
quads, rays, arc positions), *and* a property/invariant sweep over the real
track(s): "for every centerline vertex, every ray sample lies on the surface
and 5 cm past the hit is off it"; "for every point on a sweep across the
track, the hint-localized containment test agrees with the full scan"; "walking
the centerline is monotone and ends at exactly one lap"; "clicking exactly on
every living car returns it". The hand-computed cases never failed after
first commit. The sweeps caught three real bugs:

1. **Raycast, Slice 1** — a ray whose origin sat exactly on a shared quad
   boundary (the start pose!) failed to exit under the "exclude the entry edge"
   walk; switched to Cyrus-Beck exits.
2. **Quad containment, Slice 4** — a point exactly on the boundary between two
   drivable quads produced a ±1e-15 cross-product sign and was rejected by
   *both* quads (found only when the second track was swept); fixed with a
   1e-9 m² tolerance.
3. **Sensor sweep, Slice 1** — documented the 4.5° tilt of the closing segment
   on track A (a real geometric fact, not a bug, that would otherwise have
   read as "the side ray is wrong").

The other pillar is bit-exact golden pins (physics, world, sensors, PRNG,
GA, evolution) checked on macOS/arm64 and Linux/x64 CI, which turn "same seed
⇒ same run" from a hope into a tripwire.

## 7. Engineering notes worth keeping

- **Cross-engine bit-identity is real, and cheap once you own the math.** V8
  on Linux/x64 already used fdlibm-derived trig; macOS/arm64 differed in the
  last bits. Owning sin/cos/atan2/exp/tanh/log (fdlibm kernels) made every
  golden pin pass everywhere and made `?seed=…` links replay exactly.
- The steady ~25–35 % crash rate after convergence is the mutation tax
  (per-gene 10 % Gaussian σ = 0.2 on 95 offspring per generation) — the
  exploration budget, not a defect.

## 8. Performance audit (Slice 5)

- **Hot loop (plain Node, 100 cars, generation with most cars alive):
  ~170 µs per tick**, i.e. ~1.7 µs per car — sensing 0.74 µs (7 quad-walk
  rays), network forward 0.52 µs (112 MACs + 12 tanh), collision 0.31 µs
  (4 corners × ≤ 3 quads), progress 0.08 µs, physics 0.05 µs. That is ~1 % of
  a 60 fps frame at 1× and ~100× real time single-threaded; in the browser the
  12 ms/frame budget of "max" mode reaches 130× real time early on (short,
  crashy generations) and ~40× once everyone laps. Under Vitest the same loop
  measures ~0.44 ms/tick (instrumentation); the app's own HUD shows
  0.2–0.6 ms of sim + render per frame at 1×.
- Nothing was optimized: sensing and the network already dominate and are
  allocation-light; the immutable per-tick objects (Car, CarState, RayHit)
  cost less than a millisecond a second at 1×. Determinism goldens make any
  future micro-optimization safe to attempt.
- **Bundle:** 250 kB JS (81 kB gzip — React + React DOM are ~180 kB of it),
  6.6 kB CSS; no runtime dependencies beyond react, react-dom, zustand.
- **Lighthouse (production, mobile emulation, while the sim runs at 16×):**
  performance 94, accessibility 97 → 100 after labelling the inspector
  meters, best practices 100, SEO 100; FCP 1.3 s, LCP 1.4 s, CLS 0, TBT
  240 ms (the landing runs 16 ticks per frame from the first frame — that
  main-thread work is the product, not overhead).
