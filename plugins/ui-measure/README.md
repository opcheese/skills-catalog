# ui-measure

Measures a rendered page in a real browser, with no model judging pixels. Three commands:

- `geometry` needs no design. It finds text that is zero-size or clipped (checked only on elements with their own non-whitespace text), elements off-canvas, own text flush against its container's edge, and a scrollbar on elements the config lists in `geometry.nonScrolling`.
- `spec` compares the page with a Figma node: boxes, gaps, padding, radius, borders, colours, fonts and effects (CSS `filter: drop-shadow(...)` matches Figma DROP_SHADOW).
- `baseline record|check` records the current findings as known and separates new defects from them.

Outcomes: clean (exit 0), mismatches (1), not comparable (2), usage or setup failure (3).

## How far to trust it

Geometry checks are dependable.

Figma comparison depends on how the design nodes are paired with page elements:

- Builder pairs: the agent that builds the screen records `.ui-measure/pairs/<target>.json` with `"authoritative": true` while it builds. This removes the pairing guess that made proposer pairs fail on real screens (2 of 63 pairs accepted on one screen). A real-screen trial of this build-time workflow is still pending, so treat the numbers as measurements, not as a verdict.
- Proposer pairs (a model or command proposes the pairing, code verifies it): experimental.

Authoritative pairs skip the size and text plausibility checks, so size differences show as `box` fails. Each rejected pair is listed in `coverage.rejected` and reported as a `not_comparable` finding, so a run with a bad selector can never be clean.

## Known gaps

- A flush edge is reported only on the worst side, not per side.
- Overflow is not told apart from a drawn scrollbar.
- Text content (the string itself) is not compared, only the type style.
- A drop-shadow inside `backdrop-filter` is reported as unexpected.

## Files shipped

- `scripts/export-node.js`: run through the Figma MCP `use_figma` tool (read-only; replace `"__ID__"`) to export a node as JSON.
- `templates/FIGMA.md`, `templates/ui-measure.config.json`, `templates/gitignore-snippet.txt`: the repo layer. Commit `.ui-measure/pairs/` and `.ui-measure/nodes/`; ignore reports.

The workflow itself is in `skills/ui-measure/SKILL.md`.
