---
status: draft
last-verified: 2026-11-20
owner: Kirill
---

# ui-hill-climb 0.2: climb on measured counts

**Path: architectural.** Deciding fact: this changes how ui-hill-climb decides that a round is better and when
it is done, and it makes the public skill depend on another plugin's CLI (`ui-measure`).

## Why

ui-hill-climb 0.1 climbs on one signal: an image judge's 0–10 scores. A recall spike over 18 real designer
review items found that the judge catches structure, wording and missing elements, and misses every
spacing, padding, clipping, scrollbar and effect defect (44% strict recall). Galatea measured the same
split earlier: a deleted element was seen 12 times in 12, a radius change and a 45px shift 0 times in 13.
`ui-measure` 0.1.0 (opcheese/skills-catalog#1) now measures exactly the classes the judge misses, without a
model. Nothing calls it yet. This spec puts it into the loop.

The roles follow the evidence: **measurement decides**, because it is exact on the classes it covers; **the
judge guards and breaks ties**, because it is good at what measurement can't see (an element gone, wrong
copy, a page that looks broken) and bad at quantities.

## Scope

In: two new scripts in ui-hill-climb (`hill-measure`, `hill-propose`), a new decision rule in `hill-score`,
the SKILL.md changes that go with them, tests, version 0.2.0.

Out: any change to `ui-measure` itself (one exception, under *ui-measure skill text*); changes to the judge's
prompts (a "read-alone" judge mode waits for its own A/B); the private real-defect evaluation; Galatea.

## Approaches weighed

- **Adapter scripts in ui-hill-climb, scorer reads their reports (chosen).** `hill-measure` runs the
  `ui-measure` CLI and files its reports next to the judge's; `hill-score` stays a pure function of the run
  directory. The ranking lives in the consumer, as the ui-measure spec requires ("ranking and caps belong to
  consumers").
- **A `climb` command inside ui-measure.** Puts ranking and a model proposer into the model-free package;
  breaks its own rules.
- **Skill text only** ("run ui-measure and fix what it says first"). No revert on a round that made the
  measured count worse, no guard, and the agent ends up judging its own progress, which the skill exists
  to prevent.

## The seam

`ui-measure`'s interface (CLI arguments, exit codes, the report JSON from its spec) is the seam. ui-hill-climb
has two modules on its side:

- **`hill-measure`** finds the CLI and runs it for one screen. Deletion test: without it, the plugin-cache
  lookup, report naming, proposer retry and exit-code mapping would reappear as prose the agent follows
  by hand every round. It earns its place.
- **`hill-propose`** is a `command` proposer for ui-measure: it reads `{design, dom}` on stdin, asks Kimi
  for pairs through kimi-delegation, and prints a `Proposal`. The proposer seam already has two adapters in
  ui-measure (`recorded`, `command`), so this is an adapter at a real seam, not a new one.

`hill-score` gains no knowledge of browsers or Figma: it reads report files only, so its decisions are tested
with fixture JSON and no browser.

## Configuration

The project keeps its own `ui-measure.config.json` (ui-measure's format; it names targets, viewports, design
root font size and, for spec mode, the Figma node). The run directory gains `measure.json`, written before
round 1 next to the human-readable `screens.md`:

```json
{"config": "ui-measure.config.json",
 "screens": {"home": {"target": "home"},
             "card": {"target": "card", "figma": "12:34"},
             "list": {"target": "list", "node": "design/list.json", "proposal": "design/list.pairs.json"}}}
```

Keys of `screens` are the labels used for screenshots and judge files. `target` names a ui-measure target;
`figma` or `node` (one, optional) gives the design node and turns on spec mode; `proposal` (optional) is a
saved starting proposal. Paths are relative to the project root.

- A screen listed in `measure.json` is **measured**. A screen not listed is judge-only, and `scores.md` says
  so for that screen.
- No `measure.json` means the run behaves exactly as 0.1 does. Existing users lose nothing.

Ruling: a JSON manifest instead of new fields in `screens.md` — the scorer must know which reports to expect
so that a missing one makes the round not comparable instead of silently disappearing, and `screens.md` is
free-form prose — cost: one more file to write at setup.

## hill-measure

```
hill-measure --run DIR --round N [--label L]
```

Measures every screen in `DIR/measure.json`, or only `L`.

- Finds the CLI: `HILL_UI_MEASURE` if set, else the newest
  `~/.claude/plugins/cache/*/ui-measure/*/dist/ui-measure.mjs`. Not found: exit 2 with an install hint.
- Always runs `geometry`, writing `round-N/L.geometry.json`.
- With `figma` or `node`, also runs `spec`, writing `round-N/L.spec.json`.
- **Where the pairs come from.** ui-measure's report carries pair counts, not pairs, so the proposal itself
  is what gets saved. In order: the latest `round-K/L.proposal.json` from an earlier round; else the
  screen's `proposal` from `measure.json`; else a fresh one from `hill-propose`. A reused proposal is passed
  as `--proposer recorded --proposal FILE`; a fresh one runs `--proposer command -- hill-propose`, with
  `HILL_PROPOSAL_OUT=round-N/L.proposal.json` set so `hill-propose` saves the proposal it printed.
  Saving the raw, unverified proposal is enough: ui-measure verifies every pair again on every run.
- **Re-propose on drops.** When a reused proposal has more dropped pairs than the round it came from (the
  fixer changed the DOM, so `nth-child` selectors moved), hill-measure re-proposes once with `hill-propose`
  and keeps whichever report has fewer drops, with its proposal.
- Exit 0 when both reports were written, whatever their verdicts (mismatches and not-comparable are data
  for hill-score). Exit 2 bad input or CLI not found; exit 3 when ui-measure itself exits 3 (setup: no
  Playwright, unknown target); exit 75 passes through from kimi-delegation (quota).

Ruling: re-propose only when the reused proposal drops pairs — a fresh Kimi proposal every round costs
quota and adds a model's variance to a deterministic count — cost if wrong: a fix that restructures the DOM
without dropping pairs keeps stale-but-valid pairs, which the verifier has already accepted, so the numbers
stay right.

## hill-propose

Reads `{design, dom}` JSON on stdin, writes it to a work directory, and calls kimi-delegation read-only
(`--via kimi --final-only`, model from `HILL_JUDGE_MODEL`, default `kimi-code/k3.1-pro`, the same delegate
lookup as `hill-judge`). The prompt asks for pairs of design node id and DOM selector plus the unmapped
nodes, as one JSON object. It prints the first JSON object that parses as a `Proposal`, or exits 3 after two
unusable answers. When `HILL_PROPOSAL_OUT` is set it also writes the printed proposal to that path. It
never invents quantities: ui-measure's verifier checks every pair.

## Deciding a round

For each round hill-score computes, over measured screens:

- **fails**: the count of findings with status `fail` across `geometry` and `spec` reports;
- **comparable**: false if any measured screen's report has verdict `not_comparable` or is missing;
- **accepted**: the sum of `coverage.pairsAccepted` over spec reports.

Rounds are ranked by this key, best first:

1. comparable before not comparable;
2. **guard** not tripped before tripped (below);
3. fewer **fails**;
4. the judge's existing measure as the tie-break: relative score (reference mode) or fewer major deviations,
   then score (design mode).

`best_round` and `revert_to` use this key instead of the judge score alone. A not-comparable round is never
best: hill-score reports it as `"reason": "round N not comparable: <screen>: <reason>"` and the skill tells
the agent to fix the capture setup and measure again, not to fix code.

**The guard.** Fewer fails can be bought by deleting things: a removed element can't be clipped or
mis-padded. A round trips the guard when either:

- its **accepted** pair count is below the best earlier round's, on the same screens (a design element no
  longer has a counterpart); or
- the judge raises a **new major finding** in category `hierarchy` or `consistency` that no earlier round
  had (the judge sees an element gone 12 times in 12; this is its guard role).

A tripped round can't be best and is reported with the pairs or finding that tripped it.

**Stop**, in order:

- **done**: zero fails on every measured screen, and the judge's existing stop condition holds (design mode:
  no major deviation; reference mode: every screen beats the references);
- **no progress**: fails did not drop over the last two rounds and the judge gain over two rounds is under
  `--gain`;
- the round cap.

**open_findings** lists measured fails first, majors from the judge after. A measured finding's id is
`M-` plus a hash of `check|kind|selector|designNode`, so it stays stable across rounds while the element
stays put. Each carries `expected`, `actual` and `deltaPx` from the report. The agent records addressed
measured ids in `changes.json` under `addresses`, as for judge findings; unlike judge findings, an addressed
measured finding that is still measured as failing **stays open**: the measurement wins over the claim.

Ruling: measured fails all weigh the same, whatever their size or kind — a weighting would be a quantity
nobody has evidence for, and ui-measure reports every mismatch on purpose — cost if wrong: one padding change
that shifts four child boxes counts as five, so the loop over-rewards fixing cascades; known and named in the
rough edges of ui-measure's verification guide.

Ruling: the guard uses accepted pairs plus new judge majors, not a DOM element count — ui-measure reports no
element inventory, and adding one changes the package (out of scope) — cost if wrong: a geometry-only screen
(no design node) is guarded by the judge alone.

## scores.md

Adds per round: a **measured** table (screen, fails by check, verdict, pairs accepted/proposed) above the
judge table, the ranking key, and the guard result. A screen without `measure:` shows "judge only". The
handover's limits gain one line: measurement covers geometry and the spec properties ui-measure lists; the
judge still covers the rest.

## SKILL.md changes

- *Before round 1*: if the project has (or can add) `ui-measure.config.json`, write `measure.json`;
  point to the ui-measure skill for the config shape. Install note: ui-measure plugin, plus Playwright in
  the project.
- *Each round*, step 2 becomes **Measure**: `hill-measure` per measured screen, before judging; the
  `impeccable detect` pass stays optional after it.
- *Fix*: measured findings first. They are exact: `expected` says the value the design holds.
- *Rules*: never edit `ui-measure.config.json`, the design node or a saved proposal to make a count drop; a
  wrong config goes to the handover. Never delete or hide an element to clear a finding.
- Description and plugin.json: mention the optional ui-measure dependency. Version 0.2.0, changelog entry.

## ui-measure skill text

ui-measure's SKILL.md names a `scripts/kimi-proposer.mjs` that doesn't exist. It changes to point at
ui-hill-climb's `hill-propose` as the ready-made Kimi proposer. This is a text fix on PR #1's branch, not a
package change.

## Errors

| condition | behaviour |
| --- | --- |
| `measure.json` present, ui-measure not installed | hill-measure exits 2; the skill stops before round 1 and says to install it or remove `measure.json` |
| `measure.json` names a label with no screenshot or a target the config lacks | exit 2 (label) or 3 (target, from ui-measure) before any judging |
| no Playwright in the project | ui-measure exits 3; hill-measure passes 3 through with its message |
| a measured screen's report missing from a round | that round is not comparable |
| Kimi quota spent during a proposal | exit 75, the skill stops and reports, as for the judge |
| `hill-propose` unusable twice | exit 3; the screen's spec report is missing, so the round is not comparable |

## Testing

- `hill-score`, with fixture reports and no browser:
  - fewer fails beats a higher judge score;
  - equal fails fall back to the judge;
  - a not-comparable round is never best;
  - fewer accepted pairs trips the guard, and so does a new hierarchy major;
  - a missing report for a screen listed in `measure.json` makes the round not comparable;
  - stop "done" needs zero fails and the judge condition;
  - an addressed measured finding still failing stays open;
  - a run with no measured screens reproduces 0.1's decisions on 0.1's existing test fixtures.
- `hill-measure`, against a stub CLI (`HILL_UI_MEASURE` pointing at a script that prints canned reports and
  exits 0/1/2/3):
  - exit-code mapping;
  - report names;
  - the proposal order (earlier round, then `measure.json`, then fresh), `HILL_PROPOSAL_OUT` saving, and the
    single re-propose when drops rise (with a stub `hill-propose`).
- `hill-propose`, against a stub delegate:
  - JSON extraction;
  - two unusable answers give exit 3.
- One end-to-end run in the manual verification guide: ui-measure's fixture card with its padding defect, a
  fixer that changes the padding, the measured count going from 7 to 0.

## Open items

- The rulings above (the manifest, re-propose on drops, equal weights, the guard's two signals).
- The builder check (Kimi K3.1 Pro) asked two questions; both are settled above (saving the raw proposal, the
  manifest). Its answer is kept locally.
- Recall is still unmeasured: this spec makes the loop act on measurements; whether that catches what
  designers catch is the private evaluation's question, with its bar registered before the run.
- The judge's prompts are unchanged; telling it to skip what measurement covers waits for the read-alone A/B.
