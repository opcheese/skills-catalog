#!/usr/bin/env bash
# The plugin manifest must be valid JSON with the fields the marketplace reads.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MANIFEST="$ROOT/.claude-plugin/plugin.json"
PASS=0
FAIL=0

check() {
  local label=$1 actual=$2 expected=$3
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1)); printf '  [ok]   %s\n' "$label"
  else
    FAIL=$((FAIL + 1)); printf '  [FAIL] %s: expected %s, got %s\n' "$label" "$expected" "$actual"
  fi
}

check "manifest exists" "$([ -f "$MANIFEST" ] && echo yes || echo no)" "yes"
check "valid json" "$(python3 -c 'import json,sys;json.load(open(sys.argv[1]));print("yes")' "$MANIFEST" 2>/dev/null || echo no)" "yes"
check "name" "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["name"])' "$MANIFEST" 2>/dev/null)" "kimi-delegation"
check "has description" "$(python3 -c 'import json,sys;print("yes" if json.load(open(sys.argv[1])).get("description") else "no")' "$MANIFEST" 2>/dev/null || echo no)" "yes"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
