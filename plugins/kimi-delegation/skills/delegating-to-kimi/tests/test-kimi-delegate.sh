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
check_contains "no --agent pins an agent file" "$OUT" "--agent-file"
check_contains "the pinned agent is the read-only one" "$OUT" "delegate-readonly.md"
check_missing "the default never resolves a bare agent name" "$OUT" "--agent explore"
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

echo "Path B:"
cat > "$BIN/claude" <<'EOF'
#!/usr/bin/env bash
echo "CLAUDE ARGV: $*"
EOF
chmod +x "$BIN/claude"

OUT=$(run --via claude --agent reviewer -- "review this")
check_contains "base url points at kimi" "$OUT" "api.kimi.com/coding"
check_contains "model defaults to k3" "$OUT" '"ANTHROPIC_MODEL": "k3"'
check_contains "apiKeyHelper is an absolute path" "$OUT" "/kimi-credential"
check_contains "the agent is forwarded" "$OUT" "--agent reviewer"
check_contains "the prompt is passed" "$OUT" "review this"

OUT=$(KIMI_DELEGATE_MODEL=kimi-for-coding run --via claude -- "x")
check_contains "the model is overridable" "$OUT" '"ANTHROPIC_MODEL": "kimi-for-coding"'
check_missing "no agent flag when none given" "$OUT" "--agent"

echo "The pinned read-only agent definition:"
AGENT_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../agents" 2>/dev/null && pwd)/delegate-readonly.md"
check_contains "the pinned agent file exists" "$([ -f "$AGENT_FILE" ] && echo yes || echo no)" "yes"
AGENT_BODY="$(cat "$AGENT_FILE" 2>/dev/null)"
check_contains "it allowlists tools" "$AGENT_BODY" "tools:"
check_contains "it allows reading" "$AGENT_BODY" "Read"
check_missing "it grants no shell" "$AGENT_BODY" "Bash"
check_missing "it grants no write tool" "$AGENT_BODY" "Write"
check_missing "it grants no edit tool" "$AGENT_BODY" "Edit"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
