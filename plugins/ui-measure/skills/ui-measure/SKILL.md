---
name: ui-measure
description: Use when building, changing or checking UI against a design - a screenshot or PNG export of the design, a Figma design, or an exported Figma node JSON - verifying a page matches it, or measuring spacing, padding, sizes, colours, shadows, clipping or overflow - and before writing your own Playwright, PIL or browser script to measure pixels or compare images. Gives deterministic numbers instead of a model judging pixels.
---

# UI measure

Run **geometry** when no design is available or when checking clipping, collapsed text, off-canvas content, flush edges, and scrollbars where the config forbids them. Run **spec** when a design node and a correspondence (recorded pairs, or a proposer) are available; it measures boxes, spacing, radii, borders, colour, typography, and effects.

```bash
node dist/ui-measure.mjs geometry --config ui-measure.config.json --target card --json report.json
node dist/ui-measure.mjs spec --config ui-measure.config.json --target card \
  --node design.json --proposer recorded --proposal pairs.json --json report.json
```

Outcomes are **clean** (exit 0), **mismatches** (exit 1), and **not_comparable** (exit 2). Usage or setup failures exit 3. Not-comparable results always include a reason. Findings are advisory unless the consuming project explicitly makes them a gate; an advisory caller must handle exits 1 and 2 deliberately.

For a model-proposed mapping, select a `command` proposer. The command receives `{design, dom}` JSON on stdin and must print only a `Proposal` JSON object. Code verifies every proposed pair before measuring it.

To use Kimi through **kimi-delegation**, use the `ui-hill-climb` skill's proposer, `scripts/hill-propose`: it reads the `{design, dom}` JSON on stdin and prints only a Proposal JSON object. Invoke it as `python3 <ui-hill-climb skill dir>/scripts/hill-propose`:

```bash
node dist/ui-measure.mjs spec --config ui-measure.config.json --target card \
  --node design.json --proposer command -- python3 <ui-hill-climb skill dir>/scripts/hill-propose
```

Keep credentials in the delegation environment, never in config or command arguments.

**Light mode.** On a project run on light mode (task cards, a reader per screen card), run the checks after the card's cases are green and before its reader, and give the reports to the reader: they are evidence for it, not a reader file. Run `geometry` on every card that changes a screen. The intent-holder's approved look target is the design. If ui-hill-climb is installed, its `light-mode.md` has the rest.

## Building from Figma

Record the pairing while you build, so nothing has to be guessed afterwards.

1. **Read the repo layer:** `FIGMA.md` and `ui-measure.config.json`. A missing config never blocks measuring: write it from `templates/ui-measure.config.json` with what you can find yourself (dev-server URL, the root selector of what you build, viewport from the Figma frame, the node file) and ask the developer only for what you cannot find, such as how to reach a state behind a login; name the files you wrote in the hand-over so the developer can keep or drop them. A missing `FIGMA.md`: offer to scaffold it from `templates/` and carry on.
2. **Build** following `figma-design-to-code`: the Claude Code plugin skill, or elsewhere the Figma MCP resource `skill://figma/figma-design-to-code/SKILL.md`. An exported node JSON is a full design source: build from it and run every step below. No Figma MCP and no node JSON: ask once whether someone can export the node (a designer with a paid seat, or a free Figma plugin that runs Plugin API code, untested here); only an image: use *Building from a screenshot* below.
3. **Record pairs while building** in `.ui-measure/pairs/<target>.json`:
   ```json
   { "authoritative": true, "pairs": [{ "nodeId": "1:2", "selector": "[data-testid=card]" }],
     "unmapped": { "design": ["1:9"], "impl": [] }, "unmappedReasons": { "1:9": "not built: out of scope" } }
   ```
   One pair per Figma node the code implements as its own element: layout frames, text, images and icons, anything with a fill or effect. Selector order: an existing id, test id or attribute such as `aria-label`; a short structural path only when nothing else exists. Any CSS the page can run works, but it must match exactly one element inside the root. Add no attributes to production code. List nodes the code does not implement in `unmapped.design`, with reasons in `unmappedReasons`.
4. **Get the node JSON.** One already exported (step 2): save it to `.ui-measure/nodes/<node>.json` and set the target's `node`. Otherwise, two ways: `--figma NODE` when `FIGMA_TOKEN` is set (and a file key, in the target's `figma.fileKey` or `FIGMA_FILE_KEY`); otherwise run `scripts/export-node.js` through the Figma MCP `use_figma` tool (read-only; replace `"__ID__"`), save to `.ui-measure/nodes/<node>.json`, and set the target's `node`. Neither available: run `geometry` only and say the design was not compared, or, with an image of the design, use *Building from a screenshot*.
5. **Measure** with this CLI, not a measuring script of your own: the running dev server with `geometry`, then `spec --target T` (it picks up the pairs file with no flags), both with `--json`. Dev server down or root missing (exit 2 or 3): report it and claim no measurement.
6. **Triage and fix** each fail. A real defect: fix the code. Design intent the measurement cannot know: leave it and say why. A measurement artefact: report it. Re-measure. A selector that matches nothing, several elements or is invalid shows in `coverage.rejected` and as a `not_comparable` finding: fix the selector. Never edit pairs or config to make a fail disappear; change a pair only when the code's structure changed.
7. **Hand over** a table for the MR: pairs measured, fails fixed, fails left with reasons, anything not comparable. Never call a screen clean when the report says not comparable. For several rounds with an outside judge, hand off to `ui-hill-climb`, which reuses the same pairs.

Authoritative pairs skip size, text and reading-order plausibility: a size difference shows as a `box` fail. `coverage.authoritative` says which mode ran.

## Building from a screenshot

Only an image of the design (no Figma seat, no node JSON): first write down what Figma would have said, measured from the pixels, then build against it and check twice. A static page or a single component is no exception: any folder served over HTTP is a dev server, and the config is a few lines. Per target (one per screen or state) you write all of these, none optional:

- `.ui-measure/<target>.probe.json`: the design measured (the baseline; only a full rerun on the design image replaces it)
- `.ui-measure/nodes/<target>.inferred.json`, `ui-measure.config.json` and `.ui-measure/pairs/<target>.json`
- the `spec` report, `.ui-measure/<target>.build-probe.json`, and the hand-over

1. **Frame and scale.** The frame is the app's own area, without OS status bars, browser chrome or keyboards. Pass `--frame-width W` (the frame's CSS width, from `FIGMA.md` or the developer, never a code viewport) or `--scale S`. Unknown: ask once, else assume and list "scale assumed" first among the estimates. Prefer a 1x export.
2. **Layer tree** before any number: every element in the frame, nested, named, text transcribed.
3. **Measure every element with `probe`**, one box per element, all in one call. Boxes are image pixels; results are CSS pixels. Never read a distance or colour off the image yourself.
   ```bash
   node dist/ui-measure.mjs probe screen.png --frame-width 390 --box 40,180,700,330 --box 90,230,300,60 --json .ui-measure/screen.probe.json
   ```
   `CLIPPED`: enlarge the box. Mixed surroundings: move it onto one surface. `nothing`: fix it or list the element as unmeasured. After a fix, rerun the whole set.
4. **Measured:** boxes, fills, content colours, left and right padding (`insets`), gaps between boxes that are not text. A shadow `rim` is outside the box, a `border` inside.
5. **Estimated**, snapped to tokens or whole pixels: font size, weight, family, line height (the line pitch if any), text boxes and any gap or padding next to text (probe sees glyphs, not line boxes), radius, shadows, approximate colours. A first guess may come from looking; no pixel scripts or image diffs of your own.
6. **Write the inferred node** like `templates/inferred-node.json`: one node per element, `"source": "screenshot"`, `"image"`, and on each node `"estimated"` listing its step-5 fields. Write the config (*Building from Figma*, step 1) with it as the target's `node`, and the pairs file (*Building from Figma*, step 3) with the inferred ids.
7. **Build** from the inferred node and the image. Not before step 6 is written.
8. **Check twice:** `geometry` and `spec --target T` as in *Building from Figma*, step 5; then screenshot the build at the frame width, scale and origin of the design and `probe` it with the same boxes into the build-probe file. Measured values agree within one image pixel; colours exactly unless approximate. A `spec` fail on an estimate probe cannot see (font, radius, shadow) stays an estimate: never edit it to pass. Triage the rest as in *Building from Figma*, step 6.
9. **Before handing over, check every file above exists**; the round trip alone skips the type and spacing checks only `spec` makes.
10. **Hand over** as in *Building from Figma*, step 7, headed "design inferred from a screenshot, not compared with Figma": round-trip table, `spec` result, files written, estimates as unverified. At most "measured values agree with the design image; estimates unverified"; never "matches the design" or "clean".
