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

echo "scripts: shared-library import bootstrap"
for SCRIPT in "$DIR/hill-judge" "$PROPOSE" "$DIR/hill-measure"; do
  BOOTSTRAP=$(python3 - "$SCRIPT" <<'PY'
import sys
source = open(sys.argv[1]).read()
insert = "sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))"
try:
    present = source.index(insert) < source.index("from hilllib import ")
except ValueError:
    present = False
print("yes" if present else "no")
PY
)
  check_eq "$(basename "$SCRIPT") inserts its script directory before hilllib" "$BOOTSTRAP" "yes"
done

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

echo "hill-propose: nonexistent delegate"
reset
OUT=$(printf '%s' "$INPUT" | HILL_KIMI_DELEGATE="$WORK/no-such-delegate" HILL_PROPOSAL_OUT="$WORK/missing.json" "$PROPOSE" 2>"$WORK/stderr"); RC=$?
check_eq "launch failure exits 3" "$RC" "3"
check_eq "launch failure saves status 3" "$(cat "$WORK/missing.json.status" 2>/dev/null)" "3"
check_contains "launch failure is reported" "$(cat "$WORK/stderr")" "hill-propose:"
check_missing "launch failure has no traceback" "$(cat "$WORK/stderr")" "Traceback"

echo "hill-propose: bad stdin"
for BAD in 'not JSON' '{"dom":{}}' '{"design":{}}'; do
  reset; echo "$GOOD" > "$WORK/ans"
  OUT=$(printf '%s' "$BAD" | propose); RC=$?
  check_eq "invalid input exits 2: $BAD" "$RC" "2"
  check_eq "invalid input makes no delegate call: $BAD" "$(cat "$WORK/state" 2>/dev/null || echo 0)" "0"
done

# ---------------------------------------------------------------------------
# hill-measure uses a fake ui-measure CLI and a fake command proposer.
MEASURE="$DIR/hill-measure"
UM_WORK="$WORK/measure"
mkdir -p "$UM_WORK"

STUB_UM="$WORK/stub-um"
cat > "$STUB_UM" <<'EOF'
#!/usr/bin/env bash
check=$1
n=$(( $(cat "$STUB_STATE.$check" 2>/dev/null || echo 0) + 1 )); echo $n > "$STUB_STATE.$check"
{
  echo "CALL $n $check"
  echo "HILL_PROPOSAL_OUT=${HILL_PROPOSAL_OUT-}"
  printf 'ARG %s\n' "$@"
} >> "$STUB_STATE.log"
args=("$@")
if [ -n "${STUB_SETUP_FAIL:-}" ] && [ "$check" = spec ]; then echo "stub ui-measure setup failure" >&2; exit 3; fi
json=""
for ((i=0; i<${#args[@]}; i++)); do
  if [ "${args[$i]}" = "--json" ]; then json=${args[$((i+1))]}; fi
  if [ "${args[$i]}" = "--proposer" ] && [ "${args[$((i+1))]}" = "command" ]; then
    if ! printf '%s' '{"design":{"nodeId":"1:1"},"dom":{"selector":"#card"}}' | "${args[@]:$((i+3))}"; then
      exit 3
    fi
  fi
done
report_var="STUB_REPORT_$check"
if [ "$n" -gt 1 ]; then
  later="${report_var}_$n"
  if [ -n "${!later:-}" ]; then report_var=$later; fi
fi
if [ -n "${!report_var:-}" ]; then cp "${!report_var}" "$json"; fi
exit_var="STUB_EXIT_$check"
if [ "$n" -gt 1 ]; then
  later_exit="${exit_var}_$n"
  if [ -n "${!later_exit:-}" ]; then exit_var=$later_exit; fi
fi
if [ "${!exit_var:-0}" = "3" ]; then echo "stub ui-measure setup failure" >&2; fi
exit "${!exit_var:-0}"
EOF
chmod +x "$STUB_UM"

STUB_PROP="$WORK/stub-propose"
cat > "$STUB_PROP" <<'EOF'
#!/usr/bin/env python3
import os
import shutil
import sys
out = os.environ["HILL_PROPOSAL_OUT"]
shutil.copyfile(os.environ["STUB_PROPOSAL"], out)
status = int(os.environ.get("STUB_PROPOSER_STATUS", "0"))
with open(out + ".status", "w") as f:
    f.write(f"{status}\n")
sys.exit(status)
EOF
chmod +x "$STUB_PROP"

reset_um() {
  rm -rf "$UM_WORK"
  mkdir -p "$UM_WORK/empty-home"
  export STUB_STATE="$UM_WORK/state"
  export STUB_REPORT_geometry="$UM_WORK/geometry.json"
  export STUB_REPORT_spec="$UM_WORK/spec.json"
  export STUB_PROPOSAL="$UM_WORK/fresh-proposal.json"
  unset STUB_SETUP_FAIL STUB_REPORT_spec_2 STUB_EXIT_geometry STUB_EXIT_spec STUB_EXIT_spec_2 STUB_PROPOSER_STATUS
  printf '%s\n' '{"coverage":{"dropped":0},"marker":"geometry"}' > "$STUB_REPORT_geometry"
  printf '%s\n' '{"coverage":{"dropped":0},"marker":"spec"}' > "$STUB_REPORT_spec"
  printf '%s\n' '{"proposal":"fresh"}' > "$STUB_PROPOSAL"
}

new_measure_run() {
  reset_um
  RUN="$UM_WORK/run"
  mkdir -p "$RUN/round-1"
  printf '%s\n' '{}' > "$UM_WORK/ui-measure.config.json"
  printf '%s\n' '{"nodeId":"1:1"}' > "$UM_WORK/node.json"
  printf '%s\n' '{"proposal":"manifest"}' > "$UM_WORK/manifest-proposal.json"
  printf '%s\n' 'fake png' > "$RUN/round-1/home.png"
  python3 - "$RUN/measure.json" "$UM_WORK/ui-measure.config.json" <<'PY'
import json, sys
json.dump({"config":sys.argv[2], "screens":{"home":{"target":"home"}}}, open(sys.argv[1], "w"))
PY
}

new_spec_run() {
  new_measure_run
  rm "$RUN/round-1/home.png"
  printf '%s\n' 'fake png' > "$RUN/round-1/card.png"
  python3 - "$RUN/measure.json" "$UM_WORK/ui-measure.config.json" "$UM_WORK/node.json" <<'PY'
import json, sys
json.dump({"config":sys.argv[2], "screens":{"card":{"target":"card", "node":sys.argv[3]}}}, open(sys.argv[1], "w"))
PY
}

measure() {
  HILL_UI_MEASURE="$STUB_UM" HILL_PROPOSE="$STUB_PROP" "$MEASURE" "$@"
}

echo "hill-measure: geometry only"
new_measure_run
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
LOG=$(cat "$STUB_STATE.log" 2>/dev/null)
check_eq "exits 0" "$RC" "0"
check_eq "one geometry call" "$(grep -c '^CALL .* geometry' "$STUB_STATE.log")" "1"
check_eq "no spec call" "$(grep -c '^CALL .* spec' "$STUB_STATE.log" 2>/dev/null)" "0"
check_contains "passes the config" "$LOG" "ARG $UM_WORK/ui-measure.config.json"
check_contains "passes the target" "$LOG" "ARG home"
check_contains "writes the geometry report" "$LOG" "ARG $RUN/round-1/home.geometry.json"

echo "hill-measure: ui-measure exits 1 and 2 are data"
for STATUS in 1 2; do
  new_measure_run; export STUB_EXIT_geometry=$STATUS
  OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
  check_eq "ui-measure exit $STATUS becomes 0" "$RC" "0"
  check_eq "exit $STATUS still writes the report" "$(cat "$RUN/round-1/home.geometry.json")" "$(cat "$STUB_REPORT_geometry")"
done

echo "hill-measure: setup error"
new_measure_run; export STUB_EXIT_geometry=3
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
check_eq "ui-measure exit 3 passes through" "$RC" "3"
check_contains "prints ui-measure stderr" "$OUT" "stub ui-measure setup failure"

echo "hill-measure: not installed"
new_measure_run
OUT=$(env -u HILL_UI_MEASURE HOME="$UM_WORK/empty-home" HILL_PROPOSE="$STUB_PROP" "$MEASURE" --run "$RUN" --round 1 2>&1); RC=$?
check_eq "missing ui-measure exits 2" "$RC" "2"
check_contains "missing ui-measure gives the install hint" "$OUT" "install the ui-measure plugin, or set HILL_UI_MEASURE"

echo "hill-measure: spec, fresh proposal"
new_spec_run
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
LOG=$(cat "$STUB_STATE.log" 2>/dev/null)
check_eq "fresh spec exits 0" "$RC" "0"
check_contains "passes the node" "$LOG" "ARG $UM_WORK/node.json"
check_contains "uses a command proposer" "$LOG" $'ARG --proposer\nARG command'
check_contains "invokes hill-propose with python3" "$LOG" $'ARG python3\nARG '"$STUB_PROP"
check_contains "sets the proposal output" "$LOG" "HILL_PROPOSAL_OUT=$RUN/round-1/card.proposal.json"
check_eq "saves the fresh proposal" "$(cat "$RUN/round-1/card.proposal.json")" "$(cat "$STUB_PROPOSAL")"

echo "hill-measure: spec, earlier proposal reuse"
new_spec_run
printf '%s\n' '{"proposal":"old"}' > "$RUN/round-1/card.proposal.json"
printf '%s\n' '{"coverage":{"dropped":0},"marker":"old"}' > "$RUN/round-1/card.spec.json"
mkdir -p "$RUN/round-2"; printf '%s\n' 'fake png' > "$RUN/round-2/card.png"
OUT=$(measure --run "$RUN" --round 2 2>&1); RC=$?
LOG=$(cat "$STUB_STATE.log" 2>/dev/null)
check_eq "reused spec exits 0" "$RC" "0"
check_contains "uses the recorded proposer" "$LOG" $'ARG --proposer\nARG recorded'
check_contains "passes the earlier proposal" "$LOG" "ARG $RUN/round-1/card.proposal.json"
check_eq "copies the earlier proposal into round 2" "$(cat "$RUN/round-2/card.proposal.json")" '{"proposal":"old"}'
check_eq "does not re-propose when drops stay level" "$(grep -c '^CALL .* spec' "$STUB_STATE.log")" "1"

echo "hill-measure: spec, manifest proposal"
new_spec_run
python3 - "$RUN/measure.json" "$UM_WORK/manifest-proposal.json" <<'PY'
import json, sys
p=sys.argv[1]; data=json.load(open(p)); data["screens"]["card"]["proposal"]=sys.argv[2]
json.dump(data, open(p, "w"))
PY
printf '%s\n' '{"coverage":{"dropped":2},"marker":"manifest"}' > "$STUB_REPORT_spec"
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
LOG=$(cat "$STUB_STATE.log" 2>/dev/null)
check_eq "manifest proposal exits 0" "$RC" "0"
check_contains "uses the manifest proposal" "$LOG" "ARG $UM_WORK/manifest-proposal.json"
check_contains "manifest proposal is recorded" "$LOG" "ARG recorded"
check_eq "manifest drops never trigger a fresh proposal" "$(grep -c '^CALL .* spec' "$STUB_STATE.log")" "1"

echo "hill-measure: re-propose on drops"
for ORDER in better worse; do
  new_spec_run
  printf '%s\n' '{"proposal":"old"}' > "$RUN/round-1/card.proposal.json"
  printf '%s\n' '{"coverage":{"dropped":0},"marker":"old"}' > "$RUN/round-1/card.spec.json"
  mkdir -p "$RUN/round-2"; printf '%s\n' 'fake png' > "$RUN/round-2/card.png"
  printf '%s\n' '{"coverage":{"dropped":2},"marker":"reused"}' > "$STUB_REPORT_spec"
  export STUB_REPORT_spec_2="$UM_WORK/retry.json"
  if [ "$ORDER" = better ]; then DROPS=0; else DROPS=3; fi
  printf '{"coverage":{"dropped":%s},"marker":"fresh"}\n' "$DROPS" > "$STUB_REPORT_spec_2"
  OUT=$(measure --run "$RUN" --round 2 2>&1); RC=$?
  check_eq "$ORDER retry exits 0" "$RC" "0"
  check_eq "$ORDER retry makes a second spec call" "$(grep -c '^CALL .* spec' "$STUB_STATE.log")" "2"
  if [ "$ORDER" = better ]; then WANT_MARKER=fresh; WANT_PROPOSAL=fresh; else WANT_MARKER=reused; WANT_PROPOSAL=old; fi
  check_contains "$ORDER retry keeps the winning report" "$(cat "$RUN/round-2/card.spec.json")" "\"marker\":\"$WANT_MARKER\""
  check_eq "$ORDER retry keeps the winning proposal" "$(cat "$RUN/round-2/card.proposal.json")" "{\"proposal\":\"$WANT_PROPOSAL\"}"
done

add_pairs_file() {  # $1 = JSON body of <config dir>/.ui-measure/pairs/card.json
  mkdir -p "$UM_WORK/.ui-measure/pairs"
  printf '%s\n' "$1" > "$UM_WORK/.ui-measure/pairs/card.json"
}

echo "hill-measure: round 1 uses the default pairs file"
new_spec_run
add_pairs_file '{"pairs":[{"nodeId":"1:1","selector":"#card"}],"marker":"pairs"}'
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
LOG=$(cat "$STUB_STATE.log" 2>/dev/null)
check_eq "pairs file exits 0" "$RC" "0"
check_contains "uses the recorded proposer" "$LOG" $'ARG --proposer\nARG recorded'
check_contains "passes the pairs file" "$LOG" "ARG $UM_WORK/.ui-measure/pairs/card.json"
check_missing "does not use a command proposer" "$LOG" $'ARG --proposer\nARG command'
check_eq "saved round proposal equals the pairs file" "$(cat "$RUN/round-1/card.proposal.json")" "$(cat "$UM_WORK/.ui-measure/pairs/card.json")"
check_eq "pairs file makes no hill-propose call" "$(grep -c 'stub-propose' "$STUB_STATE.log")" "0"

echo "hill-measure: manifest proposal beats the pairs file"
new_spec_run
add_pairs_file '{"pairs":[],"marker":"pairs"}'
python3 - "$RUN/measure.json" "$UM_WORK/manifest-proposal.json" <<'PY'
import json, sys
p=sys.argv[1]; data=json.load(open(p)); data["screens"]["card"]["proposal"]=sys.argv[2]
json.dump(data, open(p, "w"))
PY
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
LOG=$(cat "$STUB_STATE.log" 2>/dev/null)
check_eq "manifest over pairs exits 0" "$RC" "0"
check_contains "uses the manifest proposal" "$LOG" "ARG $UM_WORK/manifest-proposal.json"
check_missing "does not use the pairs file" "$LOG" "ARG $UM_WORK/.ui-measure/pairs/card.json"

echo "hill-measure: earlier round beats the pairs file"
new_spec_run
add_pairs_file '{"pairs":[],"marker":"pairs"}'
printf '%s\n' '{"proposal":"old"}' > "$RUN/round-1/card.proposal.json"
printf '%s\n' '{"coverage":{"dropped":0},"marker":"old"}' > "$RUN/round-1/card.spec.json"
mkdir -p "$RUN/round-2"; printf '%s\n' 'fake png' > "$RUN/round-2/card.png"
OUT=$(measure --run "$RUN" --round 2 2>&1); RC=$?
LOG=$(cat "$STUB_STATE.log" 2>/dev/null)
check_contains "uses the earlier proposal" "$LOG" "ARG $RUN/round-1/card.proposal.json"
check_missing "does not use the pairs file" "$LOG" "ARG $UM_WORK/.ui-measure/pairs/card.json"

echo "hill-measure: authoritative proposal is not re-proposed when drops rise"
for SOURCE in pairs earlier; do
  new_spec_run
  mkdir -p "$RUN/round-2"; printf '%s\n' 'fake png' > "$RUN/round-2/card.png"
  printf '%s\n' '{"coverage":{"dropped":2},"marker":"reused"}' > "$STUB_REPORT_spec"
  if [ "$SOURCE" = pairs ]; then
    add_pairs_file '{"pairs":[],"authoritative":true}'
    ROUND=1
  else
    printf '%s\n' '{"pairs":[],"authoritative":true}' > "$RUN/round-1/card.proposal.json"
    printf '%s\n' '{"coverage":{"dropped":0},"marker":"old"}' > "$RUN/round-1/card.spec.json"
    ROUND=2
  fi
  OUT=$(measure --run "$RUN" --round $ROUND 2>&1); RC=$?
  check_eq "$SOURCE: authoritative exits 0" "$RC" "0"
  check_eq "$SOURCE: authoritative makes one spec call" "$(grep -c '^CALL .* spec' "$STUB_STATE.log")" "1"
  check_missing "$SOURCE: authoritative never calls hill-propose" "$(cat "$STUB_STATE.log")" "stub-propose"
  if [ "$SOURCE" = earlier ]; then check_contains "earlier: the drop is reported" "$OUT" "authoritative"; fi
done

echo "hill-measure: a non-authoritative pairs file still follows the 0.2 path with no file"
new_spec_run
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
check_contains "no pairs file proposes fresh" "$(cat "$STUB_STATE.log")" $'ARG --proposer\nARG command'

echo "hill-measure: spec exits 1 and 2 are data"
for STATUS in 1 2; do
  new_spec_run; export STUB_EXIT_spec=$STATUS
  OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
  check_eq "fresh spec exit $STATUS becomes 0" "$RC" "0"
  check_contains "fresh spec exit $STATUS still writes the report" "$(cat "$RUN/round-1/card.spec.json" 2>/dev/null)" '"marker":"spec"'

  new_spec_run
  printf '%s\n' '{"proposal":"old"}' > "$RUN/round-1/card.proposal.json"
  printf '%s\n' '{"coverage":{"dropped":0},"marker":"old"}' > "$RUN/round-1/card.spec.json"
  mkdir -p "$RUN/round-2"; printf '%s\n' 'fake png' > "$RUN/round-2/card.png"
  printf '%s\n' '{"coverage":{"dropped":2},"marker":"reused"}' > "$STUB_REPORT_spec"
  export STUB_REPORT_spec_2="$UM_WORK/retry.json" STUB_EXIT_spec_2=$STATUS
  printf '%s\n' '{"coverage":{"dropped":0},"marker":"fresh"}' > "$STUB_REPORT_spec_2"
  OUT=$(measure --run "$RUN" --round 2 2>&1); RC=$?
  check_eq "retry spec exit $STATUS becomes 0" "$RC" "0"
  check_contains "retry spec exit $STATUS keeps the better retry report" "$(cat "$RUN/round-2/card.spec.json")" '"marker":"fresh"'
  check_eq "retry spec exit $STATUS leaves no retry files" "$(ls "$RUN/round-2" | grep -c retry)" "0"
done
unset STUB_EXIT_spec STUB_EXIT_spec_2

echo "hill-measure: proposer unusable"
new_spec_run; export STUB_PROPOSER_STATUS=3
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
check_eq "unusable proposer leaves measurement exit 0" "$RC" "0"
check_eq "unusable proposer writes no spec report" "$(test -e "$RUN/round-1/card.spec.json"; echo $?)" "1"
check_eq "unusable proposer status is saved" "$(cat "$RUN/round-1/card.proposal.json.status")" "3"

echo "hill-measure: proposer quota"
new_spec_run; export STUB_PROPOSER_STATUS=75
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
check_eq "proposer quota exits 75" "$RC" "75"

echo "hill-measure: stale proposer status is ignored"
for STALE in 3 75; do
  new_spec_run; export STUB_SETUP_FAIL=1
  echo "$STALE" > "$RUN/round-1/card.proposal.json.status"
  OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
  check_eq "stale status $STALE: a setup failure still exits 3" "$RC" "3"
  check_contains "stale status $STALE: setup failure is reported" "$OUT" "stub ui-measure setup failure"
done
unset STUB_SETUP_FAIL

echo "hill-measure: --label"
new_measure_run
python3 - "$RUN/measure.json" <<'PY'
import json, sys
p=sys.argv[1]; data=json.load(open(p)); data["screens"]["card"]={"target":"card"}
json.dump(data, open(p, "w"))
PY
printf '%s\n' 'fake png' > "$RUN/round-1/card.png"
OUT=$(measure --run "$RUN" --round 1 --label card 2>&1); RC=$?
LOG=$(cat "$STUB_STATE.log" 2>/dev/null)
check_eq "label selection exits 0" "$RC" "0"
check_contains "selected screen is measured" "$LOG" "card.geometry.json"
check_missing "unselected screen is not measured" "$LOG" "home.geometry.json"

echo "hill-measure: figma"
new_spec_run
python3 - "$RUN/measure.json" "$UM_WORK/manifest-proposal.json" <<'PY'
import json, sys
p=sys.argv[1]; data=json.load(open(p)); screen=data["screens"]["card"]
del screen["node"]; screen["figma"]="12:34"; screen["proposal"]=sys.argv[2]
json.dump(data, open(p, "w"))
PY
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
LOG=$(cat "$STUB_STATE.log" 2>/dev/null)
check_eq "figma spec exits 0" "$RC" "0"
check_contains "passes --figma and its node id" "$LOG" $'ARG --figma\nARG 12:34'
check_missing "does not pass --node" "$LOG" "ARG --node"

echo "hill-measure: malformed measure.json"
for CASE in invalid unknown both; do
  new_measure_run
  case "$CASE" in
    invalid) printf '%s\n' '{' > "$RUN/measure.json"; PROBLEM=JSON ;;
    unknown) python3 - "$RUN/measure.json" <<'PY'
import json, sys
p=sys.argv[1]; data=json.load(open(p)); data["extra"]=True
json.dump(data, open(p, "w"))
PY
      PROBLEM=extra ;;
    both) python3 - "$RUN/measure.json" <<'PY'
import json, sys
p=sys.argv[1]; data=json.load(open(p)); data["screens"]["home"].update(figma="12:34", node="node.json")
json.dump(data, open(p, "w"))
PY
      PROBLEM=both ;;
  esac
  OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
  check_eq "$CASE measure.json exits 2" "$RC" "2"
  check_contains "$CASE measure.json names the file" "$OUT" "measure.json"
  check_contains "$CASE measure.json names the problem" "$OUT" "$PROBLEM"
done

echo "hill-measure: unknown label"
new_measure_run
OUT=$(measure --run "$RUN" --round 1 --label missing 2>&1); RC=$?
check_eq "unknown label exits 2" "$RC" "2"
check_contains "unknown label is named" "$OUT" "missing"

echo "hill-measure: missing screenshot"
new_measure_run; rm "$RUN/round-1/home.png"
OUT=$(measure --run "$RUN" --round 1 2>&1); RC=$?
check_eq "missing screenshot exits 2" "$RC" "2"
check_contains "missing screenshot names its label" "$OUT" "home"
check_contains "missing screenshot names the expected file" "$OUT" "round-1/home.png"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
