---
status: superseded
last-verified: 2026-11-21
superseded-by: 2026-11-21-ui-measure-0.2-design.md
---

# Building from Figma: a day-to-day skill

Classification: architectural. It is a new team-facing skill plus a ui-measure interface change (authoritative
pairs); there is no existing flow to change.

## Goal

A developer on the team asks their coding agent to build a screen or component from a Figma link. The agent
builds it the way the official Figma skill teaches, then **measures** the result against the Figma node before
handing over, and fixes what the measurement finds. The developer gets the code plus a short measured report
for the merge request, instead of the designer finding the gaps in the next review round.

## Decisions from the requester (2026-11-20)

- First moment to serve: **building a screen from Figma**. Checking before review and working a designer's review
  list come later and reuse the same machinery.
- **Generic public skill plus a per-repo layer.** The skill lives in the public skills-catalog and names no
  client. Each team repo commits a small file with its own conventions; client details stay in the team's GitLab.
- Harnesses: **Claude Code, Kimi Code and Codex.** The skill is a plain `SKILL.md` with scripts run through
  `bash`/`node`, and it reaches Figma only through the Figma MCP server, which all three support.

## What we already know (evidence)

- ui-measure geometry checks caught real defects (a clipped dropdown, content flush to an edge) with clean
  controls. Its Figma comparison failed on real screens because **pairing** failed: a proposer guessing which DOM
  element is which Figma node after the fact accepted 2 of 63 pairs on one screen. (Private measure-eval spike.)
- At build time there is nothing to guess: the agent knows which element it wrote for which node. ui-measure
  already accepts a recorded pairing (`--proposer recorded --proposal FILE`, `{pairs:[{nodeId, selector}]}`).
- Recorded pairs still pass the verifier's plausibility rules. `size_plausible` drops a pair whose size differs by
  more than the tolerance, which turns exactly the size defects we want reported into "not the same thing".
- ui-measure compares Figma DROP_SHADOW with CSS `box-shadow` only; a correct `filter: drop-shadow(...)` fails.
- The official `figma-design-to-code` skill covers reading the design, reusing project components and tokens and
  placing assets exactly. Its verification is visual and asset-level; it measures nothing.

## Approaches

- **Chosen: a thin layer over the official skill.** Build with `figma-design-to-code` unchanged, record pairs while
  building, measure with ui-measure, fix, report. It reuses Figma's own skill as Figma updates it, and puts our
  effort only where we have evidence: measurement with known pairs.
- Rejected: our own full design-to-code skill. Duplicates the official one and drifts from it.
- Rejected: a checker that runs after the build with an LLM proposer. That is the configuration that failed.

## Components

### The skill: `building-from-figma`

A second skill in the ui-measure plugin, so one install brings the skill and the CLI it drives. Ruling: same
plugin, not a new one — the skill is useless without the CLI, and a cross-plugin dependency is what ui-hill-climb
already had to work around with `find_ui_measure`. Cost if wrong: a later split.

The workflow it teaches:

1. **Read the repo layer** (`FIGMA.md` and `ui-measure.config.json`). If either is missing, offer to scaffold it
   from the shipped template and ask the developer to fill the values only they know; do not guess them.
2. **Build** following `figma-design-to-code` (in Claude Code the plugin skill; elsewhere the Figma MCP resource
   `skill://figma/figma-design-to-code/SKILL.md`).
3. **Record pairs as you build** into `.ui-measure/pairs/<target>.json`: one pair per Figma node that the code
   implements as its own element — frames with layout, text, images and icons, anything with a fill or effect.
   Selectors must survive small edits: an existing id, test id, or role plus accessible name first; a short
   structural path only when nothing else exists. No new attributes in production code.
4. **Get the node JSON**: `ui-measure spec --figma NODE` when `FIGMA_TOKEN` is set; otherwise run the shipped
   read-only exporter `scripts/export-node.js` through the Figma MCP `use_figma` tool and save the result to
   `.ui-measure/nodes/<node>.json`, then pass `--node FILE`. (`exportAsync` JSON_REST_V1 is refused over the
   connector; the exporter writes exactly the fields ui-measure reads.)
5. **Measure** the running dev server: `ui-measure geometry` and `ui-measure spec --proposer recorded
   --proposal <pairs> --node <file>`, both with `--json`.
6. **Triage and fix** each fail in scope: a real defect → fix the code; design intent the measurement cannot
   know (for example responsive stretch) → leave it and say why; a measurement artefact → report it. Re-measure
   after fixes. Never edit the pairs file or the config to make a fail disappear; a pair changes only when the
   code's structure changed.
7. **Hand over** a short table for the MR description: pairs measured, fails found and fixed, fails left with the
   reason, anything not comparable. Never call a screen clean when the report says not comparable.

### The repo layer

- `ui-measure.config.json` (existing format): one target per screen or state — dev-server URL, root selector,
  viewport, and the `mock` and `steps` modules that reach the state.
- `FIGMA.md`: what the agent cannot discover reliably — the Figma file and page the repo builds from, how design
  tokens map to code (for example which theme field a colour comes from), fonts, component folders, viewport and
  device, and a short list of the repo's recurring design-review defects so the agent checks those first.
  Ruling: one Markdown file, no schema — it is read by agents and people, and nothing parses it. Cost if wrong: a
  later structured section.
- `.ui-measure/` (pairs, nodes, reports): committed or ignored is the repo's choice; the template suggests
  committing pairs and ignoring reports.
- Shipped: `templates/FIGMA.md` and `templates/ui-measure.config.json`.

### ui-measure 0.2 changes this needs

1. **Authoritative pairs.** A pairs file may carry `"authoritative": true`. Its pairs skip the plausibility rules
   (`size_plausible` and the text-swap refutation): the element exists or the pair is not comparable, and every
   property difference is reported as a mismatch. Default stays as today for proposer pairs.
2. **CSS filter shadows.** `filter: drop-shadow(x y blur colour)` matches a DROP_SHADOW with the same values; only
   a filter with no matching design effect is "unexpected".

3. **Recorded-selector resolution.** Today a pair's selector must equal the DOM walker's own path
   (`root > :nth-child(i) ...`, `src/dom/tree.ts`), looked up by exact string (`src/correspondence/verify.ts`
   Rule 0), so an id, test-id or role selector is "no element matching". For a recorded proposal, ui-measure runs
   each selector in the page (`querySelectorAll` inside the root), requires exactly one match, and maps it to the
   walker's path for that element before verification. Zero matches → not comparable `resolvable` ("no element");
   more than one → not comparable `resolvable` ("ambiguous: N elements"). Role-plus-name selectors are written as
   CSS the page can run (for example `button[aria-label="Back"]`); no Playwright locator syntax.
   Ruling (builder check, 2026-11-20): resolve in ui-measure rather than make the skill write walker paths —
   walker paths break on any added wrapper, which defeats pairs that survive small edits. Cost if wrong: one
   more engine change to maintain.

Not required for this skill (backlog from the spike): flush reported per side; overflow vs drawn scrollbar.

## Error handling

- No Figma MCP server in the harness: stop at step 2 and say how to add it; no building from a screenshot.
- Dev server not running or the target's root missing: ui-measure exits 2 or 3. Report it and do not claim a
  measurement.
- A node the code does not implement (decoration merged into a background, hidden variants): leave it out of the
  pairs and list it as unmapped, with the reason.
- `use_figma` unavailable or refused: fall back to `FIGMA_TOKEN`; without either, hand over geometry only, saying
  so.

## Testing

- ui-measure: unit tests for authoritative pairs (a 121 vs 74 px icon reports a size mismatch instead of dropping)
  and for filter shadows (a 4px 0 7.5px white 33% shadow passes, a wrong blur fails). Fixture pages as today.
- Skill end to end on a fixture: a fixture Figma node JSON plus a page with a planted padding and shadow defect;
  the measured report lists both, and lists none after the fix.
- Skill behaviour under writing-skills: baseline agent with only the official skill versus agent with this skill,
  on the same fixture task. GREEN means it records pairs, measures, fixes the planted defects and reports not
  comparable honestly. Run on Kimi first.
- Private trial: one real kiosk screen built by a team member with the skill; their verdict and the designer's
  next-round count for that screen go in the private journal.

## Out of scope

Checking an existing screen before review, working a designer's review list, hill-climbing, and anything that
writes to Figma.

## Relation to earlier work

- ui-measure 0.1.0 (PR #1) is the measurement engine; this skill adds no new detector, only the 0.2 changes above.
- ui-hill-climb 0.2 (PR #2) climbs on the same measured counts. It is kept, not replaced: it serves iterating on a
  screen until it matches, this skill serves the first build. The authoritative-pairs change benefits both, since
  a hill-climb run can seed its proposal from a builder's pairs file.
- Evidence and backlog: docs/research/2026-11-20-ui-measure-real-defect-eval.md.

## Builder check

Run 2026-11-20 on Kimi K3.1 Pro (local record `.superpowers/building-from-figma/builder-check.kimi.md`). One
question: recorded selectors could not resolve against the walker's exact paths. Settled as ui-measure change 3.
