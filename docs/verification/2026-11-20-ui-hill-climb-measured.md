---
status: current
last-verified: 2026-11-20
owner: Kirill
---

# Manual verification: ui-hill-climb measured rounds

Step-by-step checks that `ui-hill-climb` climbs on `ui-measure` counts, using only the card fixtures that
ship with the ui-measure plugin. No Kimi is called: the design-to-DOM pairing is a saved file, and the judge
files are written by hand with equal scores. Every command below was run on 2026-11-20 and the expected
output is what it printed. The automated version of the happy path is
`plugins/ui-hill-climb/skills/ui-hill-climb/tests/test-e2e-measure.sh`.

## Setup

Install and build ui-measure (needs Playwright's chromium):

```bash
cd ~/w/skills-catalog/plugins/ui-measure
pnpm install
pnpm exec playwright install chromium
pnpm build
```

Serve the fixture pages in a second terminal and leave it running. The guard check below needs a page with
a child removed, so serve a copy:

```bash
mkdir -p /tmp/hc-guide && cd /tmp/hc-guide
cp -r ~/w/skills-catalog/plugins/ui-measure/test/fixtures/pages pages
cd pages && python3 -m http.server 8765 --bind 127.0.0.1
```

In the first terminal, set the paths and write one ui-measure config per page state. `ui-measure.config.json`
is the file the run reads; copying a `cfg-*.json` over it stands in for the fixer changing the page between
rounds:

```bash
cd /tmp/hc-guide
export HC=~/w/skills-catalog/plugins/ui-hill-climb/skills/ui-hill-climb
export HILL_UI_MEASURE=~/w/skills-catalog/plugins/ui-measure/dist/ui-measure.mjs
F=~/w/skills-catalog/plugins/ui-measure/test/fixtures
for p in padding clean; do cat > cfg-$p.json <<EOF2
{"targets":{"card":{"adapter":{"kind":"url","url":"http://127.0.0.1:8765/card-$p.html","root":"#card"},"viewport":[800,600],"designRootFontPx":16}},"baselineDir":"/tmp/hc-guide/baselines"}
EOF2
done
```

A helper that writes the judge file a real run gets from `hill-judge` (equal scores, no findings):

```bash
mkjudge() {
  python3 - "$1/card.run1.json" <<'PY'
import json,sys
cats=["hierarchy","typography","colour","spacing","consistency","originality"]
json.dump({"label":"card","mode":"design","image":"card.png","sha256":"ab"*32,"design":{"path":"/d/x.png","sha256":"12"*32},
  "model_requested":"kimi-code/k3.1-pro","provenance":"served=unconfirmed",
  "scores":{c:6 for c in cats},"findings":[]},open(sys.argv[1],"w"))
PY
}
```

Each round needs a `card.png`; `hill-measure` only checks it exists, so an empty file stands in for the
agent-browser screenshot (`: > round-N/card.png`). Define this once too, to print the decision compactly:

```bash
SUM='import json,sys; j=json.load(sys.stdin); print({k:j[k] for k in ("round","best_round","revert_to","stop","reason","measured")}, len(j["open_findings"]))'
```

## Happy path

Start a run. `measure.json` names the config, the screen's target, the design node and the saved pairing:

```bash
mkdir -p .hill/demo/round-1 && : > .hill/demo/round-1/card.png
cat > .hill/demo/measure.json <<EOF2
{"config": "ui-measure.config.json",
 "screens": {"card": {"target": "card", "node": "$F/figma/card.json", "proposal": "$F/card-proposal.json"}}}
EOF2
```

Round 1, the card with the wrong padding:

| step | command | expect |
| --- | --- | --- |
| Measure | `cp cfg-padding.json ui-measure.config.json; python3 $HC/scripts/hill-measure --run .hill/demo --round 1; echo "exit $?"` | no output but `exit 0` |
| Files | `ls .hill/demo/round-1` | `card.geometry.json  card.png  card.proposal.json  card.spec.json` |
| Judge | `mkjudge .hill/demo/round-1` | no output |
| Score | `python3 $HC/scripts/hill-score --run .hill/demo \| python3 -c "$SUM"` | see below |

Expected score line:

```
{'round': 1, 'best_round': 1, 'revert_to': None, 'stop': False, 'reason': 'continue', 'measured': {'fails': 7, 'comparable': True, 'accepted': 3, 'guard': None}} 7
```

The seven open findings are one `M-` id per mismatch (the padding is one id with four findings). The Measured
part of `scores.md`:

```
## Round 1

Measured (ui-measure counts; they rank rounds before the judge does):

| screen | fails | verdict | pairs |
| --- | --- | --- | --- |
| card | geometry 0, spec 7 | mismatches | 3/3 |

- ranking key: comparable yes, guard clear, fails 7, judge -0.00 majors, 6.00
- guard: not tripped
```

Round 2, the fixer has corrected the page (`card-clean.html`). The saved pairing is reused:

```bash
mkdir -p .hill/demo/round-2 && : > .hill/demo/round-2/card.png
cp cfg-clean.json ui-measure.config.json
python3 $HC/scripts/hill-measure --run .hill/demo --round 2; echo "exit $?"     # exit 0
mkjudge .hill/demo/round-2
python3 $HC/scripts/hill-score --run .hill/demo | python3 -c "$SUM"
```

Expected:

```
{'round': 2, 'best_round': 2, 'revert_to': None, 'stop': True, 'reason': 'no measured failures and no major deviations from the design', 'measured': {'fails': 0, 'comparable': True, 'accepted': 3, 'guard': None}} 0
```

and in `scores.md`: `| card | geometry 0, spec 0 | clean | 3/3 |`, `guard: not tripped`, and at the end
`best round: 2`, `decision: stop (…)`. Also check that `round-2/card.proposal.json` is a copy of round 1's.

## Edge cases

Each of these works on a copy of the happy-path run, so the demo stays intact (`cp -r .hill/demo .hill/eN`).

| case | how | expect |
| --- | --- | --- |
| No screenshot | `cp -r .hill/demo .hill/e1; mkdir .hill/e1/round-3; python3 $HC/scripts/hill-measure --run .hill/e1 --round 3; echo "exit $?"` | `hill-measure: measured label 'card' has no screenshot: .hill/e1/round-3/card.png`, exit `2` |
| Missing report | `cp -r .hill/demo .hill/e2; rm .hill/e2/round-2/card.spec.json`, then `python3 $HC/scripts/hill-score --run .hill/e2 \| python3 -c "$SUM"` | `revert_to: 1`, `comparable: False`, reason `round 2 not comparable: card: report missing: card.spec.json`; `scores.md` row `\| card \| geometry 0 \| missing \| - \|` |
| Root not found (not comparable) | copy of the run, round 2 measured with `sed 's/#card/#nope/' cfg-clean.json > ui-measure.config.json`, judge file written | `hill-measure` exits `0`; score reason `round 2 not comparable: card: root #nope not found; root #nope not found`, `revert_to: 1` |
| Unknown label | `python3 $HC/scripts/hill-measure --run .hill/demo --round 2 --label nope; echo "exit $?"` | `hill-measure: unknown label 'nope' in .hill/demo/measure.json`, exit `2` |
| No `measure.json` | copy the run, delete `measure.json`, run `python3 $HC/scripts/hill-measure --run .hill/e7 --round 2` then `python3 $HC/scripts/hill-score --run .hill/e7` | `hill-measure` prints nothing, exit `0`; `hill-score` output has no `measured` key and `scores.md` has no Measured table |

Deleting a child from the page. Make `pages/card-guard.html` with `grep -v "<p>" pages/card-clean.html >
pages/card-guard.html`, point a config at it (`sed 's/card-clean/card-guard/' cfg-clean.json`), measure it as
round 2 of a copy of the run. This is a trap for the unwary: `hill-measure` would call the real proposer
when the reused pairing drops a pair, so for this check set `HILL_PROPOSE` to a stub that answers with the
saved fixture pairing and calls no model:

```bash
cat > fake-propose.py <<EOF2
import sys
sys.stdout.write(open("$F/card-proposal.json").read())
EOF2
HILL_PROPOSE=$PWD/fake-propose.py python3 $HC/scripts/hill-measure --run .hill/e4 --round 2
```

Expected: exit `0`, but the round is **not comparable**, not a guard trip, because the gap and the
padding can no longer be measured to the removed element:

```
'reason': 'round 2 not comparable: card: the sibling 1:3 has no accepted pair, so the gap between 1:2 and 1:3 cannot be measured', 'measured': {'fails': 0, 'comparable': False, 'accepted': 2, 'guard': None}
| card | geometry 0, spec 0 | not_comparable | 2/3 |
```

Removing the heading instead (`grep -v "<h2>"`) gives `the top padding is measured to 1:2, which has no
accepted pair`, pairs `1/3`. A round that is not comparable is never chosen as the best round, so deleting an
element to make a count drop is still protected against: the round falls out of the ranking and the score says
`revert_to`. No deletion on this fixture trips the accepted-pairs guard; that guard is pinned by
`tests/test-score-measured.sh`.

The guard itself trips when a comparable round has fewer accepted pairs than the best earlier round, or when
the judge raises a new major hierarchy or consistency finding. The guard is shown here through the second path: in a copy of the happy
path (`cp -r .hill/demo .hill/e6`), replace `round-2/card.run1.json` with one whose `findings` is
`[{"category":"hierarchy","element":"Card title","problem":"title no longer leads","severity":"major","region":{"x":10,"y":20,"w":100,"h":40}}]`
and score again. Expected:

```
{'round': 2, 'best_round': 1, 'revert_to': 1, 'stop': False, 'reason': 'round 2 guard: new major hierarchy finding: Card title (card)', 'measured': {'fails': 0, 'comparable': True, 'accepted': 3, 'guard': 'new major hierarchy finding: Card title (card)'}} 1
```

with `- ranking key: comparable yes, guard tripped, fails 0, judge -1.00 majors, 6.00` in `scores.md`: zero
fails does not stop the loop while the guard is tripped.

## Round trip: revert to the best round

Use the root-not-found copy (`.hill/e3`), where round 2 was not comparable and the score said `revert_to: 1`.
Restore round 1's page (`cp cfg-padding.json ui-measure.config.json`; in a real run, `git checkout` the
`hill: round 1` commit), then measure and score round 3:

```bash
mkdir -p .hill/e3/round-3 && : > .hill/e3/round-3/card.png
python3 $HC/scripts/hill-measure --run .hill/e3 --round 3; echo "exit $?"     # exit 0
mkjudge .hill/e3/round-3
python3 $HC/scripts/hill-score --run .hill/e3 | python3 -c "$SUM"
```

Expected: the same counts as round 1, and round 1 is still the best round:

```
{'round': 3, 'best_round': 1, 'revert_to': None, 'stop': True, 'reason': 'round cap 3 reached', 'measured': {'fails': 7, 'comparable': True, 'accepted': 3, 'guard': None}} 7
```

## Known rough edges (found during this check)

- A report whose verdict is `mismatches` but which also holds `not_comparable` findings (a partial pairing,
  for example `card-partial-proposal.json`) is counted as comparable by `hill-score`: it gave `fails 2`,
  `comparable True`, `accepted 2` against the full pairing's 7 fails. This is accepted by design and a known
  limit, not an unfixed bug: `hill-score` defines comparable by the report's `verdict`, and ui-measure sets it
  to `mismatches` when any finding failed. The pairs guard still catches a partial pairing that loses accepted
  pairs against an earlier round.
- Deleting a child cannot trip the pairs guard on the card fixture; it makes the round not comparable instead.
  The pairs guard only fires when a round stays comparable with fewer accepted pairs.
