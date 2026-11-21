# ui-measure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `ui-measure` plugin: a model-free CLI that measures a rendered UI against a Figma node
(spec conformance, moved from Galatea) and against layout sanity rules (geometry), with a baseline.

**Architecture:** TypeScript units under `plugins/ui-measure/src/` (figma, dom, correspondence, spec,
tokens, geometry, baseline, report), a CLI bundled by esbuild into a committed `dist/ui-measure.mjs`, and a
short skill. Tests are vitest; browser tests drive Playwright Chromium against fixture pages the tests serve.

**Tech Stack:** Node 24, pnpm 10, TypeScript, vitest, esbuild, Playwright (peer dependency).

**Spec:** `docs/superpowers/specs/2026-11-20-ui-measure-design.md`

**Execution:** subagent-driven-development — ten tasks share interfaces closely, and a fresh reviewer per
task is the only second reader before the branch review. Test-loop subagents run on Kimi first, Haiku at most.

## Global Constraints

- Public repo: no client names, Figma file keys, people, credentials or client frames in code, fixtures,
  tests, comments or commit messages. Before each commit:
  `git diff --cached | grep -i -f .superpowers/public-denylist.txt && exit 1`. The denylist is local and
  gitignored (it holds the very strings it keeps out); an executor without it asks for it before committing.
- Source ported from `~/w/galatea` (private) keeps its rule comments; any comment naming a client, a PM
  number or a person is rewritten generically.
- No model client in the package. A model may only propose pairs, through the `command` proposer.
- Every finding status is `pass | fail | not_comparable`; `not_comparable` always carries `reason`.
- Tolerance floor 2px for geometry (font size and line height 0.5px — spec amended); size plausibility 8px (Galatea's `SIZE_TOLERANCE_PX`); both scaled by `scale`. A property present on one side and absent on the other (border, radius, shadow) is a presence fact, compared with zero tolerance.
- Exit codes: 0 clean, 1 mismatches, 2 not comparable, 3 usage or setup error.
- Playwright is a peer dependency, never bundled; missing Playwright exits 3 with an install hint.
- Conventional commits with the session trailer. No numbered markdown headings.

## Review Focus

- Figma nodes with `visible: false`, and DOM elements with `display:none` or `visibility:hidden`: neither may
  produce findings or pairs (Task 4, Task 6).
- Text that differs only in whitespace or line wrapping still counts as matching text (Task 3).
- Pages whose web fonts are still loading: measuring before `document.fonts.ready` gives wrong boxes (Task 6).
- Device pixel ratio other than 1: boxes are CSS px, so findings must not change with DPR (Task 6).
- A root selector that matches nothing, or a page that returns HTTP 500: `not_comparable`, exit 2, never 0
  (Task 6, Task 10).

---

### Task 1: Plugin scaffold and the git `path:` dependency check

**Files:**
- Create: `plugins/ui-measure/.claude-plugin/plugin.json` (name `ui-measure`, version `0.1.0`, MIT),
  `plugins/ui-measure/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/version.ts`,
  `test/version.test.ts`, `scripts/check-path-dep.sh`
- Modify: `.claude-plugin/marketplace.json` (add the plugin), `README.md` (one row)

**Interfaces:**
- Produces: `export const VERSION: string` (read from package.json at build time); pnpm scripts `test`,
  `build` (esbuild `src/cli.ts` → `dist/ui-measure.mjs`, platform node, format esm, `playwright` external).

- [ ] **Step 1:** test `VERSION equals package.json version`. Run `pnpm -C plugins/ui-measure test`; FAIL.
- [ ] **Step 2:** add the scaffold and `version.ts`; test PASSES.
- [ ] **Step 3:** `scripts/check-path-dep.sh`: in a scratch dir under the scratchpad, `pnpm init` and
  `pnpm add "git+https://github.com/opcheese/skills-catalog.git#<branch>&path:plugins/ui-measure"`, then
  `node -e "import('ui-measure/version')"`. Run it after pushing the branch. Expected: prints the version.
  If pnpm refuses `path:`, stop and report: the packaging ruling changes.
- [ ] **Step 4:** commit `feat(ui-measure): scaffold the plugin`.

### Task 2: Port the correspondence verifier with scale

**Files:**
- Create: `src/correspondence/types.ts` (Box, DesignNode, DomElement, DesignTree, DomTree, Proposal,
  RejectionRule, PairVerdict, Verification — copied from Galatea `scripts/lib/correspondence.ts`),
  `src/correspondence/verify.ts`, `test/correspondence/verify.test.ts` (ported from
  `correspondence.test.ts`, the one client reference rewritten)

**Interfaces:**
- Produces: `verifyMapping(proposal: Proposal, design: DesignTree, dom: DomTree, opts: { scale: number }): Verification`;
  `normalise(box: Box, designRoot: Box, domRoot: Box, scale: number): Box` — maps a design box into the DOM
  root's CSS space: translates by the roots' origins and multiplies by `scale` (CSS px per design px, the
  spec's definition); it no longer uses the roots' width ratio.

- [ ] **Step 1:** port the tests; replace each expectation that relied on the width ratio with `scale: 1`
  and equal-sized roots. Add `normalise ignores root width: design root 300 wide, dom root 600 wide,
  scale 1 → a 100px box stays 100px`; `design 200 wide at scale 0.5 matches DOM 100`. Run; FAIL (module missing).
- [ ] **Step 2:** port `verify.ts`; apply the `scale` change. All ported tests PASS.
- [ ] **Step 3:** commit `feat(ui-measure): port the correspondence verifier`.

### Task 3: Size-differing pairs and proposers

**Files:**
- Modify: `src/correspondence/types.ts` (`PairVerdict.outcome` gains `"size_differs"`;
  `Verification.sizeDiffers: PairVerdict[]`), `src/correspondence/verify.ts`
- Create: `src/correspondence/propose.ts`, `test/correspondence/size-differs.test.ts`,
  `test/correspondence/propose.test.ts`

**Interfaces:**
- Produces: `type Proposer = { kind: "recorded"; file: string } | { kind: "command"; argv: string[] }`;
  `propose(p: Proposer, design: DesignTree, dom: DomTree): Promise<Proposal>` — `command` writes
  `{design, dom}` JSON to stdin and parses stdout as a Proposal; non-zero exit or bad JSON throws
  `ProposalError`.
- Rule (spec, *Units* → spec): a pair whose only failed rule is `size_plausible` becomes `size_differs` when
  its texts match after collapsing whitespace, or its element is the nearest common DOM ancestor of ≥2
  accepted pairs whose design nodes all have its design node as parent. Otherwise it stays
  `not_comparable`.

- [ ] **Step 1:** tests: `text match, 20px taller → size_differs`; `"Save  changes\n" vs "Save changes" →
  size_differs`; `container 16px wider whose two children are accepted pairs under its design node →
  size_differs`; `container 16px wider with one accepted child → not_comparable`; `wrong type and wrong size
  → not_comparable with rule type`. propose: `recorded file round-trips`; `command "cat fixture.json"
  returns it`; `command exiting 1 throws ProposalError`. Run; FAIL.
- [ ] **Step 2:** implement; PASS. Also run Task 2 tests; PASS.
- [ ] **Step 3:** commit `feat(ui-measure): keep size-differing pairs so spacing can be measured`.

### Task 4: Figma reading and facts

**Files:**
- Create: `src/figma/read.ts`, `src/figma/facts.ts` (port of `design-facts.ts`), `src/figma/fetch.ts`,
  `test/figma/*.test.ts`, `test/fixtures/figma/card.json` (hand-written, a generic card: frame with
  auto-layout vertical, itemSpacing 12, padding 24, radius 16, a title TEXT, a body TEXT, a hidden badge)

**Interfaces:**
- Produces: `readNode(json: unknown, nodeId?: string): RawNode` (accepts a `/v1/files/:key/nodes`
  response or a bare node); `flatten(node: RawNode): DesignTree` with `DesignNode` extended by
  `layout?: { mode: "HORIZONTAL" | "VERTICAL"; gap: number; padding: [number, number, number, number] }`,
  `radius?: number`, `strokeWeight?: number`, `fill?: string` (`#rrggbb` or `rgba(...)`),
  `font?: { family: string; size: number; weight: number; lineHeight?: number }`, `effects?: string[]`;
  `fetchNode(fileKey: string, nodeId: string, token: string): Promise<unknown>` (token from
  `FIGMA_TOKEN`; never logged).

- [ ] **Step 1:** tests: `flatten skips visible:false nodes and their children`; `card layout gap 12,
  padding [24,24,24,24]`; `title font fields copied`; `fill colour from the first visible SOLID fill`;
  `flatten output JSON contains no fileKey even when the response has one`; ported design-facts tests.
  Run; FAIL.
- [ ] **Step 2:** implement; PASS. Commit `feat(ui-measure): read Figma nodes and their facts`.

### Task 5: Token maps

**Files:**
- Create: `src/tokens/rows.ts` (port of `token-map.ts` + `translate.ts`), `src/tokens/dtcg.ts`,
  `src/tokens/index.ts`, tests, `test/fixtures/tokens/{rows.json,dtcg.json}`

**Interfaces:**
- Produces: `type TokenProperty = "color"|"spacing"|"radius"|"fontSize"|"lineHeight"|"fontWeight"|"fontFamily"|"effect"|"borderWidth"`;
  `interface Token { name: string; property: TokenProperty; value: string }`;
  `loadTokens(path: string, format: "rows" | "dtcg"): { tokens: Token[]; errors: string[] }`;
  `tokenFor(tokens: Token[], property: TokenProperty, value: string): Token | undefined` (colours compared
  case-insensitively after normalising to `#rrggbb[aa]`, lengths numerically).

- [ ] **Step 1:** tests: `unknown property → error naming the row, other rows kept`; `null row → error,
  other rows kept`; `DTCG nested groups flatten to dot names, $type maps to property`; `tokenFor matches
  #FFF and #ffffff`. Run; FAIL.
- [ ] **Step 2:** implement; PASS. Commit `feat(ui-measure): load row and DTCG token maps`.

### Task 6: Page access, adapters and scale

**Files:**
- Create: `src/dom/adapters.ts`, `src/dom/open.ts`, `src/dom/tree.ts`, `test/helpers/serve.ts` (static
  server on a free port), `test/fixtures/pages/{harness.html,storybook/iframe.html,card.html,screen.html,fonts.html}`,
  `test/dom/*.test.ts`

**Interfaces:**
- Produces: `type Adapter = { kind: "designharness"; baseUrl: string; component: string; state?: string }
  | { kind: "storybook"; baseUrl: string; storyId: string } | { kind: "url"; url: string; root: string; mock?: string; steps?: string }`;
  `interface PageSpec { adapter: Adapter; viewport: [number, number]; screen?: [number, number]; dpr?: number; designRootFontPx?: number }`;
  `openPage(spec: PageSpec): Promise<OpenPage | NotComparable>` where
  `OpenPage = { page; rootSelector: string; scale: number; info: Report["page"]; close(): Promise<void> }`
  and `NotComparable = { notComparable: string }`; `domTree(p: OpenPage): Promise<DomTree>`.
- Behaviour: waits for load and `document.fonts.ready`; HTTP status ≥400 or a missing root →
  `NotComparable`; `scale = liveRootFontPx / (designRootFontPx ?? liveRootFontPx)`; elements hidden by
  `display`, `visibility` or zero opacity are left out of the tree; mock runs before the page opens, steps
  after load (spec contract).

- [ ] **Step 1:** tests: `designharness root is first child of #harness-root`; `storybook root is first
  child of #storybook-root`; `missing root → notComparable "root ... not found"`; `HTTP 500 →
  notComparable`; `screen.html with a max-device-width rule renders differently at screen 1280x800 vs
  1920x1080`; `card.html at root 10px and 5px gives scale 1 and 0.5 with designRootFontPx 10`; `boxes
  equal at dpr 1 and 2`; `fonts.html (font with 1s delayed response) measured after fonts ready`; `hidden
  element absent from tree`; `--mock module routes /api/x`; `--steps module clicks before measuring`.
  Run; FAIL.
- [ ] **Step 2:** implement (Playwright resolved by dynamic import; failure throws `SetupError`). PASS.
- [ ] **Step 3:** commit `feat(ui-measure): open pages through harness adapters`.

### Task 7: Spec comparison

**Files:**
- Create: `src/spec/compare.ts`, `src/report/types.ts` (the spec's `Finding`, `Report`, `Status`
  verbatim), `test/spec/compare.test.ts`, `test/fixtures/pages/card-{clean,padding,gap,radius,colour,root}.html`
  (each matches `card.json` except the one named defect)

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces: `compareSpec(design: DesignTree, dom: DomTree, v: Verification, opts: { scale: number; tokens?: Token[]; unthemed?: string[] }): { findings: Finding[]; coverage: Report["coverage"] }`.
- Compares on accepted and size_differs pairs: box geometry, gap between consecutive siblings along the
  layout axis, padding from parent to first and last child, radius, border width, fill colour, font family,
  size, weight, line height, effects. Size_differs pairs add a `size` finding. Tolerance
  `max(2, …)` px after scale. A root whose scaled size differs over tolerance adds `root-size`. A matching
  token's name goes in `expected`. Verdict input: `dropped > pairsProposed / 2` → caller marks
  `not_comparable`.

- [ ] **Step 1:** tests: `card-clean → no fail findings`; `card-padding (32 vs 24) → padding fail, deltaPx 8,
  not a dropped pair`; `card-gap (20 vs 12) → gap fail`; `card-radius (8 vs 16) → radius fail`;
  `card-colour → colour fail naming the token`; `card-colour with its colour in unthemed → pass`; `card-root (root 40px wider) → root-size fail`; `1px off →
  pass (floor 2)`; `at scale 0.5 the clean card is still clean`. Run; FAIL.
- [ ] **Step 2:** implement; PASS. Commit `feat(ui-measure): compare rendered pairs against Figma facts`.

### Task 8: Geometry detectors

**Files:**
- Create: `src/geometry/detect.ts` (runs in page via `page.evaluate`), `test/geometry/detect.test.ts`,
  `test/fixtures/pages/geo-{clipped,zero,offcanvas,flush,scrollbar}-{bad,good}.html`

**Interfaces:**
- Produces: `interface GeometryConfig { insetPx: number /* default 4 */; nonScrolling: string[] }`;
  `detectGeometry(p: OpenPage, cfg: GeometryConfig): Promise<Finding[]>` with kinds `clipped`,
  `zero-size`, `off-canvas`, `flush-edge`, `scrollbar`.
- Definitions: clipped = an element with text whose box extends past an ancestor with `overflow` other than
  visible (and that ancestor is not scrollable); zero-size = own text and width or height 0; off-canvas =
  box wholly or partly outside the viewport (unless inside a scroll container); flush-edge = a text box
  closer than `insetPx` to the padding edge of its nearest bordered or backgrounded container; scrollbar = a
  `nonScrolling` match with scrollHeight > clientHeight or scrollWidth > clientWidth.

- [ ] **Step 1:** tests: each `-bad` page yields exactly one finding of its kind; each `-good` page (same
  markup, defect removed) yields none. Run; FAIL.
- [ ] **Step 2:** implement; PASS. Commit `feat(ui-measure): detect layout defects without a design`.

### Task 9: Baseline

**Files:**
- Create: `src/baseline/baseline.ts` (port of `design-baseline.ts` + `design-record.ts`), tests

**Interfaces:**
- Produces: `baselineKey(f: Finding): string` (check, kind, design node or selector, rounded geometry; no
  node ids alone); `classify(findings: Finding[], baseline: Finding[]): Finding[]` (sets `origin`);
  `recordBaseline(dir: string, target: string, r: Report): void` — throws `PartialRunError` when
  `r.verdict === "not_comparable"`; `readBaseline(dir, target): Finding[]`.

- [ ] **Step 1:** tests: ported baseline/record tests; `recorded padding fail → inherited next run`; `new
  gap fail → introduced`; `partial run refused`. Run; FAIL. Implement; PASS.
- [ ] **Step 2:** commit `feat(ui-measure): baseline introduced vs inherited findings`.

### Task 10: CLI, config, bundle and skill

**Files:**
- Create: `src/config.ts`, `src/cli.ts`, `src/report/write.ts`, `skills/ui-measure/SKILL.md`,
  `dist/ui-measure.mjs` (built), `test/cli.test.ts`, `test/fixtures/ui-measure.config.json`

**Interfaces:**
- Consumes: everything above.
- Produces: config shape `{ targets: Record<string, { adapter: Adapter; viewport; screen?; designRootFontPx?; node?: string; figma?: { fileKey: string; nodeId: string } }>; tokens?: { path; format }; unthemed?: string[]; geometry?: GeometryConfig; baselineDir?: string }`
  (`fileKey` may also come from `FIGMA_FILE_KEY`); commands per spec *CLI*; `--json OUT` writes the Report;
  stdout gets a summary of at most 20 lines.

- [ ] **Step 1:** CLI tests on fixtures (run `node dist/ui-measure.mjs` after `pnpm build`):
  `geometry on geo-clipped-bad → exit 1, JSON has one clipped fail`; `geometry on a good page → exit 0`;
  `spec on card-padding with a recorded proposal → exit 1`; `spec where the root is missing → exit 2`;
  `unknown target → exit 3`; `Playwright unresolvable (NODE_PATH empty, run from a temp dir) → exit 3 with
  "install playwright"`; `baseline record then check on the same page → exit 0`. Run; FAIL.
- [ ] **Step 2:** implement; build; PASS.
- [ ] **Step 3:** SKILL.md (under 400 words): when to run geometry vs spec, the three outcomes, that
  findings are advisory unless the project says otherwise, how to wire a `command` proposer to Kimi via
  kimi-delegation. Description starts "Use when".
- [ ] **Step 4:** full suite `pnpm -C plugins/ui-measure test` PASS; denylist grep over the plugin
  finds nothing; commit `feat(ui-measure): CLI, config, bundle and skill`; push.
