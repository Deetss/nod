#!/usr/bin/env bash
# Release gate for the public snapshot. Run from the repo root.
# Runs every check, prints one line per check, and exits non-zero if any failed.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

failed=0

pass() { printf 'PASS %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failed=1; }

# 1. Secrets scan.
if ! command -v gitleaks >/dev/null 2>&1; then
  fail "gitleaks: binary not found on PATH (install it, e.g. via mise)"
elif gitleaks detect --no-banner --redact >/tmp/oss-gate-gitleaks.$$ 2>&1; then
  pass "gitleaks detect"
else
  cat /tmp/oss-gate-gitleaks.$$
  fail "gitleaks detect"
fi
rm -f /tmp/oss-gate-gitleaks.$$

# 2. Private-name scrub over tracked files.
scrub_pattern='bloomfield|lots|bpppr|laurel|tail9af62b|itsupport|commission|bannerbaker|mjolnir|hq-its|deetss|jjmate|jj-?mate|jj-?lee|jj-?leads|crew-bot|dylan|dietz|cowork|hermes'
# Org and company names that legitimately contain a banned word are allowed.
hits=$(git ls-files -z -- . ':!:LICENSE' ':!:scripts/oss-gate.sh' \
  | xargs -0 grep -n -I -i -E "$scrub_pattern" /dev/null \
  | grep -v -e 'Deetss Labs' -e 'github.com/Deetss/' || true)
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  hit_count=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')
  fail "scrub grep: $hit_count hit(s)"
else
  pass "scrub grep: no hits"
fi

# 3. Typecheck, tests, build.
if pnpm typecheck; then pass "pnpm typecheck"; else fail "pnpm typecheck"; fi
if pnpm test; then pass "pnpm test"; else fail "pnpm test"; fi
if pnpm build; then pass "pnpm build"; else fail "pnpm build"; fi

if [ "$failed" -ne 0 ]; then
  echo "oss-gate: FAILED"
  exit 1
fi
echo "oss-gate: OK"
