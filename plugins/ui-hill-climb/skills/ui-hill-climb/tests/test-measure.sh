#!/usr/bin/env bash
# Tests for hill-propose. Hermetic: a fake kimi-delegate prints canned answers.

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)"
PROPOSE="$DIR/hill-propose"
PASS=0
FAIL=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

ok()   { PASS=$((PASS+1)); echo "  [ok]   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  [FAIL] $1"; [ -n "${2:-}" ] && echo "         got: ${2:0:400}"; }
check_contains() { case "$2" in *"$3"*) ok "$1" ;; *) bad "$1" "$2" ;; esac; }
check_missing()  { case "$2" in *"$3"*) bad "$1" "$2" ;; *) ok "$1" ;; esac; }
check_eq()       { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2 (want $3)"; }

# Fake delegate: logs argv and env, then prints the answer file named by FAKE_ANSWER
# (one answer per call, consumed in order from FAKE_ANSWER.1, .2, ...).
FAKE="$WORK/fake-delegate"
cat > "$FAKE" <<'EOF'
#!/usr/bin/env bash
n=$(( $(cat "$FAKE_STATE" 2>/dev/null || echo 0) + 1 )); echo $n > "$FAKE_STATE"
{ echo "CALL $n"; echo "MODEL=$KIMI_DELEGATE_MODEL"; printf 'ARG %s\n' "$@"; } >> "$FAKE_LOG"
echo "kimi-delegate: via=kimi model=$KIMI_DELEGATE_MODEL served=unconfirmed agent=delegate-readonly (pinned file)" >&2
f="$FAKE_ANSWER.$n"; [ -f "$f" ] || f="$FAKE_ANSWER"
cat "$f"; exit "$(cat "$f.exit" 2>/dev/null || echo 0)"
EOF
chmod +x "$FAKE"

reset() { rm -f "$WORK"/state "$WORK"/log "$WORK"/ans* "$WORK"/stderr; export FAKE_STATE="$WORK/state" FAKE_LOG="$WORK/log" FAKE_ANSWER="$WORK/ans"; }
propose() { HILL_KIMI_DELEGATE="$FAKE" "$PROPOSE" "$@" 2>"$WORK/stderr"; }

INPUT='{"design":{"nodeId":"1:1","name":"Card"},"dom":{"selector":"#card"}}'
GOOD='Here is the proposal.
{"pairs":[{"nodeId":"1:1","selector":"#card"},{"nodeId":"1:2","selector":"#card > :nth-child(1)"}],"unmapped":{"design":["1:3"],"impl":["#footer"]}}'
EXPECTED='{"pairs":[{"nodeId":"1:1","selector":"#card"},{"nodeId":"1:2","selector":"#card > :nth-child(1)"}],"unmapped":{"design":["1:3"],"impl":["#footer"]}}'
canonical() { python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1]),sort_keys=True,separators=(",",":")))' "$1"; }

echo "hill-propose: a good answer"
reset; echo "$GOOD" > "$WORK/ans"
OUT=$(printf '%s' "$INPUT" | propose); RC=$?
check_eq "exits 0" "$RC" "0"
check_eq "stdout parses to the same proposal" "$(canonical "$OUT")" "$(canonical "$EXPECTED")"
LOG="$(cat "$WORK/log")"
check_contains "uses the kimi path" "$LOG" "ARG --via"
check_contains "passes kimi to --via" "$LOG" "ARG kimi"
check_contains "asks for the final answer only" "$LOG" "ARG --final-only"
check_contains "uses kimi k3.1-pro by default" "$LOG" "MODEL=kimi-code/k3.1-pro"

echo "hill-propose: saves when asked"
reset; echo "$GOOD" > "$WORK/ans"
OUT=$(printf '%s' "$INPUT" | HILL_PROPOSAL_OUT="$WORK/p.json" propose); RC=$?
check_eq "exits 0" "$RC" "0"
check_eq "saved proposal equals stdout" "$(cat "$WORK/p.json")" "$OUT"
check_eq "saved status is 0" "$(cat "$WORK/p.json.status")" "0"

echo "hill-propose: unusable twice"
reset; echo "No proposal here." > "$WORK/ans"
OUT=$(printf '%s' "$INPUT" | HILL_PROPOSAL_OUT="$WORK/unusable.json" propose); RC=$?
check_eq "exits 3" "$RC" "3"
check_eq "tries twice" "$(grep -c '^CALL' "$WORK/log")" "2"
check_eq "saved status is 3" "$(cat "$WORK/unusable.json.status")" "3"

echo "hill-propose: quota"
reset; echo "" > "$WORK/ans"; echo 75 > "$WORK/ans.exit"
OUT=$(printf '%s' "$INPUT" | HILL_PROPOSAL_OUT="$WORK/quota.json" propose); RC=$?
check_eq "exit 75 propagates" "$RC" "75"
check_eq "saved status is 75" "$(cat "$WORK/quota.json.status")" "75"

echo "hill-propose: bad stdin"
for BAD in 'not JSON' '{"dom":{}}' '{"design":{}}'; do
  reset; echo "$GOOD" > "$WORK/ans"
  OUT=$(printf '%s' "$BAD" | propose); RC=$?
  check_eq "invalid input exits 2: $BAD" "$RC" "2"
  check_eq "invalid input makes no delegate call: $BAD" "$(cat "$WORK/state" 2>/dev/null || echo 0)" "0"
done

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
