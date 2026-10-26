#!/usr/bin/env bash
# Tests for credits-delegate. Hermetic: a fake claude on PATH records its argv,
# the environment it was given, and what its apiKeyHelper prints, so we assert
# on what would have run without spending anything.

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)"
SCRIPT="$DIR/credits-delegate"
PASS=0
FAIL=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BIN="$WORK/bin"
mkdir -p "$BIN" "$WORK/cfg/claude-credits"
KEYFILE="$WORK/cfg/claude-credits/key"
FIXTURE_KEY="sk-ant-fixture-0123456789abcdef"
(umask 077; printf '%s\n' "$FIXTURE_KEY" > "$KEYFILE")

# The fake claude: prints argv, the credential-bearing env it sees, and runs
# the apiKeyHelper from --settings the way Claude Code would.
cat > "$BIN/claude" <<'FAKE'
#!/usr/bin/env bash
printf 'CLAUDE ARGV: %s\n' "$*" >&2
for v in ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_BASE_URL CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY; do
  if [ -n "${!v+x}" ]; then printf 'ENV %s=%s\n' "$v" "${!v}" >&2; fi
done
settings=""
while [ $# -gt 0 ]; do
  [ "$1" = "--settings" ] && settings="$2"
  shift
done
helper=$(printf '%s' "$settings" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("apiKeyHelper",""))')
key=$(bash -c "$helper" 2>"$FAKE_DIR/helper.err"); rc=$?
printf 'HELPER rc=%s key=%s\n' "$rc" "$key" >&2
printf '%s' "$settings" > "$FAKE_DIR/settings.json"
default='{"type":"result","is_error":false,"result":"pong","total_cost_usd":0.0024,"modelUsage":{"claude-haiku-5-5":{}}}'
printf '%s\n' "${FAKE_RESULT:-$default}"
exit "${FAKE_RC:-0}"
FAKE
chmod +x "$BIN/claude"


# The fake curl: the preflight's view of the key. Records argv and the header
# file it was handed, and answers with FAKE_HTTP (default 200).
cat > "$BIN/curl" <<'FAKE'
#!/usr/bin/env bash
printf 'CURL ARGV: %s\n' "$*" >> "$FAKE_DIR/curl.log"
prev=""
for a in "$@"; do
  if [ "$prev" = "-H" ] && [ "${a#@}" != "$a" ]; then cat "${a#@}" >> "$FAKE_DIR/curl.log"; fi
  prev="$a"
done
printf '%s' "${FAKE_HTTP:-200}"
FAKE
chmod +x "$BIN/curl"

run() {
  env -u CREDITS_DELEGATE_DEPTH FAKE_DIR="$WORK" CLAUDE_CREDITS_KEY_FILE="$KEYFILE" \
    PATH="$BIN:$PATH" bash "$SCRIPT" "$@" 2>&1
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

echo "The credential:"
OUT=$(run -- "say pong")
check_contains "the helper hands the key file's key to the session" "$OUT" "HELPER rc=0 key=$FIXTURE_KEY"
check_missing "the key is never on the command line" "$(printf '%s\n' "$OUT" | grep 'CLAUDE ARGV')" "$FIXTURE_KEY"
check_missing "the key is never in the session's environment" "$(printf '%s\n' "$OUT" | grep '^ENV')" "$FIXTURE_KEY"

OUT=$(ANTHROPIC_API_KEY=sk-ant-inherited ANTHROPIC_AUTH_TOKEN=tok ANTHROPIC_BASE_URL=https://elsewhere.example \
      CLAUDE_CODE_OAUTH_TOKEN=oauth CLAUDE_CODE_USE_BEDROCK=1 CLAUDE_CODE_USE_VERTEX=1 CLAUDE_CODE_USE_FOUNDRY=1 run -- "x")
check_missing "an inherited API key does not reach the session" "$OUT" "sk-ant-inherited"
check_missing "an inherited bearer token does not reach the session" "$OUT" "ENV ANTHROPIC_AUTH_TOKEN=tok"
check_missing "an inherited base URL does not carry the key elsewhere" "$OUT" "elsewhere.example"
check_missing "an inherited OAuth token does not reach the session" "$OUT" "ENV CLAUDE_CODE_OAUTH_TOKEN=oauth"
check_missing "a cloud-provider switch does not reach the session" "$OUT" "CLAUDE_CODE_USE_BEDROCK=1"
check_contains "the settings blank the outranking credentials too" "$(cat "$WORK/settings.json")" '"ANTHROPIC_API_KEY": ""'

OUT=$(env -u CREDITS_DELEGATE_DEPTH FAKE_DIR="$WORK" CLAUDE_CREDITS_KEY_FILE="$WORK/nope" PATH="$BIN:$PATH" bash "$SCRIPT" -- "x" 2>&1)
check_contains "a missing key file is refused by name" "$OUT" "$WORK/nope"
check_missing "a missing key file never starts a session" "$OUT" "CLAUDE ARGV"

: > "$WORK/empty"; chmod 600 "$WORK/empty"
OUT=$(env -u CREDITS_DELEGATE_DEPTH FAKE_DIR="$WORK" CLAUDE_CREDITS_KEY_FILE="$WORK/empty" PATH="$BIN:$PATH" bash "$SCRIPT" -- "x" 2>&1)
check_contains "an empty key file is refused" "$OUT" "empty"
check_missing "an empty key file never starts a session" "$OUT" "CLAUDE ARGV"

cp "$KEYFILE" "$WORK/open"; chmod 644 "$WORK/open"
OUT=$(env -u CREDITS_DELEGATE_DEPTH FAKE_DIR="$WORK" CLAUDE_CREDITS_KEY_FILE="$WORK/open" PATH="$BIN:$PATH" bash "$SCRIPT" -- "x" 2>&1)
check_contains "a key file others can read is refused" "$OUT" "chmod 600"
check_missing "a readable key file never starts a session" "$OUT" "CLAUDE ARGV"

OUT=$(bash "$DIR/credits-key" "$WORK/nope" 2>&1); rc=$?
check_contains "the helper fails loudly when the key goes missing mid-run" "rc=$rc $OUT" "rc=1"

echo "The run:"
OUT=$(run -- "say pong")
check_contains "the default model is haiku" "$OUT" "--model haiku"
check_contains "every run has a spend cap" "$OUT" "--max-budget-usd 1"
check_contains "the prompt is passed" "$OUT" "say pong"
check_contains "text output prints the answer" "$OUT" "pong"
check_contains "and the cost, on stderr" "$OUT" "cost_usd=0.0024"
check_contains "provenance names the credential route" "$OUT" "auth=api-credits"

OUT=$(run --model sonnet --budget 0.25 --agent my-reviewer -- "x")
check_contains "a chosen model is forwarded" "$OUT" "--model sonnet"
check_contains "a chosen budget is forwarded" "$OUT" "--max-budget-usd 0.25"
check_contains "a chosen agent is forwarded" "$OUT" "--agent my-reviewer"

OUT=$(run --budget lots -- "x")
check_contains "a non-numeric budget is refused" "$OUT" "budget"
check_missing "a non-numeric budget never starts a session" "$OUT" "CLAUDE ARGV"

OUT=$(run --output stream-json -- "x")
check_contains "stream-json adds the --verbose claude -p needs" "$OUT" "--output-format stream-json --verbose"

OUT=$(run --output json -- "x")
check_contains "json is passed through untouched" "$OUT" '"total_cost_usd":0.0024'

OUT=$(FAKE_RESULT='{"type":"result","is_error":true,"result":"Credit balance too low","total_cost_usd":0}' run -- "x"); rc=$?
check_contains "an API error is reported" "$OUT" "Credit balance too low"
check_contains "and fails the run" "rc=$rc" "rc=1"



OUT=$(run -- "x")
check_missing "bare mode is off by default" "$OUT" "--bare"
OUT=$(run --bare -- "x")
check_contains "--bare is forwarded" "$(printf '%s\n' "$OUT" | grep "CLAUDE ARGV")" "--bare"
check_contains "and keeps the key helper, which bare mode still reads from --settings" "$OUT" "apiKeyHelper"

echo "The preflight:"
: > "$WORK/curl.log"
OUT=$(run -- "x")
check_contains "the key is checked against the API before the run" "$(cat "$WORK/curl.log")" "/v1/models"
check_contains "the preflight sends the key in a header" "$(cat "$WORK/curl.log")" "x-api-key: $FIXTURE_KEY"
check_missing "the preflight never puts the key on curl's command line" "$(grep 'CURL ARGV' "$WORK/curl.log")" "$FIXTURE_KEY"

OUT=$(FAKE_HTTP=401 run -- "x")
check_contains "a rejected key is refused, because claude -p hangs on one" "$OUT" "rejected"
check_missing "a rejected key never starts a session" "$OUT" "CLAUDE ARGV"

OUT=$(FAKE_HTTP=000 run -- "x")
check_contains "an unreachable API is reported" "$OUT" "could not reach"
check_missing "an unreachable API never starts a session" "$OUT" "CLAUDE ARGV"


OUT=$(FAKE_RESULT='{"type":"result","subtype":"error_max_budget_usd","is_error":true,"total_cost_usd":0.0023,"errors":["Reached maximum budget ($0.001)"]}' run -- "x"); rc=$?
check_contains "a run stopped by the budget says so" "$OUT" "Reached maximum budget"
check_contains "and reports what it spent past the cap" "$OUT" "cost_usd=0.0023"
check_contains "and fails" "rc=$rc" "rc=1"

echo "Refusals:"
OUT=$(run --dangerously-skip-permissions -- "x")
check_contains "skip-permissions is refused" "$OUT" "refusing"
check_missing "skip-permissions never reaches the CLI" "$OUT" "CLAUDE ARGV"

OUT=$(CREDITS_DELEGATE_DEPTH=1 FAKE_DIR="$WORK" CLAUDE_CREDITS_KEY_FILE="$KEYFILE" PATH="$BIN:$PATH" bash "$SCRIPT" -- "x" 2>&1)
check_contains "nesting is refused" "$OUT" "already in progress"
check_missing "nesting never reaches the CLI" "$OUT" "CLAUDE ARGV"

OUT=$(timeout 5 bash -c "FAKE_DIR='$WORK' CLAUDE_CREDITS_KEY_FILE='$KEYFILE' PATH='$BIN:$PATH' bash '$SCRIPT' --model" 2>&1); rc=$?
check_contains "a flag with no value is refused, not looped on" "rc=$rc $OUT" "missing value"

OUT=$(run "no separator")
check_contains "an argument before -- is refused" "$OUT" "unknown argument"

OUT=$(run --)
check_contains "an empty prompt is refused" "$OUT" "prompt is required"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
