---
name: ui-measure
description: Use when building, changing or checking UI against a design - a Figma design, an exported Figma node JSON, or only a screenshot or PNG export of the design - verifying a page matches it, or measuring spacing, padding, sizes, colours, shadows, clipping or overflow - and before writing your own Playwright, PIL or browser script to measure pixels. Gives deterministic numbers instead of a model judging pixels.
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

## Building from Figma

Record the pairing while you build, so nothing has to be guessed afterwards.

1. **Read the repo layer:** `FIGMA.md` and `ui-measure.config.json`. A missing config never blocks measuring: write it from `templates/ui-measure.config.json` with what you can find yourself (dev-server URL, the root selector of what you build, viewport from the Figma frame, the node file) and ask the developer only for what you cannot find, such as how to reach a state behind a login. A missing `FIGMA.md`: offer to scaffold it from `templates/` and carry on.
2. **Build** following `figma-design-to-code`: the Claude Code plugin skill, or elsewhere the Figma MCP resource `skill://figma/figma-design-to-code/SKILL.md`. An exported node JSON is a full design source: build from it and run every step below. No Figma MCP and no node JSON: ask once whether someone can export the node (a designer with a paid seat, or a free Figma plugin that runs Plugin API code, untested here); only an image: use *Building from a screenshot* below.
3. **Record pairs while building** in `.ui-measure/pairs/<target>.json`:
   ```json
   { "authoritative": true, "pairs": [{ "nodeId": "1:2", "selector": "[data-testid=card]" }],
     "unmapped": { "design": ["1:9"], "impl": [] }, "unmappedReasons": { "1:9": "not built: out of scope" } }
   ```
   One pair per Figma node the code implements as its own element: layout frames, text, images and icons, anything with a fill or effect. Selector order: an existing id, test id or attribute such as `aria-label`; a short structural path only when nothing else exists. Any CSS the page can run works, but it must match exactly one element inside the root. Add no attributes to production code. List nodes the code does not implement in `unmapped.design`, with reasons in `unmappedReasons`.
4. **Get the node JSON** two ways: `--figma NODE` when `FIGMA_TOKEN` is set (and a file key, in the target's `figma.fileKey` or `FIGMA_FILE_KEY`); otherwise run `scripts/export-node.js` through the Figma MCP `use_figma` tool (read-only; replace `"__ID__"`), save to `.ui-measure/nodes/<node>.json`, and set the target's `node`. Neither available: run `geometry` only and say the design was not compared, or, with an image of the design, use *Building from a screenshot*.
5. **Measure** with this CLI, not a measuring script of your own: the running dev server with `geometry`, then `spec --target T` (it picks up the pairs file with no flags), both with `--json`. Dev server down or root missing (exit 2 or 3): report it and claim no measurement.
6. **Triage and fix** each fail. A real defect: fix the code. Design intent the measurement cannot know: leave it and say why. A measurement artefact: report it. Re-measure. A selector that matches nothing, several elements or is invalid shows in `coverage.rejected` and as a `not_comparable` finding: fix the selector. Never edit pairs or config to make a fail disappear; change a pair only when the code's structure changed.
7. **Hand over** a table for the MR: pairs measured, fails fixed, fails left with reasons, anything not comparable. Never call a screen clean when the report says not comparable. For several rounds with an outside judge, hand off to `ui-hill-climb`, which reuses the same pairs.

Authoritative pairs skip size, text and reading-order plausibility: a size difference shows as a `box` fail. `coverage.authoritative` says which mode ran.

## Building from a screenshot

Only an image of the design (no Figma seat, no node JSON): first write down what Figma would have said, measured from the pixels, then build against it. This path produces four files, none optional: `probe.json`, `.ui-measure/nodes/<target>.inferred.json`, `.ui-measure/pairs/<target>.json`, and the hand-over. The result is compared with your inferred spec and the image, never with Figma.

1. **Fix the scale:** the frame's width in CSS pixels, from `FIGMA.md`, the config viewport or the developer. Pass `--frame-width W` to every probe. Prefer a 1x export; a resampled image blurs colours.
2. **Write the layer tree** before any number: every visible element top to bottom, nested (screen > card > title), named, text transcribed.
3. **Measure every element with `probe`**, one box per element, all in one call, `--json probe.json`. Never read a distance or colour off the image yourself.
   ```bash
   node dist/ui-measure.mjs probe screen.png --frame-width 390 --box 40,180,700,330 --box 90,230,300,60 --json probe.json
   ```
   A `CLIPPED` side: enlarge that box. A mixed-surroundings warning: move the box onto one surface. Approximate ink: say the colour is approximate.
4. **Derive the layout from the measured boxes:** stack direction, gaps between siblings, left and right padding (`insets`), alignment, fills, content colours. A shadow `rim` is outside the box; a `border` rim is inside it.
5. **Estimate what probe does not measure**, snapped to the repo's tokens or whole pixels, never a font's fractional default: font size (from the line band height and the type scale), weight, family, line height (a line pitch when there is one, else the type scale's), top and bottom padding around text (probe measures to the glyphs, not the line box), radius, shadows. An estimate stays an estimate: no image-diff sweeps or pixel scripts of your own to fit it.
6. **Write the inferred node JSON** to `.ui-measure/nodes/<target>.inferred.json` in the shape of `templates/inferred-node.json`: one node per layer-tree element, `"source": "screenshot"` at the top, and on each node `"estimated"` listing its estimated fields. Write the config (step 1 of *Building from Figma*) with this file as the target's `node`. Show the developer the spec as a short table, estimates flagged, before building; if nobody can answer, carry on.
7. **Build and record pairs** as in *Building from Figma*, steps 2 and 3, with the inferred node ids.
8. **Measure twice.** `spec --target T` checks the code against the inferred spec. Then screenshot the build at the image's scale and `probe` it with the same boxes: every measured value must match the design's `probe.json`. A fail on an estimated field means the estimate or the code is off: let the round trip decide, and update the inferred node only for an estimate the round trip disproves. Triage the rest as in step 6 above.
9. **Hand over** as in step 7 above, headed "design inferred from a screenshot, not compared with Figma": the round-trip table, the `spec` result, and the estimated values listed as unverified.
