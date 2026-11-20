---
name: ui-hill-climb
description: Use when an app's UI should look better and the result must be judged by someone other than the agent that built it - polishing screens against the product's best screens or competitors, "make this look like a real product", design QA before a UI merge request, or a designer's taste rules that keep being missed. Needs a running app the agent can screenshot and the kimi-delegation plugin 1.3.2 or later.
---

# UI hill-climb

Screenshot the real app, have an outside judge score it against reference screens, fix the worst findings,
recapture, repeat. The judge never sees the code, and you never score your own work: agents rate their own
UI high.

`$HC` below is this skill's directory; the scripts are in `$HC/scripts/`.

## Before round 1

1. **Run directory:** `.hill/<YYYY-MM-DD>-<slug>/` in the project. Add `.hill/` to `.gitignore` if it isn't.
2. **Screens:** for each one, a label (`home`, `device-card`), its URL or route, the viewport, and the
   data state it needs. Write them to `screens.md` in the run directory. The viewport is the real device's,
   from the design file or the owner. If nobody has said what it is, ask: a wrong viewport produces
   findings like "the button is below the fold" that aren't defects.
3. **References:** 1–3 screens that set the bar: the product's own best screens, its Figma frames, or
   competitors'. Save them under `refs/`. No references means the judge falls back to "well-made products
   of this kind". Say so in the handover, because then drift can't be measured.
4. **Constraints:** the owner's taste rules in `constraints.md`, copied from the project's `DESIGN.md`,
   brand guide or design file. Never write rules of your own: the judge enforces whatever is in that file,
   so a guessed "brand colour" turns the designer's real choices into findings. With no source, leave it empty.
5. **Mode:** a person in the session means **human-piloted**. Headless, CI or a scheduled run means
   **agent-piloted**.
6. **Branch:** work on a branch, and commit each round's code as `hill: round N` so you can return to the best round.

## Each round

1. **Capture fresh.** After your last edit and a rebuild, screenshot every screen into
   `round-N/<label>.png` with the agent-browser skill (open the URL, set the viewport, screenshot). Never reuse
   an older capture.
2. **Deterministic pass, if available.** If `npx impeccable detect <url> --json` runs, fix what it reports
   first. Judges can't overrule it.
3. **Judge.** For each screen, and for each reference every round (the references are the drift control):
   ```bash
   python3 "$HC/scripts/hill-judge" --screen round-N/home.png --label home \
     --reference refs/best-1.png --constraints constraints.md --out round-N
   python3 "$HC/scripts/hill-judge" --screen refs/best-1.png --label ref-best-1 \
     --constraints constraints.md --out round-N
   ```
   Exit 2 is bad input: capture again. Exit 3 means the judge's answer was unusable twice: rerun it once,
   then stop and report. Exit 75 means the quota ran out: stop and report.
4. **Score:** `python3 "$HC/scripts/hill-score" --run .hill/<run>` prints the decision and writes `scores.md`.
5. **If `revert_to` is set,** the last round made things worse. Restore that round's code before doing anything else.
6. **If `stop` is true,** go to *Handover*.
7. **Otherwise fix.** Work from `open_findings`, majors first, a few per round. For each change, append an
   entry to `round-(N+1)/changes.json`:
   ```json
   {"id": "C-3", "screen": "home", "before": "round-N/home.png", "after": "round-(N+1)/home.png",
    "after_size": {"w": 1280, "h": 800}, "region": {"x": 40, "y": 600, "w": 300, "h": 64},
    "rationale": "one line", "categories": ["spacing"], "addresses": ["F-1a2b3c4d"]}
   ```
   `region` is in after-image pixels. `addresses` lists the finding IDs the change answers, and a finding
   that's been addressed is never raised again. Keep the same `id` if you revise a change in a later round.
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
  screen beats the references in every category.
- A score change smaller than a screen's *spread* in `scores.md` is noise.

## Handover

End on the best round's code. Hand over `scores.md`, `references.json` and every round's `changes.json`,
plus before/after screenshots of the best round. Agent-piloted runs open a pull request with them in it and
never merge (see superpowers:finishing-a-development-branch). State the limits below in the handover.

## Limits (v0)

- **One judge provider:** Kimi `k3.1-pro`. Kimi doesn't report which model actually answered, so only the
  requested ID is known.
- **Recall is unmeasured.** Whether the judge catches what designers catch is still being tested. In one
  product's review lists, about 10% of the items were visual, and this loop sees only that slice.
- It judges what it can see in a still screenshot: not motion, timing, interaction or copy.
