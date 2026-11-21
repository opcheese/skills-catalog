---
name: ui-measure
description: Use when rendered UI needs deterministic geometry checks or numeric comparison with a saved or live design node, without asking a model to judge pixels.
---

# UI measure

Run **geometry** when no design is available or when checking clipping, collapsed text, off-canvas content, flush edges, and forbidden scrollbars. Run **spec** when a design node and a correspondence proposer are available; it measures boxes, spacing, radii, borders, colour, typography, and effects.

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
