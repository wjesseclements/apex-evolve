# Blog post outline — "100 cars, no gradients: what a from-scratch GA taught me about racing lines"

**Hook (2 sentences):** I built a browser sim where 100 neural-network cars evolve to drive a track — no ML libraries, no backprop, and every run reproducible bit-for-bit in any browser from a URL. The most interesting things it produced were not in the plan: an inside line nobody asked for, a 50-generation plateau that one flag dissolves, and three geometry bugs found by the same kind of test.

1. **What it is (30 s)** — link to the demo, the hero GIF (gen 1 vs gen 70), the one-paragraph loop: 7 rays + speed → 8→10→2 tanh → steering/throttle; 30 s episodes; top 5 survive, 95 mutated offspring of tournament winners.
2. **The plateau is the story** — seed 42's history table; gens 10–59 stuck at ~200 m in front of the left-hand kink; the breakthrough at 60; why the landing page shows it at 16× and slows down when it happens (FINDINGS §2 table).
3. **The headline: crossover** — the A/B table (gen 10 vs 60); why the A/B framing (default off, one flag, bit-identical otherwise) is what made the finding possible; the interpretation (recombining partial solutions vs 0.2-σ nudges) and its limits (3 seeds).
4. **Racing lines need physics** — before/after grip limit: 13.63 s at 100 % throttle vs 18.2 s with 30 % coasting; the "lift, don't brake" strategy; where along the lap the brake fires; the non-monotone tuning sweep in A and the rule "tune A, never the seed".
5. **Honesty section** — the lap-time bonus: rationale, test, "identical selection through gen 90", kept per spec but not oversold. Fitness shaping is easy to believe in and cheap to test.
6. **Does it generalize?** — pre-registered protocol (5 seeds, 40 gens, solo on the other track, both ways), the 3/4 and 2/3 result, what fails (one specific corner), what it means (a reflex, not a memorised line).
7. **Determinism as a feature** — why `Math.sin` differs across engines, porting fdlibm kernels, golden pins on two platforms, `?seed=…` links as shareable experiments; the V8-x64-already-fdlibm surprise.
8. **The test that kept paying** — property sweeps over real geometry: three catches, one pattern; hand-computed cases never failed after commit.
9. **What I'd do next** — NEAT, PPO comparison on the same sim core, a real-circuit import.

**Figures (all regenerable):**
- hero GIF gen 1 vs gen 70 (`docs/media/`, capture script in the repo's scratch notes)
- seed-42 history table (`node scripts/evolve-headless.ts 100 42`)
- crossover A/B table (`… 60 <seed> 1` vs `0`)
- brake histogram (`node scripts/inspect-champion.ts 100 42` / `60 43`)
- generalization table (`node scripts/generalize.ts`)
- fitness chart screenshot from the app
