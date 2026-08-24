#!/usr/bin/env bash
# Tests for kimi-credential. Hermetic: fixture credential files and a fake
# kimi on PATH. No network, no subscription required.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/kimi-credential"
PASS=0
FAIL=0

WORK=$(mktemp -d)

# Long and token-shaped on purpose: a 9-character fixture would slip through
# the "nothing token-shaped reached stderr" assertion below.
TOK_VALID="eyJhbGciOiJIUzI1NiJ9.dmFsaWQtZml4dHVyZQ.AAAAAAAAAAAAAAAAAAAAAA"
TOK_STALE="eyJhbGciOiJIUzI1NiJ9.c3RhbGUtZml4dHVyZQ.BBBBBBBBBBBBBBBBBBBBBB"
TOK_FRESH="eyJhbGciOiJIUzI1NiJ9.ZnJlc2gtZml4dHVyZQ.CCCCCCCCCCCCCCCCCCCCCC"
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

# A fake kimi that rewrites the credential file the way the real CLI does.
make_fake_kimi() {
  local bindir=$1 home=$2 newtoken=$3
  mkdir -p "$bindir"
  cat > "$bindir/kimi" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "--version" ]; then echo "0.38.0"; exit 0; fi
python3 - "$home/credentials/kimi-code.json" "$newtoken" <<'PY'
import json, sys, time
path, token = sys.argv[1], sys.argv[2]
d = json.load(open(path))
d["access_token"] = token
d["expires_at"] = int(time.time()) + 900
json.dump(d, open(path, "w"))
PY
echo "fake kimi ran"
EOF
  chmod +x "$bindir/kimi"
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
make_cred "$HOME_A" 600 "$TOK_VALID"
mkdir -p "$WORK/bin_a"
cat > "$WORK/bin_a/kimi" <<EOF
#!/usr/bin/env bash
touch "$WORK/spawned"
EOF
chmod +x "$WORK/bin_a/kimi"
OUT=$(KIMI_CODE_HOME="$HOME_A" PATH="$WORK/bin_a:$PATH" bash "$SCRIPT" 2>"$WORK/err_a")
STATUS=$?
check "stdout is the token" "$OUT" "$TOK_VALID"
check "exit 0" "$STATUS" "0"
check "stderr is empty" "$(cat "$WORK/err_a")" ""
check "no subprocess spawned" "$([ -e "$WORK/spawned" ] && echo yes || echo no)" "no"

echo "A stale token is refreshed through the Kimi CLI:"
HOME_B="$WORK/b"
make_cred "$HOME_B" -10 "$TOK_STALE"
make_fake_kimi "$WORK/bin_b" "$HOME_B" "$TOK_FRESH"
OUT=$(KIMI_CODE_HOME="$HOME_B" PATH="$WORK/bin_b:$PATH" bash "$SCRIPT" 2>"$WORK/err_b")
check "stale token is replaced" "$OUT" "$TOK_FRESH"
check "refresh keeps stderr empty" "$(cat "$WORK/err_b")" ""
check "no CLI chatter on stdout" "$(printf '%s' "$OUT" | grep -c 'fake kimi ran')" "0"

echo "Failure is loud and names the fix:"
HOME_C="$WORK/c"
mkdir -p "$HOME_C/credentials"
OUT=$(KIMI_CODE_HOME="$HOME_C" PATH="/nonexistent:/usr/bin:/bin" bash "$SCRIPT" 2>"$WORK/err_c")
STATUS=$?
check "missing credential exits 1" "$STATUS" "1"
check "missing credential prints nothing on stdout" "$OUT" ""
check "missing credential names kimi login" "$(grep -c 'kimi login' "$WORK/err_c")" "1"

HOME_D="$WORK/d"
make_cred "$HOME_D" -10 "$TOK_STALE"
mkdir -p "$WORK/bin_d"
printf '#!/usr/bin/env bash\nexit 1\n' > "$WORK/bin_d/kimi"
chmod +x "$WORK/bin_d/kimi"
OUT=$(KIMI_CODE_HOME="$HOME_D" PATH="$WORK/bin_d:$PATH" bash "$SCRIPT" 2>"$WORK/err_d")
STATUS=$?
check "failed refresh exits 1" "$STATUS" "1"
check "failed refresh names kimi login" "$(grep -c 'kimi login' "$WORK/err_d")" "1"

check "no token-shaped string in any stderr" \
  "$(cat "$WORK"/err_* | grep -cE '[A-Za-z0-9._-]{40,}')" "0"
check "no fixture token verbatim in any stderr" \
  "$(cat "$WORK"/err_* | grep -cF -e "$TOK_VALID" -e "$TOK_STALE" -e "$TOK_FRESH")" "0"

echo "A broken interpreter is diagnosed, not blamed on the login:"
HOME_E="$WORK/e"
make_cred "$HOME_E" 600 "$TOK_VALID"
mkdir -p "$WORK/bin_e"
printf '#!/bin/sh\nexit 127\n' > "$WORK/bin_e/python3"
printf '#!/bin/sh\ntouch "%s/refresh_ran"\n' "$WORK" > "$WORK/bin_e/kimi"
chmod +x "$WORK/bin_e/python3" "$WORK/bin_e/kimi"
OUT=$(KIMI_CODE_HOME="$HOME_E" PATH="$WORK/bin_e:$PATH" bash "$SCRIPT" 2>"$WORK/err_e")
STATUS=$?
check "broken interpreter exits 1" "$STATUS" "1"
check "broken interpreter names python3" "$(grep -c python3 "$WORK/err_e")" "1"
check "broken interpreter does not blame the login" "$(grep -c 'kimi login' "$WORK/err_e")" "0"
check "a valid token never triggers a refresh" "$([ -e "$WORK/refresh_ran" ] && echo yes || echo no)" "no"

echo "Refresh works on a machine with no timeout(1) -- stock macOS has none:"
SANDBOX="$WORK/sandbox"
mkdir -p "$SANDBOX"
# Everything the helper needs, and deliberately NOT timeout.
for tool in bash sh env python3 mktemp rm cat grep head tr dirname; do
  src=$(command -v "$tool" 2>/dev/null) && ln -sf "$src" "$SANDBOX/$tool"
done
check "the sandbox really has no timeout" "$([ -e "$SANDBOX/timeout" ] && echo yes || echo no)" "no"
HOME_F="$WORK/f"
make_cred "$HOME_F" -10 "$TOK_STALE"
make_fake_kimi "$SANDBOX" "$HOME_F" "$TOK_FRESH"
OUT=$(KIMI_CODE_HOME="$HOME_F" PATH="$SANDBOX" /usr/bin/env bash "$SCRIPT" 2>"$WORK/err_f")
STATUS=$?
check "refresh still succeeds without timeout" "$OUT" "$TOK_FRESH"
check "no timeout means no crash" "$STATUS" "0"
check "and stderr stays clean" "$(cat "$WORK/err_f")" ""

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
