# ui-measure

Measures a rendered page in a real browser, with no model judging pixels. Four commands:

- `geometry` needs no design. It finds text that is zero-size or clipped (checked only on elements with their own non-whitespace text), elements off-canvas, own text flush against its container's edge, and a scrollbar on elements the config lists in `geometry.nonScrolling`.
- `spec` compares the page with a Figma node: boxes, gaps, padding, radius, borders, colours, fonts and effects (CSS `filter: drop-shadow(...)` matches Figma DROP_SHADOW).
- `baseline record|check` records the current findings as known and separates new defects from them.
- `probe IMAGE.png --box X,Y,W,H` reads one element out of a screenshot or design export, for building from an image when there is no Figma access. From a rough box it snaps to the element's exact edges and reports its fill, its content colour (text, icon), the padding from its edges to that content, and its text lines with their pitch, in CSS pixels (`--scale 2` or `--frame-width 390` converts from image pixels). Probe one element per box: around a whole card, the box and fill are the card's and the ink is everything inside it. A drop shadow is reported as a rim and kept out of the box; an even one-colour rim is a border and stays in; an uneven one-colour rim is left out with a warning (an uneven border or an offset shadow). A solid shape with no inner detail, such as a filled square icon, reads as a fill with no ink. A side marked `CLIPPED` means the box cut the element; enlarge it. Edges are exact to one image pixel. Prefer a 1x export: resampled images blur colours, and the ink colour is then marked approximate. Exit 0, or 2 when a box measured nothing.

Outcomes: clean (exit 0), mismatches (1), not comparable (2), usage or setup failure (3).

## How far to trust it

Geometry checks are dependable.

Figma comparison depends on how the design nodes are paired with page elements:

- Builder pairs: the agent that builds the screen records `.ui-measure/pairs/<target>.json` with `"authoritative": true` while it builds. This removes the pairing guess that made proposer pairs fail on real screens (2 of 63 pairs accepted on one screen). An initial trial on a private replay of a real screen ran with builder pairs: the CSS-filter glow that previously failed as a control now passes, and the missing glow is still caught. A team trial on a new screen is still pending, so treat the numbers as measurements, not as a verdict.
- Proposer pairs (a model or command proposes the pairing, code verifies it): experimental.

Authoritative pairs skip the size, text and reading-order plausibility checks, so size differences show as `box` fails. Each rejected pair is listed in `coverage.rejected` and reported as a `not_comparable` finding, so a run with a bad selector can never be clean.

## Known gaps

- A flush edge is reported only on the worst side, not per side.
- Overflow is not told apart from a drawn scrollbar.
- Text content (the string itself) is not compared, only the type style.
- A drop-shadow inside `backdrop-filter` is reported as unexpected.
- `probe` measures edges, colours, padding to content and line pitch only. Font size, weight and family, corner radius and shadows are not measured; estimate them and say they are estimates. It reads 8-bit non-interlaced PNG. Text padding is measured to the ink, so it is larger than the CSS padding by the space above the glyphs in the line box.

## Files shipped

- `scripts/export-node.js`: run through the Figma MCP `use_figma` tool (read-only; replace `"__ID__"`) to export a node as JSON. Without a paid seat, a free Figma plugin that runs Plugin API code, such as Scripter, may export the node instead; that route is untested here.
- `templates/inferred-node.json`: the shape of a design spec inferred from a screenshot (`"source": "screenshot"`, `"estimated"` fields per node), for building from an image.
- `templates/FIGMA.md`, `templates/ui-measure.config.json`, `templates/gitignore-snippet.txt`: the repo layer. Commit `.ui-measure/pairs/` and `.ui-measure/nodes/`; ignore reports.

The workflow itself is in `skills/ui-measure/SKILL.md`: building from Figma, and building from a screenshot when there is no Figma access.
