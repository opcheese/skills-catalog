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
  env -u KIMI_API_KEY -u MOONSHOT_API_KEY \
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
check_contains "model defaults to k3.1-pro" "$OUT" '"ANTHROPIC_MODEL": "k3.1-pro"'
check_contains "apiKeyHelper is an absolute path" "$OUT" "/kimi-credential"
check_contains "the agent is forwarded" "$OUT" "--agent reviewer"
check_contains "the prompt is passed" "$OUT" "review this"
check_missing "text output needs no --verbose" "$OUT" "--verbose"

# claude -p refuses stream-json without --verbose, so passing it through
# unaltered would exit 1 before any work.
OUT=$(run --via claude --output stream-json -- "x")
check_contains "stream-json gets the --verbose claude requires" "$OUT" "--output-format stream-json --verbose"

cat > "$WORK/home/config.toml" <<'TOML'
[models."kimi-code/k3"]
model = "k3"
[models."kimi-code/k3.1-pro"]
model = "k3.1-pro"
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
check_contains "an unverifiable explicit model is refused" "$OUT" "no model list to check it against"
OUT=$(run --via claude -- "x")
check_contains "but the default still runs when the list is unreadable" "$OUT" "CLAUDE ARGV"

echo "Every run says what it ran on:"
cat > "$WORK/home/config.toml" <<'TOML'
[models."kimi-code/k3.1-pro"]
model = "k3.1-pro"
TOML
OUT=$(run --via claude -- "x")
check_contains "path B reports the model" "$OUT" "model=k3.1-pro"
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
[models."kimi-code/k3.1-pro"]
model = "k3.1-pro"
TOML
OUT=$(run --via kimi -- "x")
check_contains "path A reports the provider endpoint" "$OUT" "endpoint=https://api.kimi.com/coding/v1 "
check_missing "not the search service" "$OUT" "/v1/search"

echo "Two providers, one model name -- the account a run spends must be explicit:"
cat > "$WORK/home/config.toml" <<'TOML'
[providers."managed:kimi-code"]
base_url = "https://api.kimi.com/coding/v1"
[providers."managed:kimi-code".oauth]
storage = "file"
[providers.kimi-for-coding]
base_url = "https://api.kimi.com/coding"
api_key = "sk-fixture"
[models."kimi-code/k3"]
model = "k3"
[models."kimi-for-coding/k3"]
model = "k3"
TOML
OUT=$(KIMI_DELEGATE_MODEL=k3 run --via kimi -- "x" 2>&1 || true)
check_contains "a bare name offered by two providers is refused" "$OUT" "more than one provider"
check_contains "and both candidates are named" "$OUT" "kimi-for-coding/k3"
check_missing "and nothing is sent" "$OUT" "KIMI ARGV"

OUT=$(KIMI_DELEGATE_MODEL=kimi-for-coding/k3 run --via kimi -- "x")
check_contains "a key-bearing provider is reachable from path A" "$OUT" "auth=provider-api-key"
check_contains "and the qualified name reaches the wire" "$OUT" "-m kimi-for-coding/k3"
check_contains "and provenance reports its endpoint" "$OUT" "endpoint=https://api.kimi.com/coding "

OUT=$(KIMI_DELEGATE_MODEL=kimi-code/k3 run --via kimi -- "x")
check_contains "the oauth provider still reads as a subscription" "$OUT" "auth=subscription-token"
check_contains "and it too is sent qualified" "$OUT" "-m kimi-code/k3"

# The managed provider is keyed `managed:kimi-code` and its models are aliased
# `kimi-code/...`. Keying on the raw section name leaves it unfindable, and an
# unfindable provider reads as "no oauth" -- a subscription run reported as a
# key run, which is the one error nobody would question.
check_missing "a subscription run is never reported as a key run" "$OUT" "auth=provider-api-key"

# Restore the single-provider config the later cases assume. A fixture left
# behind is how a passing test starts asserting the previous test's world.
cat > "$WORK/home/config.toml" <<'TOML'
[providers."managed:kimi-code"]
base_url = "https://api.kimi.com/coding/v1"
[providers."managed:kimi-code".oauth]
storage = "file"
[models."kimi-code/k3.1-pro"]
model = "k3.1-pro"
TOML

# The banner must not contaminate the delegated answer.
ONLY_STDOUT=$(KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" bash "$SCRIPT" --via kimi -- "x" 2>/dev/null)
check_missing "the banner goes to stderr, not stdout" "$ONLY_STDOUT" "via=kimi"

echo "API-key mode (no Kimi CLI, no login):"
# A home with nothing in it and no CLI anywhere: the state of a machine that
# has an API key and has never run `kimi login`.
BARE="$WORK/bare"
mkdir -p "$BARE"
# Usage: run_bare VAR=value... -- <delegate args>
run_bare() {
  local assigns=()
  while [ "$1" != "--" ]; do assigns+=("$1"); shift; done
  shift
  env -u MOONSHOT_API_KEY -u KIMI_API_KEY \
    KIMI_CODE_HOME="$BARE" KIMI_BIN="$WORK/nonexistent-kimi" PATH="$BIN:$PATH" \
    "${assigns[@]}" bash "$SCRIPT" "$@" 2>&1
}

OUT=$(run_bare KIMI_API_KEY=sk-fixture-key -- --via claude -- "x")
check_contains "an API key runs path B with no CLI installed" "$OUT" "CLAUDE ARGV"
check_missing "and does not demand the CLI" "$OUT" "Kimi CLI not found"
check_missing "and does not demand a login" "$OUT" "no Kimi credentials"

# The key must never reach argv: /proc and ps expose every argument to any
# process on the box. It travels by environment to the credential helper.
check_missing "the key is not in the claude argv" "$OUT" "sk-fixture-key"
check_contains "the credential helper is still what supplies it" "$OUT" "/kimi-credential"

check_contains "provenance names the credential type" "$OUT" "auth=api-key"

OUT=$(run_bare MOONSHOT_API_KEY=sk-fixture-key -- --via claude -- "x")
check_contains "MOONSHOT_API_KEY is accepted too" "$OUT" "CLAUDE ARGV"

# An exported-but-empty variable is the shape a sourced .env leaves behind. It
# is not a credential, and must not switch the checks off.
OUT=$(run_bare KIMI_API_KEY= -- --via claude -- "x")
check_missing "an empty key does not count as one" "$OUT" "CLAUDE ARGV"
check_contains "an empty key falls back to the CLI checks" "$OUT" "Kimi CLI not found"

# Path A is Kimi's own agent system, authenticated by its own OAuth provider.
# An API key does not reach it, and saying so beats a puzzling login error.
OUT=$(run_bare KIMI_API_KEY=sk-fixture-key -- --via kimi -- "x")
check_missing "an API key does not run path A" "$OUT" "KIMI ARGV"
check_contains "and the refusal explains why" "$OUT" "--via kimi"

echo "The endpoint is overridable for keys issued elsewhere:"
OUT=$(run_bare KIMI_API_KEY=sk-fixture-key KIMI_DELEGATE_BASE_URL=https://api.moonshot.ai/anthropic -- --via claude -- "x")
check_contains "KIMI_DELEGATE_BASE_URL is honoured" "$OUT" '"ANTHROPIC_BASE_URL": "https://api.moonshot.ai/anthropic"'
check_contains "and is what provenance reports" "$OUT" "endpoint=https://api.moonshot.ai/anthropic"

echo "The model check when there is no model list to check against:"
OUT=$(run_bare KIMI_API_KEY=sk-fixture-key KIMI_DELEGATE_MODEL=k3-256k -- --via claude -- "x")
check_missing "an unverifiable model is still refused" "$OUT" "CLAUDE ARGV"
check_contains "and the refusal names the way through" "$OUT" "KIMI_DELEGATE_SKIP_MODEL_CHECK"

# The default is let through here rather than refused, because blocking it
# would break every delegation over a config we merely failed to parse. But
# "let through" is not "checked": on a key outside the coding plan, `k3` is a
# name Kimi answers HTTP 200 to and bills for while serving something else.
# The run must say so, or the provenance line claims more than it knows.
OUT=$(run_bare KIMI_API_KEY=sk-fixture-key -- --via claude -- "x")
check_contains "the default still runs when there is no list" "$OUT" "CLAUDE ARGV"
check_contains "but provenance does not pretend it was checked" "$OUT" "model=k3.1-pro (unverified)"

# The same default, on an install that does declare a model list, IS checked.
# The marker must not leak onto a run that earned its verification.
OUT=$(run --via claude -- "x")
check_missing "a verified default carries no marker" "$OUT" "unverified"

OUT=$(run_bare KIMI_API_KEY=sk-fixture-key KIMI_DELEGATE_MODEL=k3-256k KIMI_DELEGATE_SKIP_MODEL_CHECK=1 -- --via claude -- "x")
check_contains "the opt-out lets a deliberate choice through" "$OUT" "CLAUDE ARGV"
check_contains "and it reaches the wire" "$OUT" '"ANTHROPIC_MODEL": "k3-256k"'
check_contains "provenance marks it unverified" "$OUT" "unverified"

# The opt-out covers the unknowable case only. When the install does declare a
# model list, "not on it" is a positive answer and no flag may overrule it.
OUT=$(KIMI_DELEGATE_MODEL=not-a-model KIMI_DELEGATE_SKIP_MODEL_CHECK=1 run --via claude -- "x")
check_missing "the opt-out cannot overrule a real model list" "$OUT" "CLAUDE ARGV"
check_contains "which still refuses by name" "$OUT" "not a model this Kimi install offers"

# Without a key, nothing about the old route changes.
OUT=$(run --via claude -- "x")
check_contains "the subscription route still reports its credential type" "$OUT" "auth=subscription"


echo "1.3.0: the default model is k3.1-pro, not the double-quota k3:"
cat > "$WORK/home/config.toml" <<'TOML'
[providers."managed:kimi-code"]
base_url = "https://api.kimi.com/coding/v1"
[providers."managed:kimi-code".oauth]
storage = "file"
[providers.kimi-for-coding]
base_url = "https://api.kimi.com/coding"
api_key = "sk-fixture"
[models."kimi-code/k3"]
model = "k3"
[models."kimi-for-coding/k3"]
model = "k3"
[models."kimi-code/k3.1-pro"]
model = "k3.1-pro"
[models."kimi-for-coding/kimi-for-coding"]
model = "kimi-for-coding"
TOML
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "2.5.1"; exit 0; fi\necho "KIMI ARGV: $*"\nenv | grep -E "^KIMI_(CODE_NO_AUTO_UPDATE|DISABLE_TELEMETRY|CODE_INFINITE_RETRY|MODEL_THINKING_EFFORT)=" | sed "s/^/KIMI ENV: /"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"
OUT=$(run --via kimi -- "x")
check_contains "the default reaches the wire as k3.1-pro" "$OUT" "-m kimi-code/k3.1-pro"
check_missing "the default is not ambiguous when two providers offer k3" "$OUT" "more than one provider"

echo "1.3.0: a refused model says the list may be stale:"
OUT=$(KIMI_DELEGATE_MODEL=k9-new run --via kimi -- "x")
check_contains "the refusal names kimi login" "$OUT" "kimi login"
check_contains "and says imported providers are hand-written" "$OUT" "hand-written"

echo "1.3.0: provenance does not claim the served model:"
OUT=$(run --via kimi -- "x")
check_contains "provenance says the served model is unconfirmed" "$OUT" "served=unconfirmed"

echo "1.3.0: a safe environment on every run:"
OUT=$(KIMI_CODE_INFINITE_RETRY=1 run --via kimi -- "x")
check_contains "auto-update is off" "$OUT" "KIMI ENV: KIMI_CODE_NO_AUTO_UPDATE=1"
check_contains "telemetry is off" "$OUT" "KIMI ENV: KIMI_DISABLE_TELEMETRY=1"
check_missing "infinite retry is cleared" "$OUT" "KIMI_CODE_INFINITE_RETRY"

echo "1.3.0: a caller's own effort override is reported, never invented:"
OUT=$(KIMI_MODEL_THINKING_EFFORT=max run --via kimi -- "x")
check_contains "a caller-set effort is passed through" "$OUT" "KIMI ENV: KIMI_MODEL_THINKING_EFFORT=max"
check_contains "and provenance names it" "$OUT" "KIMI_MODEL_THINKING_EFFORT=max, kimi-type providers only"
OUT=$(run --via kimi -- "x")
check_missing "no effort is forced by default" "$OUT" "KIMI_MODEL_THINKING_EFFORT"
OUT=$(run --via kimi --effort max -- "x")
check_contains "there is no --effort flag" "$OUT" "unknown argument: --effort"

echo "1.3.0: --via claude never silently spends the wrong account:"
OUT=$(KIMI_DELEGATE_MODEL=kimi-for-coding/kimi-for-coding run --via claude -- "x")
check_contains "a key-bearing provider with --via claude is refused" "$OUT" "cannot spend the key of provider"
check_contains "and the refusal points at --via kimi" "$OUT" "--via kimi"
check_missing "and nothing runs" "$OUT" "CLAUDE ARGV"
OUT=$(env KIMI_API_KEY=sk-fixture-key KIMI_CODE_HOME="$WORK/home" KIMI_DELEGATE_MODEL=kimi-for-coding/kimi-for-coding PATH="$BIN:$PATH" bash "$SCRIPT" --via claude -- "x" 2>&1)
check_contains "with an env key it runs" "$OUT" "CLAUDE ARGV"
check_contains "but warns which key is spent" "$OUT" "spends KIMI_API_KEY"
OUT=$(KIMI_DELEGATE_MODEL=kimi-code/k3.1-pro run --via claude -- "x")
check_contains "the subscription provider still runs on path B" "$OUT" "CLAUDE ARGV"

echo "1.3.0: quota and rejected requests get their own exit codes:"
fake_fail() {
  # $1 = stream for the message (out|err), $2 = message
  local redir='>&2'; [ "$1" = out ] && redir=''
  printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "2.5.1"; exit 0; fi\necho "• thinking about it" >&2\neval "printf \\"%%s\\\\n\\" \\"$FAKE_MSG\\" %s"\nexit 1\n' "$redir" > "$BIN/kimi"
  chmod +x "$BIN/kimi"
}
fake_fail err
OUT=$(FAKE_MSG="error: failed to run prompt: provider.api_error: You've reached your 5-hour usage limit. Your quota will reset when the current 5-hour window ends." run --via kimi -- "x"); RC=$?
check_contains "a 5-hour limit exits 75" "rc=$RC" "rc=75"
check_contains "with one parsable line" "$OUT" "kimi-delegate: quota-exhausted window=5-hour reset=window-end"
check_contains "and the reason still shows" "$OUT" "5-hour usage limit"
OUT=$(FAKE_MSG="error: failed to run prompt: provider.api_error: You've reached your weekly (7-day) usage limit." run --via kimi -- "x"); RC=$?
check_contains "a weekly limit exits 75" "rc=$RC" "rc=75"
check_contains "and names the weekly window" "$OUT" "window=weekly"
fake_fail out
OUT=$(FAKE_MSG="API Error: Request rejected (429) · You've reached your 5-hour usage limit." run --via kimi -- "x"); RC=$?
check_contains "a 429 on stdout (path B's shape) is caught too" "rc=$RC" "rc=75"
fake_fail err
OUT=$(FAKE_MSG="error: failed to run prompt: provider.api_error: Invalid request: tokenization failed" run --via kimi -- "x"); RC=$?
check_contains "a rejected request exits 65" "rc=$RC" "rc=65"
check_contains "with a parsable line" "$OUT" "kimi-delegate: request-rejected reason="
check_contains "and a hint to shrink the input" "$OUT" "smaller"
check_contains "and the partial reasoning still reached stderr" "$OUT" "thinking about it"
OUT=$(FAKE_MSG="something else broke" run --via kimi -- "x"); RC=$?
check_contains "any other failure keeps the child's exit code" "rc=$RC" "rc=1"
check_missing "and is not labelled" "$OUT" "quota-exhausted"

echo "1.3.0: --final-only prints only the final answer:"
cat > "$BIN/kimi" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "2.5.1"; exit 0; fi
case "$*" in *"--output-format stream-json"*) ;; *) echo "• not stream-json: $*"; exit 0 ;; esac
echo '{"role":"meta","type":"system.version","version":"2.5.1"}'
echo '{"role":"assistant","content":"I will read the files first."}'
echo '{"role":"assistant","content":[{"type":"text","text":"# Verdict\nCLEAN"}]}'
echo '{"role":"meta","type":"session.resume_hint","content":"To resume"}'
EOF
chmod +x "$BIN/kimi"
ONLY=$(KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" bash "$SCRIPT" --via kimi --final-only -- "x" 2>/dev/null)
check_contains "the last assistant message is printed" "$ONLY" "# Verdict"
check_missing "progress chatter is dropped" "$ONLY" "read the files first"
check_missing "meta lines are dropped" "$ONLY" "resume"
check_missing "no bullet prefix" "$ONLY" "•"
OUT=$(run --via kimi --final-only --output stream-json -- "x")
check_contains "--final-only with --output stream-json is refused" "$OUT" "--final-only"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
