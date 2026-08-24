#!/usr/bin/env bash
# Tests for kimi-delegate. Hermetic: fake kimi and claude on PATH that echo
# their argv, so we assert on the command that would have run.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/kimi-delegate"
PASS=0
FAIL=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BIN="$WORK/bin"
mkdir -p "$BIN"

make_cred() {
  mkdir -p "$WORK/home/credentials"
  python3 - "$WORK/home/credentials/kimi-code.json" <<'PY'
import json, sys, time
json.dump({"access_token": "tok", "expires_at": int(time.time()) + 900}, open(sys.argv[1], "w"))
PY
}

run() {
  KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" bash "$SCRIPT" "$@" 2>&1
}

check_contains() {
  local label=$1 haystack=$2 needle=$3
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    PASS=$((PASS + 1)); printf '  [ok]   %s\n' "$label"
  else
    FAIL=$((FAIL + 1)); printf '  [FAIL] %s\n         wanted to find: %s\n         in: %s\n' "$label" "$needle" "$haystack"
  fi
}

check_missing() {
  local label=$1 haystack=$2 needle=$3
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    FAIL=$((FAIL + 1)); printf '  [FAIL] %s\n         did not want: %s\n         in: %s\n' "$label" "$needle" "$haystack"
  else
    PASS=$((PASS + 1)); printf '  [ok]   %s\n' "$label"
  fi
}

make_cred

echo "The version gate:"
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.18.0"; exit 0; fi\necho "KIMI ARGV: $*"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"
OUT=$(run --via kimi -- "review this")
check_contains "0.18.0 is refused" "$OUT" "0.38.0"
check_missing "0.18.0 never reaches the CLI" "$OUT" "KIMI ARGV"

echo "Path A containment:"
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.38.0"; exit 0; fi\necho "KIMI ARGV: $*"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"

OUT=$(run --via kimi -- "find the bug")
check_contains "no --agent means explore" "$OUT" "--agent explore"
check_contains "the prompt is passed" "$OUT" "find the bug"

OUT=$(run --via kimi --agent coder -- "fix the bug")
check_contains "an explicit agent is forwarded" "$OUT" "--agent coder"
check_missing "explore is not substituted in" "$OUT" "explore"

OUT=$(run --via kimi --agent coder --dangerously-skip-permissions -- "x")
check_contains "skip-permissions is refused" "$OUT" "refusing"
check_missing "skip-permissions never reaches the CLI" "$OUT" "KIMI ARGV"

OUT=$(KIMI_DELEGATE_DEPTH=1 KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" bash "$SCRIPT" --via kimi -- "x" 2>&1)
check_contains "recursion is refused" "$OUT" "already in progress"
check_missing "recursion never reaches the CLI" "$OUT" "KIMI ARGV"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
