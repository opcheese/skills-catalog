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

`skills-catalog/plugins/ui-measure/`, its own plugin in the public catalog: a TypeScript package with a
`ui-measure` CLI, plus a short skill that says when to run which check. The source lives in `src/`; a
bundled `dist/ui-measure.mjs` (esbuild, committed) is what runs, so an installed plugin needs only `node` and
Playwright. ui-hill-climb calls the bundled CLI through the sibling plugin's path. Galatea depends on the
package by a pnpm git URL with a `path:` to the plugin folder, pinned to a tag `ui-measure-vX.Y.Z`.

Ruling: own plugin, committed bundle — a top-level `packages/` folder is not shipped when a marketplace plugin
is installed, so the skill could not reach it — if wrong, the cost is moving one folder.
Playwright is not bundled: the CLI resolves it from the consuming project, then globally, and exits 3 with
an install hint when neither has it. Plan task 1 verifies the pnpm `path:` git dependency on a scratch
project before anything else depends on it.

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
    contract), viewport and screen size set separately (device media queries read the screen). The
    contract, from the replay kit's `capture.mjs`: a `--mock` module's default export `(context) => Promise`
    runs on the Playwright `BrowserContext` before any page opens (it installs `context.route()` mocks); a
    `--steps` module's default export `(page) => Promise` runs after navigation and load, before measuring.
    The package's version carries no login helper and no project credentials.
- **correspondence** pairs design nodes with elements and verifies the pairs in code (Galatea's rules:
  type, injectivity, reading order, text, size; never position). The pairs come from a **proposer**:
  - `recorded`: a saved `{pairs, unmapped}` file;
  - `command`: any executable that reads both trees as JSON on stdin and prints a proposal. The package
    ships no model client; ui-hill-climb points this at Kimi, Galatea at its own provider.
  - Code Connect is left out of the first version (my call): Galatea detects a map but never consumed one
    (`design-measure.ts` stops with "NOT IMPLEMENTED"), and there is no example payload to build against.
    The proposer interface takes it later without changes.
- **spec** compares accepted pairs: box geometry, radius, token-bound properties, and **gaps and padding**
  from auto-layout. Gaps are compared between accepted siblings and padding between a parent and its first
  and last child, so a spacing change that resizes an element is reported as a spacing mismatch instead of
  dropping the pair (the gap Galatea's survey found). Tolerance floor 2px (Figma stroke vs CSS border).
  Values compared are resolved values only (my call): box geometry, gaps, padding, radius and border width
  from the node; fill colour, font family, size, weight and line height from fills and text style; effects
  from `effects`. Token identity is not checked, because computed style does not say which variable produced
  a value and Figma's variables endpoint is Enterprise-only. When a resolved value matches a token-map row,
  the finding names that token so the reader sees which one was meant.

  Ruling (how a spacing defect survives the size rule): the verifier's rules stay as they are, but a pair
  whose **only** failed rule is `size_plausible` is kept as size-differing instead of dropped when either
  its text matches exactly, or its element is the nearest common ancestor of two or more accepted pairs whose
  design nodes share its design node as parent. Such a pair yields a `size` finding (status fail, both sizes)
  and its gaps and padding are measured; any other size-only failure is dropped as before. Why: the spike's
  misses were mostly padding and gaps that resize their container, which the current rule turns into a
  "partial run". Cost if wrong: a mis-paired container yields wrong spacing numbers; the identity conditions
  above keep that to containers whose children already paired.
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

`scale` is CSS px per design px: the live root font size divided by the configured design root font size
(1 when the project does not scale its root). Ruling: it replaces Galatea's root-box ratio
(`domRoot.width / designRoot.width`) everywhere, including the verifier's size rule; the root box is used
only to translate origins, and a root whose size differs from the design root's (after scale) is reported as
its own `root-size` finding instead of being normalised away. Why: the ratio hides a root that is the wrong
size, which is a defect class the spike missed. Cost if wrong: findings shift by a constant factor on
projects with an unusual root; Galatea has one recorded baseline (one component), re-recorded on migration.

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
- The rulings above (packaging, spacing through the size rule, scale) are the builder check's questions
  settled without the owner; each states its cost if wrong. The builder check's full answer is kept locally.
- Whether Galatea's move happens before or after ui-hill-climb's restructure: either order works because
  both pin a tag.
