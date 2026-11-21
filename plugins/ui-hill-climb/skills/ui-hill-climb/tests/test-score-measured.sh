#!/usr/bin/env bash
# Tests for hill-score's measured ranking. Hermetic: judge JSONs and ui-measure reports are
# built by hand; no browser, no Kimi.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCORE="$HERE/../scripts/hill-score"
PASS=0
FAIL=0
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

ok()   { PASS=$((PASS+1)); echo "  [ok]   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  [FAIL] $1"; [ -n "${2:-}" ] && echo "         got: ${2:0:600}"; }
check_contains() { case "$2" in *"$3"*) ok "$1" ;; *) bad "$1" "$2" ;; esac; }
check_missing()  { case "$2" in *"$3"*) bad "$1" "$2" ;; *) ok "$1" ;; esac; }
check_eq()       { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2 (want $3)"; }

# jget JSON EXPR: evaluate a python expression over the parsed JSON `j`
jget() { python3 -c 'import json,sys; j=json.loads(sys.argv[1]); print(eval(sys.argv[2]))' "$1" "$2"; }

judge() { # judge ROUNDDIR LABEL SCORE FINDINGS_JSON   (design-mode judge JSON)
  mkdir -p "$1"
  python3 - "$1/$2.run1.json" "$2" "$3" "$4" <<'PY'
import json,sys
p,label,s,findings=sys.argv[1],sys.argv[2],float(sys.argv[3]),json.loads(sys.argv[4])
cats=["hierarchy","typography","colour","spacing","consistency","originality"]
json.dump({"label":label,"mode":"design","image":label+".png","sha256":"ab"*32,"design":{"path":"/d/x.png","sha256":"12"*32},
   "model_requested":"kimi-code/k3.1-pro","provenance":"served=unconfirmed",
   "scores":{c:s for c in cats},"findings":findings},open(p,"w"))
PY
}
finding() { # finding CATEGORY ELEMENT SEVERITY X  -> JSON list of one judge finding
  echo "[{\"category\":\"$1\",\"element\":\"$2\",\"problem\":\"p\",\"severity\":\"$3\",\"region\":{\"x\":$4,\"y\":2,\"w\":30,\"h\":4}}]"
}
NONE='[]'

report() { # report ROUNDDIR LABEL CHECK FAILS ACCEPTED [VERDICT]
  python3 - "$@" <<'PY'
import json,os,sys
d,label,check,fails,acc=sys.argv[1],sys.argv[2],sys.argv[3],int(sys.argv[4]),int(sys.argv[5])
verdict=sys.argv[6] if len(sys.argv)>6 and sys.argv[6] else ("mismatches" if fails else "clean")
fs=[]
for i in range(fails):
    t={"selector":f".{label}-{i}"}
    if check=="spec": t["designNode"]=f"1:{i}"
    fs.append({"check":check,"kind":"padding" if check=="spec" else "overflow","status":"fail","target":t,
               "expected":"16px","actual":"8px","deltaPx":8})
if verdict=="not_comparable":
    fs.append({"check":check,"kind":"scale","status":"not_comparable","target":{"selector":"body"},"reason":"viewport differs"})
os.makedirs(d,exist_ok=True)
json.dump({"tool":"ui-measure","version":"1","page":label,"scale":1,"findings":fs,
           "coverage":{"pairsProposed":acc,"pairsAccepted":acc,"dropped":0},"verdict":verdict},
          open(os.path.join(d,f"{label}.{check}.json"),"w"))
PY
}

mkmeasure() { # mkmeasure RUNDIR LABEL[:spec] ...
  local R="$1"; shift
  python3 - "$R" "$@" <<'PY'
import json,os,sys
R=sys.argv[1]; os.makedirs(R,exist_ok=True)
s={}
for a in sys.argv[2:]:
    label,_,mode=a.partition(":")
    s[label]={"target":label,**({"node":"design/%s.json"%label} if mode=="spec" else {})}
json.dump({"config":"ui-measure.config.json","screens":s},open(os.path.join(R,"measure.json"),"w"))
PY
}

card_round() { # card_round RUN N JUDGE_SCORE SPEC_FAILS ACCEPTED [FINDINGS]  (screen "card", both reports)
  judge "$1/round-$2" card "$3" "${6:-$NONE}"
  report "$1/round-$2" card geometry 0 0
  report "$1/round-$2" card spec "$4" "$5"
}
run() { "$SCORE" --run "$1" "${@:2}" 2>/dev/null; }

echo "hill-score measured: ranking"
R="$WORK/a"; mkmeasure "$R" card:spec
card_round "$R" 1 7.0 4 3; card_round "$R" 2 6.0 1 3
OUT=$(run "$R")
check_eq "fewer fails beats a higher judge score: best 2" "$(jget "$OUT" 'j["best_round"]')" "2"
check_eq "no revert" "$(jget "$OUT" 'j["revert_to"]')" "None"
check_eq "measured block: fails" "$(jget "$OUT" 'j["measured"]["fails"]')" "1"
check_eq "measured block: comparable" "$(jget "$OUT" 'j["measured"]["comparable"]')" "True"
check_eq "measured block: accepted" "$(jget "$OUT" 'j["measured"]["accepted"]')" "3"
check_eq "measured block: guard null" "$(jget "$OUT" 'j["measured"]["guard"]')" "None"

R="$WORK/b"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 2 3; card_round "$R" 2 5.0 1 3; card_round "$R" 3 9.0 3 3
OUT=$(run "$R" --cap 9)
check_eq "more fails reverts to the round with fewer" "$(jget "$OUT" 'j["revert_to"]')" "2"
check_eq "best stays 2" "$(jget "$OUT" 'j["best_round"]')" "2"

R="$WORK/c"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 2 3; card_round "$R" 2 6.5 2 3
OUT=$(run "$R")
check_eq "equal fails fall back to the judge: best 2" "$(jget "$OUT" 'j["best_round"]')" "2"
card_round "$R" 2 4.0 2 3
OUT=$(run "$R")
check_eq "equal fails, worse judge: best 1, revert 1" "$(jget "$OUT" '[j["best_round"],j["revert_to"]]')" "[1, 1]"

R="$WORK/d"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 3 3
judge "$R/round-2" card 8 "$NONE"; report "$R/round-2" card geometry 0 0; report "$R/round-2" card spec 0 3 not_comparable
OUT=$(run "$R")
check_eq "not comparable is never best" "$(jget "$OUT" 'j["best_round"]')" "1"
check_contains "reason names the screen" "$OUT" "round 2 not comparable: card:"
check_contains "reason carries the report's reason" "$OUT" "viewport differs"
check_eq "measured comparable false" "$(jget "$OUT" 'j["measured"]["comparable"]')" "False"
check_eq "not comparable does not stop" "$(jget "$OUT" 'j["stop"]')" "False"

R="$WORK/e"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 3 3
judge "$R/round-2" card 8 "$NONE"; report "$R/round-2" card geometry 0 0
OUT=$(run "$R")
check_contains "missing report names the screen and file" "$OUT" "round 2 not comparable: card: report missing: card.spec.json"
check_eq "missing report: best 1" "$(jget "$OUT" 'j["best_round"]')" "1"

echo "hill-score measured: guard"
R="$WORK/g1"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 1 3; card_round "$R" 2 6.0 0 2
OUT=$(run "$R")
check_eq "fewer accepted pairs: best 1" "$(jget "$OUT" 'j["best_round"]')" "1"
check_contains "guard names the screen and both counts" "$(jget "$OUT" 'j["measured"]["guard"]')" "card 2 < 3"
check_eq "tripped round is reverted" "$(jget "$OUT" 'j["revert_to"]')" "1"
check_eq "tripped round with 0 fails does not stop as done" "$(jget "$OUT" 'j["stop"]')" "False"

R="$WORK/g2"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 1 3 "$(finding hierarchy "Page heading" major 1)"
card_round "$R" 2 6.0 0 3 "$(finding hierarchy "Sidebar menu" major 400)"
OUT=$(run "$R")
check_contains "new hierarchy major trips the guard" "$(jget "$OUT" 'j["measured"]["guard"]')" "Sidebar menu"
check_eq "guarded round is not best" "$(jget "$OUT" 'j["best_round"]')" "1"
R="$WORK/g3"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 1 3 "$(finding hierarchy "Page heading" major 1)"
card_round "$R" 2 6.0 0 3 "$(finding spacing "Sidebar menu" major 400)"
OUT=$(run "$R")
check_eq "a new spacing major does not trip it" "$(jget "$OUT" 'j["measured"]["guard"]')" "None"
check_eq "so round 2 is best" "$(jget "$OUT" 'j["best_round"]')" "2"
R="$WORK/g4"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 1 3 "$(finding hierarchy "Page heading" major 1)"
card_round "$R" 2 6.0 0 3 "$(finding hierarchy "Page heading" major 1)"
check_eq "the same hierarchy major again is not new" "$(jget "$(run "$R")" 'j["measured"]["guard"]')" "None"
R="$WORK/g5"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 1 3 "$(finding consistency "Page heading" major 1)"
check_eq "guard never trips on round 1" "$(jget "$(run "$R")" 'j["measured"]["guard"]')" "None"

echo "hill-score measured: stop"
R="$WORK/s1"; mkmeasure "$R" card:spec
card_round "$R" 1 8.0 0 3 "$(finding spacing "Footer" minor 1)"
OUT=$(run "$R")
check_eq "design mode, 0 fails, no majors: stop" "$(jget "$OUT" 'j["stop"]')" "True"
check_eq "reason" "$(jget "$OUT" 'j["reason"]')" "no measured failures and no major deviations from the design"
R="$WORK/s2"; mkmeasure "$R" card:spec
card_round "$R" 1 8.0 0 3 "$(finding spacing "Footer" major 1)"
check_eq "0 fails with a judge major: continue" "$(jget "$(run "$R")" 'j["stop"]')" "False"
R="$WORK/s3"; mkmeasure "$R" card:spec
F="$(finding spacing "Footer" major 1)"
card_round "$R" 1 5.0 2 3 "$F"; card_round "$R" 2 5.05 2 3 "$F"; card_round "$R" 3 5.1 2 3 "$F"
OUT=$(run "$R" --cap 9)
check_eq "no progress: stop" "$(jget "$OUT" 'j["stop"]')" "True"
check_contains "reason names fails" "$OUT" "fails did not drop"
check_contains "and the judge gain" "$OUT" "judge gain"
R="$WORK/s4"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 3 3 "$F"; card_round "$R" 2 5.05 2 3 "$F"; card_round "$R" 3 5.1 1 3 "$F"
check_eq "fails still dropping: continue" "$(jget "$(run "$R" --cap 9)" 'j["stop"]')" "False"
check_contains "cap still stops" "$(run "$R" --cap 3)" "round cap 3 reached"

echo "hill-score measured: open findings"
R="$WORK/o"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 2 3 "$F"
OUT=$(run "$R")
MID=$(jget "$OUT" 'j["open_findings"][0]["id"]')
JID=$(jget "$OUT" 'j["open_findings"][2]["id"]')
check_contains "measured ids start with M-" "$MID" "M-"
check_eq "measured entry fields" "$(jget "$OUT" 'sorted(j["open_findings"][0])')" "['actual', 'check', 'deltaPx', 'designNode', 'expected', 'id', 'kind', 'screen', 'selector', 'severity']"
check_eq "measured severity major" "$(jget "$OUT" 'j["open_findings"][0]["severity"]')" "major"
card_round "$R" 2 5.0 2 3 "$F"
cat > "$R/round-2/changes.json" <<EOT
[{"id":"C-1","screen":"card","before":"a.png","after":"b.png","after_size":{"w":4,"h":3},"region":{"x":1,"y":2,"w":3,"h":4},
  "rationale":"r","categories":["spacing"],"addresses":["$MID","$JID"]}]
EOT
OUT=$(run "$R")
check_contains "addressed but still failing stays open" "$OUT" "\"id\": \"$MID\""
check_missing "an addressed judge finding is still dropped" "$OUT" '"element": "Footer"'
check_eq "M- id is the same in round 2" "$(jget "$OUT" 'j["open_findings"][0]["id"]')" "$MID"

R="$WORK/o2"; mkmeasure "$R" card
judge "$R/round-1" card 5 "$NONE"; report "$R/round-1" card geometry 2 0
ID1=$(jget "$(run "$R")" 'j["open_findings"][0]["id"]')
judge "$R/round-2" card 5 "$NONE"; report "$R/round-2" card geometry 2 0
check_eq "M- id stable without designNode (geometry)" "$(jget "$(run "$R")" 'j["open_findings"][0]["id"]')" "$ID1"

R="$WORK/o3"; mkmeasure "$R" card:spec
judge "$R/round-1" card 6 '[{"category":"spacing","element":"Aaa","problem":"p","severity":"minor","region":{"x":1,"y":2,"w":3,"h":4}},{"category":"colour","element":"Bbb zzz","problem":"p","severity":"major","region":{"x":500,"y":2,"w":3,"h":4}}]'
report "$R/round-1" card geometry 1 0; report "$R/round-1" card spec 1 3
OUT=$(run "$R")
check_eq "order: measured, judge major, judge minor" "$(jget "$OUT" '[e["id"][0] + ":" + e["severity"] for e in j["open_findings"]]')" "['M:major', 'M:major', 'F:major', 'F:minor']"

echo "hill-score measured: scores.md"
R="$WORK/m"; mkmeasure "$R" card:spec
card_round "$R" 1 5.0 2 3
judge "$R/round-1" other 5 "$NONE"
run "$R" >/dev/null
MD="$(cat "$R/scores.md")"
check_contains "has a Measured table" "$MD" "Measured"
check_contains "with fails" "$MD" "fails"
check_contains "with verdict" "$MD" "verdict"
check_contains "with pairs" "$MD" "pairs"
check_contains "a screen outside measure.json shows judge only" "$MD" "| other | - | judge only |"
check_contains "shows accepted over proposed" "$MD" "3/3"
check_contains "shows the ranking key" "$MD" "ranking key"

echo "hill-score measured: back-compat and edge cases"
source "$HERE/fixtures/legacy-rounds.sh"
G="$HERE/fixtures"
for kind in ref design; do
  R="$WORK/legacy-$kind"
  if [ "$kind" = ref ]; then build_legacy_rounds "$R"; else build_legacy_design "$R"; fi
  "$SCORE" --run "$R" > "$WORK/out.$kind" 2>/dev/null
  if cmp -s "$WORK/out.$kind" "$G/legacy-$kind.stdout.json"; then ok "no measure.json ($kind): stdout identical to 0.1.3"; else bad "no measure.json ($kind): stdout differs" "$(diff "$WORK/out.$kind" "$G/legacy-$kind.stdout.json" | head -5)"; fi
  if cmp -s "$R/scores.md" "$G/legacy-$kind.scores.md"; then ok "no measure.json ($kind): scores.md identical"; else bad "no measure.json ($kind): scores.md differs" "$(diff "$R/scores.md" "$G/legacy-$kind.scores.md" | head -5)"; fi
  if cmp -s "$R/references.json" "$G/legacy-$kind.references.json"; then ok "no measure.json ($kind): references.json identical"; else bad "no measure.json ($kind): references.json differs"; fi
done
check_missing "no measured key without measure.json" "$(cat "$G/legacy-ref.stdout.json")" '"measured"'

R="$WORK/mid"; judge "$R/round-1" card 5 "$NONE"; mkmeasure "$R" card:spec
OUT=$(run "$R")
check_contains "measure.json added mid-run: round 1 says reports are missing" "$OUT" "round 1 not comparable: card: report missing"
card_round "$R" 2 5.0 3 3
check_eq "round 2 measured is best" "$(jget "$(run "$R")" 'j["best_round"]')" "2"

R="$WORK/bad"; judge "$R/round-1" card 5 "$NONE"; echo '{"config":' > "$R/measure.json"
"$SCORE" --run "$R" >/dev/null 2>&1; check_eq "malformed measure.json exits 2" "$?" "2"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
