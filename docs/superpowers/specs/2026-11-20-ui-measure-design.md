---
status: draft
last-verified: 2026-11-20
owner: Kirill
---

# ui-measure: model-free UI measurement as a general package

**Path: architectural.** Deciding fact: this creates a new package whose interfaces two consumers depend on
(the public ui-hill-climb skill and Galatea's `check_design`), and moves code out of a private repo.

## Why

A recall spike replayed 18 real designer review items through ui-hill-climb's screenshot judge. It caught
structure, wording and missing elements, and missed every spacing, padding, clipping, scrollbar and effect
defect (44% strict recall, about 96% of findings matched nothing flagged). Galatea measured the same limit in
August 2026: an image reader saw a deleted element 12 times in 12 but a radius change and a 45px shift 0 times
in 13. Its ruling, "a model never produces a quantity", led to a Figma-vs-computed-style check that already
exists, in a private repo, tied to Galatea's seat. The owner decided on 2026-11-20 to move it into a general
package and generalize it.

## Scope

Three sub-projects, each with its own spec and plan. This spec covers the first.

- **ui-measure** (this spec): the package. Spec conformance moved from Galatea, plus new geometry checks.
- **ui-hill-climb restructure** (later spec): climb on measured counts, judge as guard and tie-break,
  read-alone judge mode pending its A/B.
- **Galatea migration** (later spec, Galatea repo): `check_design` imports the package instead of its own
  copy. Galatea-only parts stay there.

Out of scope: publishing to the npm registry (owner's decision, later); any client data in this repo.

## Where it lives

`skills-catalog/packages/ui-measure/`, a TypeScript package in the public catalog, with a `ui-measure` CLI.
The ui-hill-climb skill calls the CLI; Galatea depends on it by git URL pinned to a tag.

Approaches weighed:

- **Package in the public catalog (chosen).** One implementation next to the skill that uses it, tested in
  the catalog's CI, no new repo. Galatea pins a tag, so a catalog change never moves Galatea silently.
- **Publish to npm.** Cleanest for consumers, but outward-facing and versioned in public; defer until the
  API has survived the two consumers.
- **New public repo.** Same result as the first with more overhead and nothing gained.

## What moves from Galatea, and what stays

Moves (scrubbed of client names, re-licensed with the catalog):

| Galatea file | becomes | change on the way |
| --- | --- | --- |
| `scripts/lib/correspondence.ts` | `src/correspondence/verify.ts` | none to the rules |
| `scripts/lib/design-facts.ts` | `src/figma/facts.ts` | none |
| `scripts/lib/design-measure.ts` | `src/figma/read.ts`, `src/dom/tree.ts`, `src/spec/measure.ts` | split by job; model call removed (see proposers) |
| `scripts/lib/design-baseline.ts`, `design-record.ts` | `src/baseline/` | paths come from config, not the repo layout |
| `apps/eve/agent/figma/token-map.ts`, `translate.ts` | `src/tokens/rows.ts` | unknown property and null rows become reported errors, not silent drops |

Stays in Galatea: the seat tool (`check_design.ts`), `figma-log`, seat credentials, the probe and experiment
scripts (`design-probe.ts` and `design-*-probe.ts`), PM-specific fixtures. Those fixtures are client frames
and never come here; the moved tests get synthetic fixtures (see Testing).

## Units

Each unit has one job and is usable alone.

- **figma** reads a node from a saved REST response (`GET /v1/files/:key/nodes`) or fetches it with a token
  from the environment, and flattens it to a `DesignTree` with boxes, text, auto-layout gaps and padding,
  bound variables and corner radii. It never stores the file key in output.
- **dom** opens a page in Playwright and returns a `DomTree` (boxes from `getBoundingClientRect`, computed
  style) under a root element. It takes a **harness adapter**:
  - `designharness`: `?c=<component>&state=<state>`, root is the first child of `#harness-root`;
  - `storybook`: `iframe.html?id=<story-id>&viewMode=story`, root is the first child of `#storybook-root`;
  - `url`: any URL plus a root selector, with optional `--steps` and `--mock` modules (the replay kit's
    contract), viewport and screen size set separately (device media queries read the screen).
- **correspondence** pairs design nodes with elements and verifies the pairs in code (Galatea's rules:
  type, injectivity, reading order, text, size; never position). The pairs come from a **proposer**:
  - `code-connect`: a Code Connect map, deterministic, preferred when the project has one;
  - `recorded`: a saved `{pairs, unmapped}` file;
  - `command`: any executable that reads both trees as JSON on stdin and prints a proposal. The package
    ships no model client; ui-hill-climb points this at Kimi, Galatea at its own provider.
- **spec** compares accepted pairs: box geometry, radius, token-bound properties, and **gaps and padding**
  from auto-layout. Gaps are compared between accepted siblings and padding between a parent and its first
  and last child, so a spacing change that resizes an element is reported as a spacing mismatch instead of
  dropping the pair (the gap Galatea's survey found). Tolerance floor 2px (Figma stroke vs CSS border).
- **tokens** loads a token map and translates Figma values to code values. Two formats: W3C design tokens
  (DTCG JSON) and row maps `{figma, value, code, property, note}` with the closed property vocabulary
  `color spacing radius fontSize lineHeight fontWeight fontFamily effect borderWidth`.
- **geometry** runs in the page with no design at all: elements clipped by an ancestor's overflow; elements
  with text and zero width or height; elements outside the viewport or screen; text closer than a configured
  inset to its container's edge; scrollbars on containers the config marks as non-scrolling. Usable where
  there is no Figma (an admin panel).
- **baseline** records findings keyed by property and geometry, not node id, and classifies each run's
  findings as introduced or inherited. A partial run is refused, never recorded.
- **report** writes one JSON document (schema below) and a short text summary.

## Data shapes

```ts
type Status = "pass" | "fail" | "not_comparable"
interface Finding {
  check: "geometry" | "spec"
  kind: string            // e.g. "clipped", "gap", "radius", "token"
  status: Status
  origin?: "introduced" | "inherited"   // only when a baseline exists
  target: { selector: string; designNode?: string; text?: string }
  expected?: string; actual?: string; deltaPx?: number
  reason?: string         // required when not_comparable
}
interface Report {
  tool: "ui-measure"; version: string; ranAt: string
  page: { url: string; viewport: [number, number]; screen: [number, number]; dpr: number }
  scale: number           // CSS px per design px, from the live root font size
  findings: Finding[]
  coverage: { pairsProposed: number; pairsAccepted: number; dropped: number }
  verdict: "clean" | "mismatches" | "not_comparable"
}
```

`scale` handles projects whose root font changes with the screen: comparisons divide by it, never assume
16px.

## Rules carried over from Galatea

- No unit asks a model for a quantity. A model may only propose pairs, which code then verifies.
- Every check returns pass, fail or not comparable. Not comparable always has a reason and never counts as a
  pass; the report's verdict is `not_comparable` if more than half the proposed pairs are dropped.
- Every measured mismatch is reported. Ranking and caps belong to consumers, not here.
- No harness, no geometry claim: if the root element is missing or the page fails to load, the run is
  not comparable. There is no screenshot fallback.

## Configuration

One file, `ui-measure.config.json`, in the consuming project (private repos keep theirs private):
harness adapter and base URL, viewports and screens, root selector, design root font size, token map path
and format, colour literals that are intentionally unthemed, geometry thresholds and non-scrolling
selectors, baseline directory. No defaults name a project.

## CLI

```
ui-measure geometry  --config C --target T [--json OUT]
ui-measure spec      --config C --target T --node FILE|--figma NODE_ID [--proposer KIND] [--json OUT]
ui-measure baseline  record|check --config C --target T
```

Exit codes: 0 clean, 1 mismatches, 2 not comparable, 3 usage or setup error. Advisory callers ignore 1 and
2 explicitly; an exit-0 gate is not a gate.

## Testing

- The moved Galatea tests come with the code and keep passing, with their fixtures replaced by synthetic
  ones: a small fixture app (plain HTML and CSS) served by the test, plus hand-written Figma node JSON that
  matches it. No client frames, file keys or names.
- Each geometry detector gets a page where it must fire and a near-identical page where it must not
  (Galatea's rule: every variant needs a differential assertion).
- Adapter tests: a minimal Storybook static build and a minimal design harness page, both in fixtures.
- A scale test: the same page at root font 10px and 5px gives the same findings.
- Evaluation against real defects (the spike's geometry misses and the QA reports) runs locally from the
  private replay kit, with its bar registered before the run. That evaluation is not part of this repo.

## Open items

- The npm registry, later.
- Whether Galatea's move happens before or after ui-hill-climb's restructure: either order works because
  both pin a tag.
