---
name: ui-hill-climb
description: Use when an app's UI should look better and the result must be judged by someone other than the agent that built it - polishing screens against the product's best screens or competitors, "make this look like a real product", design QA before a UI merge request, or a designer's taste rules that keep being missed. Needs a running app the agent can screenshot and a second model it can call (Kimi, Claude, Codex or any command); optionally ui-measure for exact counts.
---

# UI hill-climb

Screenshot the real app, have an outside judge score it against reference screens, fix the worst findings,
recapture, repeat. The judge never sees the code, and you never score your own work: agents rate their own
UI high.

`$HC` below is this skill's directory; the scripts are in `$HC/scripts/`.

**Which model judges.** `HILL_RUNNER` picks how a prompt reaches a model: `kimi` (the default, through
kimi-delegation 1.3.2+), `claude` (`claude -p` with read-only tools, in the work directory), `codex`
(`codex exec`, each screenshot attached) or `command` (`HILL_RUNNER_CMD`, an argv that reads the prompt on stdin
and prints the answer). `HILL_JUDGE_MODEL` names the model for runners that take one; on `claude` and `codex` it
is passed only when you set it, and otherwise the CLI's own default answers. The judge runs on a different model
from the builder: nothing enforces that, so pick the runner with it in mind. Every judgement file records a
provenance line (`runner=<name> model=<model or default> cmd=<program>`; on Kimi, the delegate's own line), so the
handover can say which model judged. Exit 75 (quota) comes only from the Kimi runner; any other runner's failure
is exit 1.

A screen built with ui-measure's build-time workflow already has its pairs: `hill-measure` picks up
`.ui-measure/pairs/<target>.json` next to the config (or the screen's `proposal`, which wins), uses it in round 1
and never asks a model to pair.

**Light mode.** On a project run on light mode (task cards, a reader per screen card, the stop cord), read
`light-mode.md` in this directory before round 1: it places the climb and ui-measure in a card, names the look
target as the design, and ties the climb's stops to the stop cord.

## Before round 1

1. **Run directory:** `.hill/<YYYY-MM-DD>-<slug>/` in the project. Add `.hill/` to `.gitignore` if it isn't.
2. **Screens:** for each one, a label (`home`, `device-card`), its URL or route, the viewport, and the
   data state it needs. Write them to `screens.md` in the run directory. The viewport is the real device's,
   from the design file or the owner. If nobody has said what it is, ask: a wrong viewport produces
   findings like "the button is below the fold" that aren't defects.
3. **Design or references:** if a screen has an approved design frame (Figma or similar), export it at the
   viewport size into `refs/` and run in **design mode**: the judge scores fidelity to the frame and lists
   deviations. Otherwise pick 1–3 **references** that set the bar: the product's own best screens or
   competitors'. No references means the judge falls back to "well-made products of this kind". Say so in
   the handover, because then drift can't be measured.
4. **Constraints:** the owner's taste rules in `constraints.md`, copied from the project's `DESIGN.md`,
   brand guide or design file. Never write rules of your own: the judge enforces whatever is in that file,
   so a guessed "brand colour" turns the designer's real choices into findings. With no source, leave it empty.
5. **Mode:** a person in the session means **human-piloted**. Headless, CI or a scheduled run means
   **agent-piloted**.
6. **Measured screens (optional).** If the project has, or can add, a `ui-measure.config.json`, write
   `measure.json` in the run directory. It makes the loop climb on exact counts from the ui-measure plugin
   (rendered geometry, and boxes/spacing/colours/fonts against the design) before the judge's scores.
   See the ui-measure skill for the config. Needs the ui-measure plugin installed (or `HILL_UI_MEASURE` set
   to its `dist/ui-measure.mjs`) and Playwright in the project. Without `measure.json` nothing below
   changes. Shape:
   ```json
   {"config": "ui-measure.config.json",
    "screens": {"home": {"target": "home"},
                "device-card": {"target": "device-card", "figma": "12:34"}}}
   ```
   Keys under `screens` are the screen labels you screenshot. Per screen, `target` (the config's target)
   is required; `figma` (a Figma node ID such as `12:34`) or `node` (a saved design-node JSON file) is optional and mutually
   exclusive, and adds the spec check against the design; `proposal` (optional, a saved pairs file) skips
   the model's design-to-DOM pairing. A screen without `figma`/`node` gets the geometry check only. Any other
   key is an error. Paths are relative to where you run the scripts.
7. **Branch:** work on a branch, and commit each round's code as `hill: round N` so you can return to the best round.

## Each round

1. **Capture fresh.** After your last edit and a rebuild, screenshot every screen into
   `round-N/<label>.png` with the agent-browser skill (open the URL, set the viewport, screenshot). Never reuse
   an older capture.
2. **Measure** (only with `measure.json`), before judging, with the screenshots from step 1 in place:
   ```bash
   python3 "$HC/scripts/hill-measure" --run .hill/<run> --round N          # every measured screen
   python3 "$HC/scripts/hill-measure" --run .hill/<run> --round N --label home   # one screen
   ```
   It writes `round-N/<label>.geometry.json` and, for screens with a design, `<label>.spec.json` and
   `<label>.proposal.json`. Later rounds reuse the latest saved proposal; if it drops more pairs than the
   round it came from, `hill-measure` proposes once more and keeps whichever result drops fewer. Exit 0: written. Exit 2: bad input (a malformed `measure.json`, an unknown `--label`, a missing
   screenshot, or ui-measure not installed): fix it and rerun. Exit 3: setup problem (the app isn't
   running, the config or target is wrong, the browser won't launch): fix the setup, don't judge. If the proposer's
   pairing answer is unusable twice, `hill-measure` still exits 0 but writes no `<label>.spec.json`, so
   `hill-score` marks the round not comparable: measure again (or give the screen a `proposal` in
   `measure.json`) rather than judge. A round without its reports is never comparable. Exit 75: the Kimi quota ran out (kimi runner only): stop
   and report.
   Then, if `npx impeccable detect <url> --json` runs, fix what it reports. Judges can't overrule it.
3. **Judge.** For each screen, and for each reference every round (the references are the drift control):
   ```bash
   python3 "$HC/scripts/hill-judge" --screen round-N/home.png --label home \
     --reference refs/best-1.png --constraints constraints.md --out round-N
   python3 "$HC/scripts/hill-judge" --screen refs/best-1.png --label ref-best-1 \
     --constraints constraints.md --out round-N
   ```
   In design mode pass `--design refs/<frame>.png` instead of `--reference`, for the screen and for the frame
   itself (label `ref-<frame>`). The frame against itself is the noise floor: it should score near 10 with no
   findings, and if it doesn't, the judge is unreliable on this screen.
   Exit 2 is bad input: capture again. Exit 3 means the judge's answer was unusable twice: rerun it once,
   then stop and report. Exit 75 means the quota ran out: stop and report.
4. **Score:** `python3 "$HC/scripts/hill-score" --run .hill/<run>` prints the decision and writes `scores.md`.
   With `measure.json` it also prints a `measured` block (`fails`, `comparable`, `accepted`, `guard`) and
   `scores.md` gets a Measured table. Rounds are ranked by: comparable, no guard tripped, fewer measured
   fails, then the judge. Stop needs zero measured fails. If the current round is not comparable the reason
   is in the output: fix the setup and rerun step 2. The guard compares each spec screen's accepted pairs
   with the best earlier round that is comparable and unguarded, and trips when any screen has fewer.
   `best_round` is `null` when no round is comparable and unguarded: there is no round to keep, so fix the
   measurement (step 2) and hand over without naming a best round. The round cap still stops the run.
5. **If `revert_to` is set,** the last round made things worse. Restore that round's code before doing anything else.
6. **If `stop` is true,** go to *Handover*.
7. **Otherwise fix.** Work from `open_findings`: measured findings (ids `M-xxxxxxxx`) come first, then the
   judge's, majors first, a few per round. A measured finding is exact: `expected` is the design's value,
   `actual` what the page renders, `deltaPx` the gap; change the code until they match. For each change, append an
   entry to `round-(N+1)/changes.json`:
   ```json
   {"id": "C-3", "screen": "home", "before": "round-N/home.png", "after": "round-(N+1)/home.png",
    "after_size": {"w": 1280, "h": 800}, "region": {"x": 40, "y": 600, "w": 300, "h": 64},
    "rationale": "one line", "categories": ["spacing"], "addresses": ["F-1a2b3c4d"]}
   ```
   `region` is in after-image pixels. `addresses` lists the finding IDs the change answers, and a finding
   that's been addressed is never raised again (judge findings use `F-` ids). Record `M-` ids in `addresses`
   too, for traceability, but a measured finding stays open until the measurement passes. Keep the same `id` if you revise a change in a later round.
   Then go back to step 1.

**Human-piloted:** after step 4, show the person the `scores.md` table and each before/after pair, then ask
with your question tool whether to continue, add a taste rule to `constraints.md`, or stop. They can raise
the round cap (`--cap`). Their veto beats any score.

**Agent-piloted:** ask nothing. The constraints file written before the run is the only taste input.

## Rules

- Never tell a judge a target score, and never show it the code or your rationale.
- Don't argue with a finding by rescoring. Fix it, or record in the handover why you left it.
- A finding that would change a design decision (a colour, a layout, copy that the design file shows) goes to
  the handover for the designer, not into the code.
- The default cap is 3 rounds. The run also stops when the gain over two rounds is under 0.3, or when every
  screen beats the references in every category (design mode: when no major deviation is left).
- Never edit `ui-measure.config.json`, the design node or a saved proposal to make a count drop. A wrong
  config goes to the handover.
- Never delete or hide an element to clear a finding.
- In design mode the frame wins. A deviation that the code can fix is fixed; if the frame looks wrong or
  outdated, it goes to the handover for the designer.
- A score change smaller than a screen's *spread* in `scores.md` is noise.

## Handover

End on the best round's code. Hand over `scores.md`, `references.json` and every round's `changes.json`,
plus before/after screenshots of the best round. Agent-piloted runs open a pull request with them in it and
never merge (see superpowers:finishing-a-development-branch). State the limits below in the handover.

## Limits

- **One judge per run, and its answer is only as known as the provenance line.** Kimi doesn't report which model
  actually answered, so on that runner only the requested ID is known; on the other runners the line records the
  runner and the model you set (or `default`).
- **Recall is unmeasured.** Whether the judge catches what designers catch is still being tested. In one
  product's review lists, about 10% of the items were visual, and this loop sees only that slice.
- It judges what it can see in a still screenshot: not motion, timing, interaction or copy.
- **Measurement covers only the screens and elements in `measure.json`.** A clean count says nothing about
  the rest. With a design, only the elements the pairing matched are compared (`accepted` in the output;
  unmatched ones are dropped, not failed). State the coverage in the handover.
