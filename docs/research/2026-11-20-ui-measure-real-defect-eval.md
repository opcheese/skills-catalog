---
status: current
last-verified: 2026-11-20
---

# ui-measure on real designer-flagged defects

What we learned by running ui-measure 0.1.0 (and the measurement ui-hill-climb 0.2 climbs on) against real
defects from a client project's design reviews. The builds, item texts and Figma files are private; this note
keeps only the method, the counts and the lessons.

## Method

- Pool: defects a designer flagged in review, reproduced on replay builds of the app, whose defect class is
  something ui-measure measures, and whose fix commit is known. Seven items.
- Control: the defective build plus **only that item's fix hunk**. A hit needs a fail on the item's target property
  and element on the defective build, and the same property measured and passing on the control.
- The card (question, time-box, enumerated answers with "could not find out", precedence, scoring) was written
  and read by a second model (Kimi K3.1 Pro) before any run; its six findings were folded in first.
- One run per build. Figma node JSON came from the Figma MCP connector through a read-only exporter, because
  `exportAsync({format: "JSON_REST_V1"})` is refused over the connector.

## Results

| defect class | tier | result |
| --- | --- | --- |
| dropdown clipped by its container | geometry | hit |
| editor content flush to the top edge | geometry | hit |
| missing glow (Figma drop shadow) | spec | control failure: the fix used CSS `filter: drop-shadow`, which ui-measure does not match |
| scrollbar line should be hidden | geometry | not measurable: the check reads overflow, the fix only hides the bar |
| placeholder icon size | spec | not measurable: the proposer left the icon unpaired |
| overlay height hides first text line | spec | not measurable: the proposer left the overlay unpaired |
| back button fill and icon colour | spec | not measurable: the replay build already contained the fix |

Three measurable, two hits, one control failure. The registered answer: no recall claim yet; detector work
first. The screenshot judge had missed all three geometry items in the earlier recall spike, and ui-measure caught
two of them.

## Lessons

- **Geometry checks work without Figma** and were clean on controls. They are the dependable part.
- **Pairing is the bottleneck for Figma comparison.** An LLM proposer guessing pairs after the fact accepted 2 of
  63 on one real screen, and icons and overlays without text went unpaired.
- **The plausibility gate swallows real defects.** A pair whose size differs by more than the tolerance is dropped
  as "a different thing", so a 121 px icon where the design says 74 px is never reported.
- **A build-time pairing removes the guess.** The agent that writes the code knows which element implements which
  node. This is the basis of the building-from-figma design (specs/2026-11-20-building-from-figma-design.md).
- Real screens are noisy (one CMS screen had 46 unrelated fails, identical on both builds); baseline first.

## ui-measure 0.2 backlog (each from an observed failure)

1. Authoritative (builder-recorded) pairs that skip plausibility and report size differences as mismatches.
2. CSS `filter: drop-shadow` matched to a Figma DROP_SHADOW.
3. Flush-edge reported per side, not only the worst side.
4. Overflow told apart from a drawn scrollbar.
5. Proposer pairing for elements without text.

## Relation to ui-hill-climb 0.2

ui-hill-climb 0.2 (PR #2) ranks rounds on these measured counts. Its code is reviewed and tested, but on real
screens its spec measurement is only as good as the pairing, so measured climbing stays experimental until items 1
and 5 land and one real loop has run. The building-from-figma skill uses the same measurement with builder pairs,
and its fixes (items 1 and 2) make the hill-climb's measured rounds better too.
