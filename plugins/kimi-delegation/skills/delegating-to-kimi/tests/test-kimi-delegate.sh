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

echo "Path A argv (what would run -- not proof of containment):"
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

cat > "$WORK/home/config.toml" <<'TOML'
[models."kimi-code/k3"]
model = "k3"
[models."kimi-code/kimi-for-coding"]
model = "kimi-for-coding"
TOML
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

echo "Malformed invocations terminate:"
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.38.0"; exit 0; fi\necho "KIMI ARGV: $*"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"
for flag in --via --agent --cwd --output; do
  OUT=$(KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" timeout 5 bash "$SCRIPT" "$flag" 2>&1)
  STATUS=$?
  check_missing "trailing $flag does not hang" "timeout:$STATUS" "timeout:124"
  check_contains "trailing $flag names the missing value" "$OUT" "missing value"
done

echo "The version gate reads a version, not a banner:"
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then printf "New version available!\\n0.37.0\\n"; exit 0; fi\necho "KIMI ARGV: $*"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"
OUT=$(run --via kimi -- "x")
check_contains "a banner does not smuggle an old version past the gate" "$OUT" "0.38.0"
check_missing "the old version never reaches the CLI" "$OUT" "KIMI ARGV"

printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "not a version"; exit 0; fi\necho "KIMI ARGV: $*"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"
OUT=$(run --via kimi -- "x")
check_missing "an unreadable version never reaches the CLI" "$OUT" "KIMI ARGV"

echo "Path B fails closed if the settings cannot be built:"
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.38.0"; exit 0; fi\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"
mkdir -p "$WORK/bin_broken"
cp "$BIN/kimi" "$BIN/claude" 2>/dev/null || true
cat > "$BIN/claude" <<'EOF'
#!/usr/bin/env bash
echo "CLAUDE ARGV: $*"
EOF
chmod +x "$BIN/claude"
printf '#!/bin/sh\nexit 127\n' > "$WORK/bin_broken/python3"
chmod +x "$WORK/bin_broken/python3"
OUT=$(KIMI_CODE_HOME="$WORK/home" PATH="$WORK/bin_broken:$BIN:$PATH" bash "$SCRIPT" --via claude -- "x" 2>&1)
check_missing "empty settings never reach claude" "$OUT" "CLAUDE ARGV"
check_contains "empty settings are refused loudly" "$OUT" "settings"

echo "Version comparison is numeric, not lexical:"
version_gate() {
  printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "%s"; exit 0; fi\necho "KIMI ARGV: $*"\n' "$1" > "$BIN/kimi"
  chmod +x "$BIN/kimi"
  run --via kimi -- "x"
}
# 0.9.0 is older than 0.38.0 numerically but NEWER lexically. A string
# comparison would wave it through.
check_missing "0.9.0 is refused, not read as newer than 0.38.0" "$(version_gate 0.9.0)" "KIMI ARGV"
check_contains "0.38.0 itself is accepted" "$(version_gate 0.38.0)" "KIMI ARGV"
check_contains "0.39.1 is accepted" "$(version_gate 0.39.1)" "KIMI ARGV"
check_contains "1.0.0 is accepted" "$(version_gate 1.0.0)" "KIMI ARGV"
check_missing "0.37.9 is refused" "$(version_gate 0.37.9)" "KIMI ARGV"

echo "The install root is harness-neutral:"
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.38.0"; exit 0; fi\necho "KIMI ARGV: $*"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"
ALT="$WORK/alt"
mkdir -p "$ALT/skills/delegating-to-kimi/agents" "$ALT/skills/delegating-to-kimi/scripts"
echo "---" > "$ALT/skills/delegating-to-kimi/agents/delegate-readonly.md"
cp "$SCRIPT" "$ALT/skills/delegating-to-kimi/scripts/kimi-delegate"
OUT=$(KIMI_DELEGATION_ROOT="$ALT" KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" bash "$SCRIPT" --via kimi -- "x" 2>&1)
check_contains "KIMI_DELEGATION_ROOT is honoured" "$OUT" "$ALT/skills/delegating-to-kimi/agents/delegate-readonly.md"
OUT=$(CLAUDE_PLUGIN_ROOT="$ALT" KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" bash "$SCRIPT" --via kimi -- "x" 2>&1)
check_contains "CLAUDE_PLUGIN_ROOT still works as an alias" "$OUT" "$ALT/skills/delegating-to-kimi/agents/delegate-readonly.md"

echo "The model is validated against what Kimi actually offers:"
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.38.0"; exit 0; fi\necho "KIMI ARGV: $*"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"
cat > "$WORK/home/config.toml" <<'TOML'
[models."kimi-code/k3"]
model = "k3"
[models."kimi-code/kimi-for-coding-highspeed"]
model = "kimi-for-coding-highspeed"
TOML

OUT=$(KIMI_DELEGATE_MODEL=k3-typo run --via claude -- "x")
check_contains "an undeclared model is refused" "$OUT" "not a model this Kimi install offers"
check_contains "the refusal lists what is available" "$OUT" "kimi-for-coding-highspeed"
check_missing "and nothing was run" "$OUT" "CLAUDE ARGV"

OUT=$(KIMI_DELEGATE_MODEL=kimi-for-coding-highspeed run --via claude -- "x")
check_contains "a declared model is accepted" "$OUT" "CLAUDE ARGV"
check_contains "and reaches the settings blob" "$OUT" "kimi-for-coding-highspeed"

OUT=$(KIMI_DELEGATE_MODEL=kimi-code/k3 run --via claude -- "x")
check_contains "the kimi-code/ alias form is accepted" "$OUT" "CLAUDE ARGV"
check_contains "and is sent bare on the wire" "$OUT" '"ANTHROPIC_MODEL": "k3"'

# The default must be validated too, or the check only protects people who
# opted in to a model -- which is nobody by default.
cat > "$WORK/home/config.toml" <<'TOML'
[models."kimi-code/something-else"]
model = "something-else"
TOML
OUT=$(run --via claude -- "x")
check_contains "the built-in default is validated too" "$OUT" "not a model this Kimi install offers"

# Unverifiable is not the same as valid. A config with no models at all must
# not silently wave an explicit choice through.
: > "$WORK/home/config.toml"
OUT=$(KIMI_DELEGATE_MODEL=whatever run --via claude -- "x")
check_contains "an unverifiable explicit model is refused" "$OUT" "could not read the model list"
OUT=$(run --via claude -- "x")
check_contains "but the default still runs when the list is unreadable" "$OUT" "CLAUDE ARGV"

echo "Every run says what it ran on:"
cat > "$WORK/home/config.toml" <<'TOML'
[models."kimi-code/k3"]
model = "k3"
TOML
OUT=$(run --via claude -- "x")
check_contains "path B reports the model" "$OUT" "model=k3"
check_contains "path B reports the endpoint" "$OUT" "endpoint=https://api.kimi.com/coding"
check_contains "path B reports that thinking is on and unswitchable" "$OUT" "thinking=on"
OUT=$(run --via kimi -- "x")
check_contains "path A reports its route" "$OUT" "via=kimi"

# config.toml lists the search and fetch services before the provider. A naive
# "first URL in the file" would report one of those as the endpoint.
cat > "$WORK/home/config.toml" <<'TOML'
[services.moonshot_search]
base_url = "https://api.kimi.com/coding/v1/search"
[providers."managed:kimi-code"]
base_url = "https://api.kimi.com/coding/v1"
[models."kimi-code/k3"]
model = "k3"
TOML
OUT=$(run --via kimi -- "x")
check_contains "path A reports the provider endpoint" "$OUT" "endpoint=https://api.kimi.com/coding/v1 "
check_missing "not the search service" "$OUT" "/v1/search"

# The banner must not contaminate the delegated answer.
ONLY_STDOUT=$(KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" bash "$SCRIPT" --via kimi -- "x" 2>/dev/null)
check_missing "the banner goes to stderr, not stdout" "$ONLY_STDOUT" "via=kimi"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
