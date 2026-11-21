#!/usr/bin/env bash
# End-to-end: hill-measure (real ui-measure, real browser) then hill-score over two rounds.
# Round 1 measures a padded card, round 2 the clean one; the test swaps the config between
# rounds, standing in for the fixer. Judge JSONs are hand-written with equal scores.
# Skipped unless HILL_UI_MEASURE names a ui-measure CLI that runs.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$HERE/../scripts"
FIXTURES="$HERE/../../../../ui-measure/test/fixtures"

if [ -z "${HILL_UI_MEASURE:-}" ] || ! node "$HILL_UI_MEASURE" --help >/dev/null 2>&1; then
  echo "skip: set HILL_UI_MEASURE to a built plugins/ui-measure/dist/ui-measure.mjs to run the end-to-end test"
  exit 0
fi
export HILL_UI_MEASURE

PASS=0
FAIL=0
WORK=$(mktemp -d)
SERVER=""
cleanup() { [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null; rm -rf "$WORK"; }
trap cleanup EXIT

ok()   { PASS=$((PASS+1)); echo "  [ok]   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  [FAIL] $1"; [ -n "${2:-}" ] && echo "         got: ${2:0:600}"; }
check_eq() { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2 (want $3)"; }
jget() { python3 -c 'import json,sys; j=json.loads(sys.argv[1]); print(eval(sys.argv[2]))' "$1" "$2"; }

PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
(cd "$FIXTURES/pages" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1) &
SERVER=$!
for _ in $(seq 1 50); do
  python3 -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:$PORT/card-clean.html')" 2>/dev/null && break
  sleep 0.1
done

cd "$WORK"
config() { # config PAGE -> cfg.json whose target `card` loads PAGE
  cat > cfg.json <<JSON
{"targets":{"card":{"adapter":{"kind":"url","url":"http://127.0.0.1:$PORT/$1","root":"#card"},"viewport":[800,600],"designRootFontPx":16}},"baselineDir":"$WORK/baselines"}
JSON
}
cat > run-measure.json <<JSON
{"config":"cfg.json","screens":{"card":{"target":"card","node":"$FIXTURES/figma/card.json","proposal":"$FIXTURES/card-proposal.json"}}}
JSON
mkdir -p run && cp run-measure.json run/measure.json

judge() { # judge ROUNDDIR: equal scores, no findings
  python3 - "$1/card.run1.json" <<'PY'
import json,sys
cats=["hierarchy","typography","colour","spacing","consistency","originality"]
json.dump({"label":"card","mode":"design","image":"card.png","sha256":"ab"*32,"design":{"path":"/d/x.png","sha256":"12"*32},
  "model_requested":"kimi-code/k3.1-pro","provenance":"served=unconfirmed",
  "scores":{c:6 for c in cats},"findings":[]},open(sys.argv[1],"w"))
PY
}

round() { # round N PAGE
  mkdir -p "run/round-$1"; : > "run/round-$1/card.png"
  config "$2"
  python3 "$SCRIPTS/hill-measure" --run run --round "$1" 2>&1
  judge "run/round-$1"
}

echo "e2e: round 1 on the padded card"
round 1 card-padding.html; check_eq "hill-measure exits 0" "$?" "0"
OUT=$(python3 "$SCRIPTS/hill-score" --run run 2>/dev/null)
check_eq "round 1 measured fails" "$(jget "$OUT" "j['measured']['fails']")" "7"
check_eq "round 1 comparable" "$(jget "$OUT" "j['measured']['comparable']")" "True"
check_eq "round 1 pairs accepted" "$(jget "$OUT" "j['measured']['accepted']")" "3"
check_eq "round 1 continues" "$(jget "$OUT" "j['stop']")" "False"
check_eq "round 1 is the best so far" "$(jget "$OUT" "j['best_round']")" "1"

echo "e2e: round 2 on the clean card (reuses round 1's proposal)"
round 2 card-clean.html; check_eq "hill-measure exits 0" "$?" "0"
check_eq "round 2 reuses the saved proposal" "$(cmp -s run/round-1/card.proposal.json run/round-2/card.proposal.json && echo same)" "same"
OUT=$(python3 "$SCRIPTS/hill-score" --run run 2>/dev/null)
check_eq "round 2 measured fails" "$(jget "$OUT" "j['measured']['fails']")" "0"
check_eq "round 2 comparable" "$(jget "$OUT" "j['measured']['comparable']")" "True"
check_eq "round 2 guard clear" "$(jget "$OUT" "j['measured']['guard']")" "None"
check_eq "best round is 2" "$(jget "$OUT" "j['best_round']")" "2"
check_eq "no revert" "$(jget "$OUT" "j['revert_to']")" "None"
check_eq "zero fails stops the loop" "$(jget "$OUT" "j['stop']")" "True"
case "$(cat run/scores.md)" in *"Measured (ui-measure counts"*) ok "scores.md has the Measured table" ;; *) bad "scores.md has the Measured table" ;; esac

echo
echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
