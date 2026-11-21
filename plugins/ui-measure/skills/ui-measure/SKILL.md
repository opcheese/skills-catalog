---
name: ui-measure
description: Use when building, changing or checking UI against a Figma design or an exported Figma node JSON - verifying a page matches the design, or measuring spacing, padding, sizes, colours, shadows, clipping or overflow - and before writing your own Playwright or browser measuring script. Gives deterministic numbers instead of a model judging pixels.
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
2. **Build** following `figma-design-to-code`: the Claude Code plugin skill, or elsewhere the Figma MCP resource `skill://figma/figma-design-to-code/SKILL.md`. An exported node JSON is a full design source: build from it and run every step below. No Figma MCP and no node JSON: stop before building and say how to add the MCP. Never build from a screenshot alone.
3. **Record pairs while building** in `.ui-measure/pairs/<target>.json`:
   ```json
   { "authoritative": true, "pairs": [{ "nodeId": "1:2", "selector": "[data-testid=card]" }],
     "unmapped": { "design": ["1:9"], "impl": [] }, "unmappedReasons": { "1:9": "not built: out of scope" } }
   ```
   One pair per Figma node the code implements as its own element: layout frames, text, images and icons, anything with a fill or effect. Selector order: an existing id, test id or attribute such as `aria-label`; a short structural path only when nothing else exists. Any CSS the page can run works, but it must match exactly one element inside the root. Add no attributes to production code. List nodes the code does not implement in `unmapped.design`, with reasons in `unmappedReasons`.
4. **Get the node JSON** two ways: `--figma NODE` when `FIGMA_TOKEN` is set (and a file key, in the target's `figma.fileKey` or `FIGMA_FILE_KEY`); otherwise run `scripts/export-node.js` through the Figma MCP `use_figma` tool (read-only; replace `"__ID__"`), save to `.ui-measure/nodes/<node>.json`, and set the target's `node`. Neither available: run `geometry` only and say the design was not compared.
5. **Measure** with this CLI, not a measuring script of your own: the running dev server with `geometry`, then `spec --target T` (it picks up the pairs file with no flags), both with `--json`. Dev server down or root missing (exit 2 or 3): report it and claim no measurement.
6. **Triage and fix** each fail. A real defect: fix the code. Design intent the measurement cannot know: leave it and say why. A measurement artefact: report it. Re-measure. A selector that matches nothing, several elements or is invalid shows in `coverage.rejected` and as a `not_comparable` finding: fix the selector. Never edit pairs or config to make a fail disappear; change a pair only when the code's structure changed.
7. **Hand over** a table for the MR: pairs measured, fails fixed, fails left with reasons, anything not comparable. Never call a screen clean when the report says not comparable. For several rounds with an outside judge, hand off to `ui-hill-climb`, which reuses the same pairs.

Authoritative pairs skip size, text and reading-order plausibility: a size difference shows as a `box` fail. `coverage.authoritative` says which mode ran.
