---
status: current
last-verified: 2026-11-20
owner: Kirill
---

# Manual verification: ui-measure

Step-by-step checks for the `ui-measure` plugin, using only the fixture pages that ship with it. Every
command below was run on 2026-11-20 and the expected output is what it printed.

## Setup

1. Install and build:

   ```bash
   cd ~/w/skills-catalog/plugins/ui-measure
   pnpm install
   pnpm exec playwright install chromium
   pnpm build
   pnpm test          # expect: Tests 217 passed
   ```

2. Serve the fixture pages in a second terminal and leave it running:

   ```bash
   cd ~/w/skills-catalog/plugins/ui-measure/test/fixtures/pages
   python3 -m http.server 8765 --bind 127.0.0.1
   ```

3. Make a scratch folder with a config:

   ```bash
   mkdir -p /tmp/um && cd /tmp/um
   F=~/w/skills-catalog/plugins/ui-measure/test/fixtures
   C=~/w/skills-catalog/plugins/ui-measure/dist/ui-measure.mjs
   cat > ui-measure.config.json <<EOF
   { "targets": {
     "clipped": { "adapter": {"kind":"url","url":"http://127.0.0.1:8765/geo-clipped-bad.html","root":"#root"}, "viewport":[800,600] },
     "clean":   { "adapter": {"kind":"url","url":"http://127.0.0.1:8765/geo-clipped-good.html","root":"#root"}, "viewport":[800,600] },
     "card-padding": { "adapter": {"kind":"url","url":"http://127.0.0.1:8765/card-padding.html","root":"#card"}, "viewport":[800,600], "designRootFontPx":16, "node":"$F/figma/card.json" },
     "missing": { "adapter": {"kind":"url","url":"http://127.0.0.1:8765/card-clean.html","root":"#nope"}, "viewport":[800,600] }
   }, "baselineDir": "/tmp/um/baselines" }
   EOF
   ```

## Happy paths

| step | command | expect |
| --- | --- | --- |
| Clean page | `node $C geometry --config ui-measure.config.json --target clean; echo $?` | `ui-measure clean: 0 failed…`, exit `0` |
| Clipped text | `node $C geometry --config ui-measure.config.json --target clipped; echo $?` | `fail geometry/clipped … 42px past it`, exit `1` |
| Padding against Figma | `node $C spec --config ui-measure.config.json --target card-padding --proposer recorded --proposal $F/card-proposal.json; echo $?` | `padding #card: top 24px -> top 32px` among 7 fails, `3/3 pairs accepted, 0 dropped`, exit `1` |
| JSON report | add `--json out.json` to any command | `out.json` has `tool`, `scale`, `findings`, `coverage`, `verdict` |

## Edge cases

| step | command | expect |
| --- | --- | --- |
| Root missing | `node $C geometry --config ui-measure.config.json --target missing; echo $?` | `not_comparable geometry/page #nope: root #nope not found`, exit `2` |
| Partial proposal | `node $C spec --config ui-measure.config.json --target card-padding --proposer recorded --proposal $F/card-partial-proposal.json; echo $?` | verdict `not_comparable`, exit `2`, never `0` |
| Unknown target | `node $C geometry --config ui-measure.config.json --target nope; echo $?` | an error naming the target, exit `3` |
| No Playwright | copy `dist/ui-measure.mjs` to an empty folder outside any project and run it there | message containing `install playwright`, exit `3` |

## Round trip: baseline

1. Record the defective page: `node $C baseline record --config ui-measure.config.json --target clipped; echo $?`
   → exit `1` (it has a mismatch), and `/tmp/um/baselines/clipped.json` exists.
2. Check it: `node $C baseline check --config ui-measure.config.json --target clipped; echo $?`
   → `fail inherited geometry/clipped …`, exit `0` (inherited defects do not fail a check).
3. Try to record a broken run: `node $C baseline record --config ui-measure.config.json --target missing; echo $?`
   → `REFUSING: this run was not comparable…`, nothing written, exit `2`.
4. Record again over the existing file without `--force` → refused; with `--force` → overwritten.

## Known rough edges (found during this check)

- The `baseline check` summary line says `clean: 1 failed` when the only failure is inherited; it should say
  `1 inherited`.
- One padding change produces several findings: the padding itself plus every child box it shifts. Grouping
  related findings is not built yet.
