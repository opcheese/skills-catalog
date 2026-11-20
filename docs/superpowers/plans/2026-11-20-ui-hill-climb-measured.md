# ui-hill-climb 0.2 (measured climbing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ui-hill-climb measures each screen with ui-measure before judging and ranks rounds on the measured
failure count, with a guard against deleting elements and the judge as tie-break.

**Architecture:** Two new adapter scripts (`hill-measure` runs the ui-measure CLI per screen and files its
reports in the round directory; `hill-propose` is a Kimi `command` proposer) and a new ranking in
`hill-score`, which stays a pure function of the run directory. A small shared module `hilllib.py` holds
the kimi-delegation lookup that `hill-judge` and `hill-propose` both need.

**Tech Stack:** Python 3 standard library, bash tests with fake executables, the `ui-measure` 0.1.0 CLI
(Node 24, Playwright) only in the end-to-end test.

**Spec:** `docs/superpowers/specs/2026-11-20-ui-hill-climb-measured-design.md` (read it; this plan argues
from it). ui-measure's report shape: `docs/superpowers/specs/2026-11-20-ui-measure-design.md`, *Data shapes*.

**Branch:** `feat/hill-measured`, cut from `feat/ui-measure` (PR #1), worktree `~/w/skills-catalog-hill-measured`.
Ruling: stack on PR #1 — the ui-measure skill-text fix and the end-to-end test need its files — cost: PR #2
waits for PR #1 or is retargeted after it merges.

Ruling: hill-propose reports its exit code in `$HILL_PROPOSAL_OUT.status` — ui-measure wraps a proposer's
failure into its own exit 3, so hill-measure can't otherwise tell a quota stop (75) from an unusable answer (3),
which the spec treats differently — cost: one sidecar file per fresh proposal.

## Global Constraints

- Scripts are Python 3, standard library only, no file extension, executable, invoked as
  `python3 "$HC/scripts/<name>"`. Shared code lives in `scripts/hilllib.py`, imported after
  `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))`.
- Exit codes everywhere: 0 ok, 2 bad input or ui-measure not found, 3 setup error or unusable model answer
  twice, 75 Kimi quota spent (passed through).
- Judge/proposer model: `HILL_JUDGE_MODEL`, default `kimi-code/k3.1-pro`; delegate path override
  `HILL_KIMI_DELEGATE`. ui-measure CLI override `HILL_UI_MEASURE`, else the newest
  `~/.claude/plugins/cache/*/ui-measure/*/dist/ui-measure.mjs`.
- `measure.json` lives at `<run>/measure.json`, shape exactly:
  `{"config": PATH, "screens": {LABEL: {"target": T, "figma"?: NODE_ID, "node"?: PATH, "proposal"?: PATH}}}`.
  `figma` and `node` are mutually exclusive. Paths are relative to the current directory (the project root).
- Per round, per measured screen: `round-N/<label>.geometry.json`, `round-N/<label>.spec.json` (spec mode only),
  `round-N/<label>.proposal.json` (spec mode only).
- Measured finding id: `"M-" + sha1(f"{check}|{kind}|{selector}|{designNode or ''}").hexdigest()[:8]`.
- No `measure.json` → every decision and output identical to 0.1.3.
- Tests are hermetic: no network, no Kimi, no browser. The one end-to-end test skips (exit 0, prints `skip`)
  unless `HILL_UI_MEASURE` is set and runs.
- Public repo: no client names, Figma file keys or credentials in code, fixtures or commits. Before each
  commit: `git diff --cached | grep -i -f .superpowers/public-denylist.txt` prints nothing.
- Conventional commits; trailer per the session's attribution lines.
- Plugin version `0.2.0` in `plugin.json` and `.claude-plugin/marketplace.json`.

## Review Focus

- `measure.json` that is not JSON, names an unknown key, or gives both `figma` and `node`: hill-measure and
  hill-score both exit 2 naming the file and the problem (tests in Tasks 2 and 3).
- A round directory that lacks a measured screen's report (capture skipped, crash): the round is not
  comparable with the screen named, hill-score does not crash (Task 3).
- Geometry findings have no `designNode`: their `M-` id is still stable across rounds (Task 3).
- Round 1 has nothing earlier: the guard never trips on it (Task 3).
- `measure.json` added mid-run: earlier rounds without reports are not comparable, so they are never best,
  and the reason says reports are missing for that round (Task 3).

---

### Task 1: hilllib and hill-propose

**Files:**
- Create: `plugins/ui-hill-climb/skills/ui-hill-climb/scripts/hilllib.py`
- Create: `plugins/ui-hill-climb/skills/ui-hill-climb/scripts/hill-propose`
- Modify: `plugins/ui-hill-climb/skills/ui-hill-climb/scripts/hill-judge` (use hilllib)
- Test: `plugins/ui-hill-climb/skills/ui-hill-climb/tests/test-measure.sh` (new; hill-propose section)

**Interfaces:**
- Produces: `hilllib.find_delegate() -> str` (moved verbatim from hill-judge, including the
  `ReadMediaFile` check and exit 2 messages); `hilllib.first_json(text: str, accept: Callable[[dict], bool]) -> dict | None`
  (first JSON object in `text` that `accept` returns true for; hill-judge's `parse_answer` uses it);
  `hilllib.DEFAULT_MODEL = "kimi-code/k3.1-pro"`.
- Produces: `hill-propose` reads `{design, dom}` JSON on stdin, prints one Proposal
  `{"pairs": [{"nodeId": str, "selector": str}], "unmapped": {"design": [str], "impl": [str]}}`, and when
  `HILL_PROPOSAL_OUT` is set writes the same JSON to that path and its exit code to `$HILL_PROPOSAL_OUT.status`.

- [ ] **Step 1: Write the failing tests** in `test-measure.sh`, reusing the fake-delegate pattern from
  `test-hill.sh` (copy its `ok/bad/check_*` helpers and fake delegate):
  - `hill-propose: a good answer` — fake answer is prose plus the proposal JSON; stdout parses to the same
    pairs; exit 0; the fake's log shows `--via kimi`, `--final-only` and `MODEL=kimi-code/k3.1-pro`.
  - `hill-propose: saves when asked` — with `HILL_PROPOSAL_OUT=$WORK/p.json`, the file equals stdout and
    `p.json.status` holds `0`.
  - `hill-propose: unusable twice` — two answers without a Proposal: exit 3, two delegate calls,
    status file holds `3`.
  - `hill-propose: quota` — fake exits 75: hill-propose exits 75, status file holds `75`.
  - `hill-propose: bad stdin` — stdin not JSON or missing `design`/`dom`: exit 2, no delegate call.
- [ ] **Step 2: Run** `bash tests/test-measure.sh` — expect FAIL (no hill-propose).
- [ ] **Step 3: Move `find_delegate` into `hilllib.py`, add `first_json`, make hill-judge import both.**
  Run `bash tests/test-hill.sh`: every existing test still passes.
- [ ] **Step 4: Implement `hill-propose`.** It writes `design.json` and `dom.json` into a temp work directory
  and calls the delegate with `--via kimi --final-only --cwd WORK`. Prompt (exact intent, wording free):
  the two files hold a Figma node tree and a DOM tree; pair each design node with the DOM element that
  renders it, by type, text and reading order; list design nodes and DOM selectors with no counterpart under
  `unmapped`; never pair one element twice; answer with one JSON object in the Proposal shape and nothing
  else. Accept an object only if `pairs` is a list of `{nodeId, selector}` strings and `unmapped` has
  `design` and `impl` string lists. Two attempts, then exit 3.
- [ ] **Step 5: Run both test files** — all pass.
- [ ] **Step 6: Commit** `feat(ui-hill-climb): hill-propose, a Kimi pair proposer for ui-measure`.

### Task 2: hill-measure

**Files:**
- Create: `plugins/ui-hill-climb/skills/ui-hill-climb/scripts/hill-measure`
- Modify: `scripts/hilllib.py` (add `load_measure`, `find_ui_measure`)
- Test: `tests/test-measure.sh` (hill-measure section)

**Interfaces:**
- Consumes: `hill-propose` (Task 1), invoked as `python3 <scripts>/hill-propose`, path overridable by
  `HILL_PROPOSE` (tests point it at a stub).
- Produces: `hilllib.load_measure(run_dir: str) -> dict | None` (None when `measure.json` is absent; exits 2
  on malformed input as listed in Review Focus); `hilllib.find_ui_measure() -> str` (exit 2 with
  "install the ui-measure plugin, or set HILL_UI_MEASURE" when nothing is found).
- Produces: `hill-measure --run DIR --round N [--label L]`, files named per Global Constraints.

- [ ] **Step 1: Write the failing tests.** A stub CLI (`HILL_UI_MEASURE=$WORK/stub-um`, an executable shell
  script run directly when it doesn't end in `.mjs`; otherwise `node FILE`) logs its argv, writes the canned
  report named by `STUB_REPORT_<check>` to the path after `--json`, and exits `STUB_EXIT_<check>`. When the
  argv contains `--proposer command`, the stub runs the command after `--` with a canned `{design, dom}` on
  stdin, like ui-measure does. Tests:
  - `geometry only` — screen with `target` only: one stub call with `geometry --config C --target T --json round-1/home.geometry.json`; no spec call; exit 0.
  - `exit 1 and 2 are data` — stub exits 1, then 2 (report still written): hill-measure exits 0 both times.
  - `setup error` — stub exits 3: hill-measure exits 3 and prints the stub's stderr.
  - `not installed` — `HILL_UI_MEASURE` unset and an empty `HOME`: exit 2 with the install hint.
  - `spec, fresh proposal` — screen with `node`: spec call has `--node FILE --proposer command -- python3 <HILL_PROPOSE>`,
    `HILL_PROPOSAL_OUT=round-1/card.proposal.json` reaches the proposer, and the proposal file exists after.
  - `spec, reuse` — round 2 with `round-1/card.proposal.json` present: spec call uses
    `--proposer recorded --proposal round-1/card.proposal.json`; `round-2/card.proposal.json` is a copy.
  - `spec, manifest proposal` — round 1 with `proposal` in measure.json: used as recorded; no re-propose even
    if `dropped > 0`.
  - `re-propose on drops` — round 2 reuse gives `coverage.dropped` 2, round 1 had 0: a second spec call with
    the command proposer; the report and proposal with fewer drops are kept (test both orders).
  - `proposer unusable` — stub proposer writes status `3`, ui-measure stub exits 3: no `card.spec.json`
    written, hill-measure exits 0.
  - `proposer quota` — status `75`: hill-measure exits 75.
  - `--label` — measures only that screen.
  - `figma` — `--figma 12:34` passed instead of `--node`.
  - malformed `measure.json` (three cases from Review Focus), and an unknown `--label`: exit 2.
  - a label in `measure.json` with no `round-N/<label>.png`: exit 2 naming the label (spec, *Errors*).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.** Run each CLI call with `cwd` = current directory. Re-propose writes the second
  attempt to temporary names, then renames the winner into place (ties keep the reused proposal).
- [ ] **Step 4: Run** `bash tests/test-measure.sh` and `bash tests/test-hill.sh` — all pass.
- [ ] **Step 5: Commit** `feat(ui-hill-climb): hill-measure runs ui-measure per screen`.

### Task 3: hill-score ranks on measured counts

**Files:**
- Modify: `plugins/ui-hill-climb/skills/ui-hill-climb/scripts/hill-score`
- Test: `tests/test-score-measured.sh` (new)

**Interfaces:**
- Consumes: `hilllib.load_measure` (Task 2), the report files named in Global Constraints.
- Produces: hill-score's printed JSON gains `"measured": {"fails": int, "comparable": bool, "accepted": int,
  "guard": null | str}` for the current round; `open_findings` entries for measured fails carry
  `{"id": "M-…", "screen", "check", "kind", "selector", "designNode", "expected", "actual", "deltaPx", "severity": "major"}`.
  Without `measure.json` the output has no `measured` key and is byte-identical to 0.1.3 for the same inputs.

- [ ] **Step 1: Write the failing tests.** Build rounds by hand: judge JSONs as in `test-hill.sh`, plus report
  JSONs with `findings` (status `fail`/`pass`/`not_comparable`), `coverage` and `verdict`.
  - `fewer fails beats a higher judge score` — round 1 judge 7.0 fails 4; round 2 judge 6.0 fails 1:
    best_round 2, no revert.
  - `more fails reverts` — round 2 fails 1, round 3 fails 3 with higher judge score: `revert_to` 2.
  - `equal fails fall back to the judge` — fails equal: the judge's relative score decides, as in 0.1.
  - `not comparable is never best` — round 2 has one `not_comparable` verdict and 0 fails: best_round 1;
    reason contains `round 2 not comparable: card:`.
  - `missing report` — a measured screen's `geometry.json` absent in round 2: not comparable, reason names
    `card` and the missing file.
  - `guard: fewer accepted pairs` — round 2 accepted 2 vs round 1 accepted 3, fails 0: guard set, best_round 1;
    `measured.guard` names the screen and both counts.
  - `guard: new hierarchy major` — round 2 judge adds a major `hierarchy` finding on an element no earlier
    round had: guard set. A major `spacing` finding does not trip it.
  - `guard never trips on round 1`.
  - `stop done` — design mode, 0 fails, no judge majors: `stop` true, reason `no measured failures and no major deviations from the design`.
    0 fails with a judge major: continue.
  - `stop no progress` — three rounds, fails 2, 2, 2, judge gain 0.1: stop with reason naming both.
  - `addressed but still failing stays open` — `changes.json` addresses `M-…`, the round still measures it
    failing: it is in `open_findings`; an addressed judge finding is still dropped as in 0.1.
  - `M- id stable without designNode` — the same geometry finding in rounds 1 and 2 gets the same id.
  - `open_findings order` — measured first, then judge majors, then judge minors.
  - `scores.md` — contains a `Measured` table with `fails`, `verdict`, `pairs`, and `judge only` for a screen
    not in `measure.json`.
  - `no measure.json` — run `test-hill.sh`'s round fixtures through both the old (`git show HEAD:…/hill-score`)
    and new script: identical stdout and `scores.md`.
  - `measure.json added mid-run` — round 1 has no reports: reason for round 1 says reports are missing;
    round 2 measured is best.
  - malformed `measure.json`: exit 2.
- [ ] **Step 2: Run** `bash tests/test-score-measured.sh` — expect FAIL.
- [ ] **Step 3: Implement.** Rank key per the spec's *Deciding a round*, best first:
  `(comparable, not guard_tripped, -fails, judge_key)`, where `judge_key` is 0.1's existing measure
  (relative score in reference mode; in design mode `(-major_count, score)`). `best_round` is the max of the
  key; `revert_to` is set when the last round's key is below the previous round's. Guard compares
  `accepted` against the best earlier comparable round and judge majors against every earlier round's
  findings using the existing `Registry` ids. Stop order: done, no progress, cap.
- [ ] **Step 4: Run** all three test files — all pass.
- [ ] **Step 5: Commit** `feat(ui-hill-climb): rank rounds on measured failures with a deletion guard`.

### Task 4: Skill text, versions, ui-measure pointer

**Files:**
- Modify: `plugins/ui-hill-climb/skills/ui-hill-climb/SKILL.md`
- Modify: `plugins/ui-hill-climb/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (version
  `0.2.0`, descriptions mention optional ui-measure)
- Modify: `plugins/ui-measure/skills/ui-measure/SKILL.md` (replace the nonexistent `scripts/kimi-proposer.mjs`
  with ui-hill-climb's `hill-propose`)
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Edit SKILL.md** per the spec's *SKILL.md changes*: `measure.json` in *Before round 1* with
  the exact shape and one example; step 2 of *Each round* becomes **Measure** with the `hill-measure`
  command, its exits, and "exit 3: fix the setup, don't judge"; *Fix* puts measured findings first and says
  `expected` is the design's value; *Rules* add "never edit `ui-measure.config.json`, the design node or a
  saved proposal to make a count drop" and "never delete or hide an element to clear a finding"; *Limits*
  gets the measurement-coverage line. Keep the description under 500 characters.
- [ ] **Step 2: Check** the skill still tells a reader everything `hill-measure --help` and the three tests
  need: run `bash tests/test-*.sh` (unchanged, all pass) and `wc -w SKILL.md` (report the number; no target).
- [ ] **Step 3: Versions, changelog entry** `## 2026-11-20: ui-hill-climb 0.2.0, climbing on measured counts`.
- [ ] **Step 4: Commit** `feat(ui-hill-climb): skill text for measured climbing, 0.2.0`.

### Task 5: End-to-end test and manual verification guide

**Files:**
- Create: `plugins/ui-hill-climb/skills/ui-hill-climb/tests/test-e2e-measure.sh`
- Create: `docs/verification/2026-11-20-ui-hill-climb-measured.md`

**Interfaces:**
- Consumes: the real ui-measure CLI (`HILL_UI_MEASURE=…/plugins/ui-measure/dist/ui-measure.mjs`) and its
  fixtures `plugins/ui-measure/test/fixtures/pages/card-padding.html`, `card-clean.html`,
  `figma/card.json`, `card-proposal.json`.

- [ ] **Step 1: Write the test.** Skip unless `HILL_UI_MEASURE` runs. Serve `plugins/ui-measure/test/fixtures/pages`
  with `python3 -m http.server` on a free port; write a ui-measure config with a target `card` whose URL is
  `card-padding.html` in round 1 and `card-clean.html` in round 2 (two configs, `measure.json` switched
  between rounds by the test, standing in for the fixer); `measure.json` gives `node` and `proposal`; hand-written
  judge JSONs with equal scores. Assert: round 1 `measured.fails` 7; round 2 `measured.fails` 0, comparable,
  guard null, best_round 2.
- [ ] **Step 2: Run** with `HILL_UI_MEASURE` set to the built CLI — passes; without it — prints `skip`, exit 0.
- [ ] **Step 3: Write the guide** with the documentation-hygiene frontmatter: setup (install, build ui-measure,
  serve fixtures), happy path (the e2e by hand, showing `scores.md`'s Measured table), edge cases (missing
  report, not-comparable round, guard trip by deleting a child from the page, no `measure.json`), round trip
  (revert to the best round). Every command run once by the author, outputs pasted as expected values.
- [ ] **Step 4: Commit** `test(ui-hill-climb): end-to-end measured round, and manual checks`.
