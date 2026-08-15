#!/usr/bin/env bash
# Belt-and-braces purity check for src/sim (in addition to the ESLint rules in
# eslint.config.js). Fails CI if sim/ references anything that would break
# determinism or headless execution. Runs from the repo root.
set -euo pipefail

SIM_DIR="src/sim"
[ -d "$SIM_DIR" ] || { echo "no $SIM_DIR directory yet; nothing to check"; exit 0; }

fail=0
check() {
  local pattern="$1" why="$2"
  # Exclude test files: they are allowed to be looser, but still no Math.random.
  if hits=$(grep -rnE --include='*.ts' "$pattern" "$SIM_DIR"); then
    echo "PURITY VIOLATION ($why):"
    echo "$hits"
    fail=1
  fi
}

check 'Math\.random' 'all randomness must flow through the seeded PRNG'
check 'Date\.now|new Date\(' 'no wall-clock time in sim/'
check '\b(window|document|navigator)\.' 'no DOM in sim/'
check 'requestAnimationFrame|setTimeout|setInterval' 'no timers in sim/'
check "from ['\"](react|react-dom)" 'no React in sim/'
check "from ['\"][^'\"]*/(render|ui)/" 'sim/ must not import render/ or ui/'

if [ "$fail" -ne 0 ]; then
  echo "src/sim purity check FAILED"
  exit 1
fi
echo "src/sim purity check passed"
