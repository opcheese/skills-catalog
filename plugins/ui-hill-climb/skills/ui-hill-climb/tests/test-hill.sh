#!/usr/bin/env bash
# Tests for hill-judge and hill-score. Hermetic: a fake kimi-delegate prints
# canned judge answers, so we assert on what the scripts do with them.

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)"
JUDGE="$DIR/hill-judge"
SCORE="$DIR/hill-score"
PASS=0
FAIL=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

ok()   { PASS=$((PASS+1)); echo "  [ok]   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  [FAIL] $1"; [ -n "${2:-}" ] && echo "         got: ${2:0:400}"; }
check_contains() { case "$2" in *"$3"*) ok "$1" ;; *) bad "$1" "$2" ;; esac; }
check_missing()  { case "$2" in *"$3"*) bad "$1" "$2" ;; *) ok "$1" ;; esac; }
check_eq()       { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2 (want $3)"; }

png() { python3 -c "
import struct,zlib,sys
w,h=4,3
raw=b''.join(b'\x00'+b'\xff\xff\xff'*w for _ in range(h))
def c(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
open(sys.argv[1],'wb').write(b'\x89PNG\r\n\x1a\n'+c(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+c(b'IDAT',zlib.compress(raw))+c(b'IEND',b''))
" "$1"; }

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

GOOD='Here is my verdict.
{"scores":{"hierarchy":6,"typography":7,"colour":5,"spacing":6,"consistency":7,"originality":4},
 "findings":[{"category":"spacing","element":"Primary button","problem":"cramped padding","severity":"major","region":{"x":10,"y":20,"w":100,"h":40}}]}'

reset() { rm -f "$WORK"/state "$WORK"/log "$WORK"/ans*; export FAKE_STATE="$WORK/state" FAKE_LOG="$WORK/log" FAKE_ANSWER="$WORK/ans"; }
judge() { HILL_KIMI_DELEGATE="$FAKE" "$JUDGE" "$@" 2>&1; }

png "$WORK/screen.png"; png "$WORK/ref.png"
echo "Keep the brand teal. No gradients." > "$WORK/constraints.md"

echo "hill-judge: a good answer"
reset; echo "$GOOD" > "$WORK/ans"
OUT=$(judge --screen "$WORK/screen.png" --reference "$WORK/ref.png" --constraints "$WORK/constraints.md" --label home --runs 2 --out "$WORK/r1")
check_eq "exits 0" "$?" "0"
check_eq "writes one JSON per run" "$(ls "$WORK/r1"/home.run*.json 2>/dev/null | wc -l | tr -d ' ')" "2"
J="$(cat "$WORK/r1/home.run1.json")"
check_contains "records the scores" "$J" '"hierarchy": 6'
check_contains "records the findings" "$J" '"Primary button"'
check_contains "records the requested model" "$J" '"model_requested": "kimi-code/k3.1-pro"'
check_contains "records the provenance line" "$J" 'served=unconfirmed'
check_contains "records the screen's sha256" "$J" "$(sha256sum "$WORK/screen.png" | cut -c1-64)"
LOG="$(cat "$WORK/log")"
check_contains "uses kimi k3.1-pro by default" "$LOG" "MODEL=kimi-code/k3.1-pro"
check_contains "runs on the kimi path" "$LOG" "ARG kimi"
check_contains "asks for the final answer only" "$LOG" "ARG --final-only"
check_contains "names the screen file in the prompt" "$LOG" "screen.png"
check_contains "names the reference file in the prompt" "$LOG" "reference-1.png"
check_contains "passes the constraints file" "$LOG" "constraints.md"
check_missing "never names a target score" "$LOG" "target"
check_contains "lists default looks to avoid" "$LOG" "default"
check_missing "uses no superlative criteria" "$LOG" "museum"
check_contains "copies the inputs next to each other" "$(ls "$WORK/r1"/work-home 2>/dev/null)" "reference-1.png"

echo "hill-judge: model override"
reset; echo "$GOOD" > "$WORK/ans"
HILL_JUDGE_MODEL=kimi-for-coding/k3.1-pro judge --screen "$WORK/screen.png" --label a --out "$WORK/r2" >/dev/null
check_contains "HILL_JUDGE_MODEL picks the model" "$(cat "$WORK/log")" "MODEL=kimi-for-coding/k3.1-pro"

echo "hill-judge: a non-JSON answer is retried once, then fails"
reset; echo "I cannot see the image" > "$WORK/ans"
OUT=$(judge --screen "$WORK/screen.png" --label b --out "$WORK/r3"); RC=$?
check_eq "exits 3" "$RC" "3"
check_eq "tries twice" "$(grep -c '^CALL' "$WORK/log")" "2"
check_contains "says the answer was not JSON" "$OUT" "no scores JSON"
reset; echo "nope" > "$WORK/ans.1"; echo "$GOOD" > "$WORK/ans.2"
judge --screen "$WORK/screen.png" --label c --runs 1 --out "$WORK/r4" >/dev/null
check_eq "a good second answer is kept" "$?" "0"

echo "hill-judge: an answer missing categories fails"
reset; echo '{"scores":{"hierarchy":6},"findings":[]}' > "$WORK/ans"
judge --screen "$WORK/screen.png" --label d --out "$WORK/r5" >/dev/null
check_eq "exits 3" "$?" "3"

echo "hill-judge: refuses bad input before spending a call"
reset; echo "$GOOD" > "$WORK/ans"; echo "not an image" > "$WORK/fake.png"
OUT=$(judge --screen "$WORK/fake.png" --label e --out "$WORK/r6"); RC=$?
check_eq "a non-image screen exits 2" "$RC" "2"
check_eq "and makes no call" "$(cat "$WORK/state" 2>/dev/null || echo 0)" "0"
OUT=$(judge --screen "$WORK/missing.png" --label e --out "$WORK/r6"); RC=$?
check_eq "a missing screen exits 2" "$RC" "2"

echo "hill-judge: quota stop is passed through"
reset; echo "" > "$WORK/ans"; echo 75 > "$WORK/ans.exit"
judge --screen "$WORK/screen.png" --label f --out "$WORK/r7" >/dev/null
check_eq "exit 75 propagates" "$?" "75"

# ---------------------------------------------------------------------------
# hill-score works on judge JSONs, so build rounds by hand.
mk() { # mk ROUNDDIR LABEL RUN SCORE [ELEMENT]
  mkdir -p "$1"
  python3 - "$1/$2.run$3.json" "$4" "${5:-Primary button}" "$2" <<'PY'
import json,sys
p,s,el,label=sys.argv[1],float(sys.argv[2]),sys.argv[3],sys.argv[4]
cats=["hierarchy","typography","colour","spacing","consistency","originality"]
json.dump({"label":label,"image":label+".png","sha256":"ab"*32,"model_requested":"kimi-code/k3.1-pro",
  "provenance":"served=unconfirmed","scores":{c:s for c in cats},
  "findings":[{"category":"spacing","element":el,"problem":"cramped","severity":"major","region":{"x":1,"y":2,"w":3,"h":4}}]},open(p,"w"))
PY
}
RUN="$WORK/run"
# round 1: screen 5, ref 7. round 2: screen 6, ref 7. round 3: screen 5.5 (worse), ref 7.2
mk "$RUN/round-1" home 1 5; mk "$RUN/round-1" home 2 5; mk "$RUN/round-1" ref-home 1 7; mk "$RUN/round-1" ref-home 2 7

echo "hill-score: round 1"
OUT=$("$SCORE" --run "$RUN" 2>&1); RC=$?
check_eq "exits 0" "$RC" "0"
check_contains "reports the round" "$OUT" '"round": 1'
check_contains "does not stop after round 1" "$OUT" '"stop": false'
check_contains "lists open findings with a stable ID" "$OUT" '"id": "F-'
check_contains "writes scores.md" "$(cat "$RUN/scores.md" 2>/dev/null)" "| home |"
check_contains "scores.md names the judge model" "$(cat "$RUN/scores.md")" "kimi-code/k3.1-pro"
check_contains "writes references.json" "$(cat "$RUN/references.json" 2>/dev/null)" '"sha256"'

echo "hill-score: a finding addressed in changes.json is not raised again"
FID=$(echo "$OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["open_findings"][0]["id"])')
mk "$RUN/round-2" home 1 6; mk "$RUN/round-2" home 2 6; mk "$RUN/round-2" ref-home 1 7; mk "$RUN/round-2" ref-home 2 7
cat > "$RUN/round-2/changes.json" <<EOF
[{"id":"C-1","screen":"home","before":"round-1/home.png","after":"round-2/home.png","after_size":{"w":4,"h":3},
  "region":{"x":1,"y":2,"w":3,"h":4},"rationale":"more padding","categories":["spacing"],"addresses":["$FID"]}]
EOF
OUT=$("$SCORE" --run "$RUN" 2>&1)
check_contains "reports round 2" "$OUT" '"round": 2'
check_missing "the addressed finding is gone" "$OUT" "\"id\": \"$FID\""
check_contains "round 2 is the best so far" "$OUT" '"best_round": 2'

echo "hill-score: changes.json is validated"
echo '[{"id":"C-2","screen":"home"}]' > "$RUN/round-2/changes.json"
OUT=$("$SCORE" --run "$RUN" 2>&1); RC=$?
check_eq "a change missing fields exits 2" "$RC" "2"
check_contains "and names the missing field" "$OUT" "region"
cat > "$RUN/round-2/changes.json" <<EOF
[{"id":"C-1","screen":"home","before":"round-1/home.png","after":"round-2/home.png","after_size":{"w":4,"h":3},
  "region":{"x":1,"y":2,"w":3,"h":4},"rationale":"more padding","categories":["spacing"],"addresses":["$FID"]}]
EOF

echo "hill-score: a worse round is reverted and the cap stops the run"
mk "$RUN/round-3" home 1 5.5; mk "$RUN/round-3" home 2 5.5; mk "$RUN/round-3" ref-home 1 7.2; mk "$RUN/round-3" ref-home 2 7.2
OUT=$("$SCORE" --run "$RUN" 2>&1)
check_contains "best round stays 2" "$OUT" '"best_round": 2'
check_contains "says to revert to it" "$OUT" '"revert_to": 2'
check_contains "stops at the cap of 3" "$OUT" '"stop": true'
check_contains "reports reference drift" "$(cat "$RUN/scores.md")" "drift"

echo "hill-score: beating the references in every category stops early"
RUN2="$WORK/run2"
mk "$RUN2/round-1" home 1 8; mk "$RUN2/round-1" ref-home 1 7
OUT=$("$SCORE" --run "$RUN2" 2>&1)
check_contains "stops when every category beats the references" "$OUT" '"stop": true'
check_contains "and says why" "$OUT" "beats the references"

echo "hill-score: small gain over two rounds stops early (cap raised)"
RUN3="$WORK/run3"
mk "$RUN3/round-1" home 1 5; mk "$RUN3/round-1" ref-home 1 7
mk "$RUN3/round-2" home 1 5.1; mk "$RUN3/round-2" ref-home 1 7
mk "$RUN3/round-3" home 1 5.2; mk "$RUN3/round-3" ref-home 1 7
OUT=$("$SCORE" --run "$RUN3" --cap 5 2>&1)
check_contains "stops on gain under 0.3 over two rounds" "$OUT" '"stop": true'
check_contains "names the gain rule" "$OUT" "gain"

echo "hill-score: the same finding worded differently keeps one ID (found in live use)"
mkf() { # mkf FILE LABEL ELEMENT X Y W H
  python3 - "$@" <<'PY'
import json,sys
p,label,el,x,y,w,h=sys.argv[1:8]
cats=["hierarchy","typography","colour","spacing","consistency","originality"]
json.dump({"label":label,"image":label+".png","sha256":"cd"*32,"model_requested":"kimi-code/k3.1-pro","provenance":"",
  "scores":{c:5 for c in cats},
  "findings":[{"category":"spacing","element":el,"problem":"too big","severity":"major","region":{"x":int(x),"y":int(y),"w":int(w),"h":int(h)}}]},open(p,"w"))
PY
}
RUN4="$WORK/run4"; mkdir -p "$RUN4/round-1"
mkf "$RUN4/round-1/login.run1.json" login "Oversized logo header" 427 24 428 427
mkf "$RUN4/round-1/login.run2.json" login "Oversized circular logo container" 426 24 429 427
OUT=$("$SCORE" --run "$RUN4" 2>&1)
check_eq "two wordings, one region: one finding" "$(echo "$OUT" | grep -c '"id": "F-')" "1"
check_contains "seen by both runs" "$OUT" '"seen": 2'
FID4=$(echo "$OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["open_findings"][0]["id"])')
mkdir -p "$RUN4/round-2"
mkf "$RUN4/round-2/login.run1.json" login "Large emblem block" 430 20 420 400
cat > "$RUN4/round-2/changes.json" <<EOF
[{"id":"C-1","screen":"login","before":"round-1/login.png","after":"round-2/login.png","after_size":{"w":1280,"h":800},
  "region":{"x":500,"y":24,"w":280,"h":280},"rationale":"smaller logo","categories":["spacing"],"addresses":["$FID4"]}]
EOF
OUT=$("$SCORE" --run "$RUN4" 2>&1)
check_missing "a reworded finding on an addressed region is not raised again" "$OUT" '"Large emblem block"'
RUN5="$WORK/run5"; mkdir -p "$RUN5/round-1"
mkf "$RUN5/round-1/login.run1.json" login "Email and password placeholder text" 338 626 72 97
mkf "$RUN5/round-1/login.run2.json" login "Email and password placeholders" 324 611 632 126
check_eq "a region inside another, same category: one finding" "$("$SCORE" --run "$RUN5" 2>&1 | grep -c '"id": "F-')" "1"
echo "hill-score: across rounds the layout moves, so a small old region inside a new big one is not a match (found in live use)"
RUN6="$WORK/run6"; mkdir -p "$RUN6/round-1" "$RUN6/round-2"
mkf "$RUN6/round-1/login.run1.json" login "Purple headline accents" 507 495 464 78
mkf "$RUN6/round-2/login.run1.json" login "Input outlines" 324 474 632 126
OUT=$("$SCORE" --run "$RUN6" 2>&1)
OLD=$("$SCORE" --run "$RUN6" 2>&1 >/dev/null; python3 - "$RUN6" <<'PY'
import sys,hashlib; print("F-"+hashlib.sha1(b"login|spacing|purple headline accents").hexdigest()[:8])
PY
)
check_missing "the moved input does not inherit the old headline's ID" "$OUT" "\"id\": \"$OLD\""
mkf "$RUN4/round-2/login.run2.json" login "Footer link" 10 760 100 20
OUT=$("$SCORE" --run "$RUN4" 2>&1)
check_contains "a finding elsewhere is still raised" "$OUT" '"Footer link"'

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
