#!/usr/bin/env bash
# Tests for kimi-credential. Hermetic: fixture credential files and a fake
# kimi on PATH. No network, no subscription required.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/kimi-credential"
PASS=0
FAIL=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Build a credential file whose token expires $1 seconds from now.
make_cred() {
  local home=$1 offset=$2 token=$3
  mkdir -p "$home/credentials"
  python3 - "$home/credentials/kimi-code.json" "$offset" "$token" <<'PY'
import json, sys, time
path, offset, token = sys.argv[1], int(sys.argv[2]), sys.argv[3]
json.dump({"access_token": token, "refresh_token": "r", "token_type": "Bearer",
           "expires_in": 900, "expires_at": int(time.time()) + offset}, open(path, "w"))
PY
}

check() {
  local label=$1 actual=$2 expected=$3
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1)); printf '  [ok]   %s\n' "$label"
  else
    FAIL=$((FAIL + 1)); printf '  [FAIL] %s\n         expected: %s\n         actual:   %s\n' "$label" "$expected" "$actual"
  fi
}

echo "A valid token is printed verbatim:"
HOME_A="$WORK/a"
make_cred "$HOME_A" 600 "tok-valid"
mkdir -p "$WORK/bin_a"
cat > "$WORK/bin_a/kimi" <<EOF
#!/usr/bin/env bash
touch "$WORK/spawned"
EOF
chmod +x "$WORK/bin_a/kimi"
OUT=$(KIMI_CODE_HOME="$HOME_A" PATH="$WORK/bin_a:$PATH" bash "$SCRIPT" 2>"$WORK/err_a")
STATUS=$?
check "stdout is the token" "$OUT" "tok-valid"
check "exit 0" "$STATUS" "0"
check "stderr is empty" "$(cat "$WORK/err_a")" ""
check "no subprocess spawned" "$([ -e "$WORK/spawned" ] && echo yes || echo no)" "no"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
