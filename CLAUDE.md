# CLAUDE.md — Engineering Working Agreement

You are the engineer on this project. Jesse is the supervisor/architect and
reviews all work. SPEC.md is the source of truth; SLICES.md defines the order
of work. Read both before writing any code.

## Roles and workflow

You operate AUTONOMOUSLY WITHIN A SLICE and stop at SLICE BOUNDARIES. The
supervisor's involvement is deliberately limited to three checkpoints:

1. Slice plan approval — before starting a slice, post the PR-by-PR plan and
   any spec questions in ONE message; wait for one approving reply.
2. Spec ambiguity or disagreement — if the spec is unclear or you believe a
   decision is wrong, STOP and ask. Never silently deviate. A clarifying
   question costs one message; a wrong assumption costs a slice.
3. Slice demo sign-off — when the slice's demo checklist is satisfied, post
   the checklist with evidence and the deployed URL, then STOP. Never mark a
   slice complete yourself; visual/geometry correctness requires human eyes.

Everything else is yours: implement, test, open PRs, and MERGE YOUR OWN PRs
once CI is green, without asking. Do not request per-PR approval.

- Work proceeds slice by slice, in order, per SLICES.md. Do not start a slice
  until the previous one has supervisor sign-off.
- One slice = several small PRs. Each PR must be independently reviewable and
  leave main deployable.
- Every PR description must include a short plain-English summary for
  asynchronous review: what this does, key decisions made, and what a
  reviewer should look at. Assume it will be read after merge.

## Hard rules (learned from previous projects — do not relitigate)

1. Determinism is sacred. All randomness flows through the injected seeded PRNG.
   No Math.random() anywhere in sim/. Add a lint rule or grep check in CI.
2. sim/ is pure: no DOM, no Canvas, no React imports, no timers. It must run
   under Vitest in Node. render/ and ui/ depend on sim/, never the reverse.
3. Fixed timestep. Physics dt is a constant; rendering framerate must not
   affect simulation results.
4. Visual correctness requires visual verification. Geometry code (track
   offsets, raycasts, car orientation) has historically hidden mirroring/sign
   bugs that survive code review. For any geometry PR, include a test that
   asserts against hand-computed coordinates AND describe what was visually
   verified in the browser (which direction the car turns for positive
   steering, which side the left-edge offset is on, etc.).
5. No new runtime dependencies without approval. The NN, GA, physics, and
   charts are written from scratch — that is the point of the project.

## Code conventions

- TypeScript strict; no `any`, no `as` casts in sim/ (test files may be looser)
- Named exports only; no default exports
- Units and conventions documented at the top of physics files: distances in
  meters, angles in radians, y-axis direction, heading-zero direction. Every
  geometry function's JSDoc states its coordinate convention.
- Config values (physics constants, GA hyperparameters) live in a single
  typed config module — no magic numbers scattered in logic.
- Tests colocated as *.test.ts next to the module under test.

## Definition of done (every PR)

- [ ] Typecheck, lint, and tests pass locally and in CI
- [ ] New logic in sim/ has unit tests
- [ ] No console.log left in committed code
- [ ] PR description: what changed, how it was verified, any spec deviations
- [ ] main remains deployable

## Git

- Branch per PR: slice-N/short-description
- Conventional commits (feat:, fix:, test:, chore:, docs:)
- No force-pushes to main; squash-merge PRs
