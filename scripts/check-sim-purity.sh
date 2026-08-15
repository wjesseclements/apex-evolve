#!/usr/bin/env bash
# Belt-and-braces purity check for src/sim (in addition to the ESLint rules in
# eslint.config.js). Fails CI if sim/ references anything that would break
# determinism or headless execution. Runs from the repo root.
set -euo pipefail

SIM_DIR="src/sim"
[ -d "$SIM_DIR" ] || { echo "no $SIM_DIR directory yet; nothing to check"; exit 0; }

fail=0
# check PATTERN WHY [nontest]
#   Greps src/sim for PATTERN, ignoring comment lines. With a third argument,
#   test files are skipped (they may call Math.* as a reference to compare
#   dmath against); otherwise tests are checked too (no Math.random anywhere).
check() {
  local pattern="$1" why="$2" scope="${3:-all}"
  local -a excl=()
  [ "$scope" = "nontest" ] && excl=(--exclude='*.test.ts')
  if hits=$(grep -rnE --include='*.ts' ${excl[@]+"${excl[@]}"} "$pattern" "$SIM_DIR" | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|/\*)'); then
    echo "PURITY VIOLATION ($why):"
    echo "$hits"
    fail=1
  fi
}

check 'Math\.random' 'all randomness must flow through the seeded PRNG'
check 'Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt)\b' 'engine-dependent Math function in sim/ — use src/sim/math/dmath.ts' nontest
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
