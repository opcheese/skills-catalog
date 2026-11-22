# Running the UI skills inside light mode

For projects run on light mode: a PM (the intent-holder) holds the look, an AI coordinator writes task cards and
starts builders, one fresh reader closes each screen card, and the stop cord halts the run on named triggers. A
facelift is mostly screen cards, and this page says where the two UI skills fit in them: **ui-measure** (exact
numbers from a real browser, no model judging) and **ui-hill-climb** (an outside judge scores screenshots against
the look target, and the builder fixes the worst). Where this page says nothing, each skill's *SKILL.md* applies
unchanged.

## Which tool for which card

| The card has | Use | What it gives |
| --- | --- | --- |
| any screen change | ui-measure `geometry` | text clipped or zero-size, elements off-canvas, text flush against its container's edge, scrollbars where the config says none. No design needed. Run it on every facelift card |
| a Figma frame as its look target (paid seat with the Figma MCP, or an exported node JSON) | ui-measure's *Building from Figma*, then `spec` | boxes, gaps, padding, radius, borders, colours, fonts and shadows against the frame, in pixels |
| only an image of the target (a PNG export, a screenshot of an HTML mock) | ui-measure's *Building from a screenshot* (`probe`) | the frame's measured boxes, fills, text colours, padding and line pitch; type, radius and shadows are estimates and marked so |
| a look to reach, measured or not | ui-hill-climb in design mode | an outside model's findings against the target frames, fixed round by round, with before/after pairs for the gate |

They combine: a climb with `measure.json` fixes measured fails first, then the judge's findings. A geometry-only
`measure.json` (no `figma` or `node` per screen) is the cheapest useful setup for a facelift.

The rest of this page is about the climb; the measured checks follow the same placement (after the cases are
green, before the reader) and their reports go to the reader alongside `scores.md`.

## Where it sits in a card

After the card's cases are green, before its reader runs. The builder runs the climb as its polishing step.

- **It is not the reader file.** The reader checks the running screens against the card's source rows, its
  acceptance cases and its labels. The judge sees only pixels and checks none of those. A card that ran a climb
  still needs its reader file to close.
- Hand the reader the climb's output as evidence: `scores.md`, the best round's before/after pairs and the
  designer list (*At the gate*). The reader decides what to make of them.
- The cases stay green through every round. A round that turns a case red is reverted, whatever its score.

## The reference is the look target

The intent-holder's approved look target is the design. Export its frames at the widths the target was approved
at (usually a phone width and a desktop width) into `refs/`, and run in **design mode** with `--design`, at both
viewports.

- **No approved look target, no climb.** Ask the intent-holder for a picture first: one rendered page, or two or
  three directions side by side. Don't pick references or competitors yourself to stand in for one.
- If the target is an HTML mock, screenshot it at each width with the same browser and viewport as the app.
- `constraints.md` holds the intent-holder's words about the look, copied verbatim with where they came from.
  Copy in the project's own label rule too (every stub, default and not-yet-in-force rule is marked on screen),
  so the judge doesn't score a required label as clutter.

## Show the whole kitchen

A facelift fixes layout. It never hides a check, a stage, a label or a refusal to look cleaner. On top of
*Rules* in SKILL.md:

- A judge finding that would remove or hide a label, a refusal, a step or a status goes to the designer list,
  never into the code.
- Capture with the build labels visible. If the project has a showing mode that hides them, keep it off for
  every round.

## Judge independence and light's one review

The judge is part of the builder's loop, not a review round.

- Light mode's one code review and one fix-check, and the reader, still happen once, after the climb.
- The judge runs on a model other than the builder's. On the Kimi runner, spend the flat-fee plan first.
- Judge findings are the builder's to-do. They aren't folded as *silent* findings, and they don't add rounds
  to light's review.

## The frame budget and the test ladder

A climb is a per-card check, never the full walk.

- Capture only the card's own screens (its deliverable), at the look target's widths. That is screens × widths
  × rounds captures, plus the frame judged against itself each round.
- Keep the cap at 3 rounds. Only the intent-holder raises it, and the raise goes in the run log with their reason.
- The look of the whole slice is the gate reader's job, on the full walk, once per slice.

## Stops

The climb's own stop (cap reached, gain under 0.3, no major deviation left) ends the climb normally, without a
pull. These pull the stop cord: three lines in the run log (what was observed, which trigger, the question for
the intent-holder), with a default:

- **Exit 75, or the card's budget is spent:** the cost trigger.
- **`revert_to` set in two consecutive rounds:** a repair made things worse twice. Treat it like the trigger for
  a repair that created the defect it repaired.
- **The frame scores far from 10 against itself, or with major findings:** the judge is unreliable on this
  screen. Don't act on its findings.
- **A measured guard trip, or a round that isn't comparable twice running:** the measurement is broken. Fix the
  setup, don't judge.

The pull's default is the safe branch: the best round's code stays on the branch, and work moves to another card.
Never continue the climb as the default.

## At the gate

The intent-holder doesn't judge scores. For each screen card that ran a climb, they get:

- the running screens at both widths, labels visible, to click next to the look target's frames;
- the best round's before/after pairs;
- the **designer list**: each finding left open because fixing it would change the look target (a colour, a
  layout, copy the target shows) or hide something. They rule each one: change the target, or keep it as it is;
- the limits from the handover: the judge's model and runner, the number of rounds, which screens and widths
  were covered, and that recall is unmeasured.

Their veto beats any score. A card whose screens don't look like the target goes back, whatever `scores.md` says.
