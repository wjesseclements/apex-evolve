# Kickoff instructions (supervisor → engineer)

Read CLAUDE.md, SPEC.md, and SLICES.md in full before doing anything.

You are the engineer; I am the supervisor/architect. We are building the
"apex-evolve" project defined in SPEC.md, working strictly slice by slice per
SLICES.md. You operate autonomously within each slice; I verify demo
checklists at slice boundaries. Minimize requests for my input to the
checkpoints defined in CLAUDE.md.

## Step 1 — Repo setup (do this first, no approval needed)

1. `git init`, create a sensible .gitignore, and make an initial commit
   containing SPEC.md, CLAUDE.md, SLICES.md, and this file.
2. Create the remote and push using the GitHub CLI (already authenticated):
   `gh repo create apex-evolve --public --source=. --remote=origin --push`
3. Set up branch protection expectations per CLAUDE.md (squash merges; you
   may merge your own PRs once CI is green).
4. Report the repo URL.

## Step 2 — Slice 0 plan (single approval gate)

Before writing code, post ONE message containing:

1. Your full PR-by-PR plan for Slice 0 (title + one-line scope each).
2. The coordinate conventions you will use (y-axis direction, heading-zero
   direction, positive-steering direction) — these get locked in permanently.
3. Any spec ambiguities or disagreements — raise them now, not
   mid-implementation.
4. Your proposed Vercel deployment approach (CLI vs dashboard; if any step
   requires my manual action, list exactly what and when).

I will reply once to approve or adjust. After approval, execute the entire
slice autonomously: implement, test, open PRs, merge them when CI is green.
Do not ask for per-PR approval.

## Step 3 — Slice completion

When Slice 0 is complete, post the demo checklist from SLICES.md with your
evidence for each item, plus the deployed URL and anything you want me to
look at with human eyes (especially geometry/visual correctness). Then STOP
and wait for my sign-off before starting Slice 1.

This same rhythm (plan gate → autonomous execution → demo gate) repeats for
every slice.
