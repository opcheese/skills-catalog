---
status: current — triage, nothing fixed yet
last-verified: 2026-11-08
owner: Kirill (opcheese)
---

# kimi-delegation 1.2.2: OOOCV field report, triaged

Source: a message from the OOOCV builder session, sent 2026-11-08 at Kirill's request. It covers
runs from 05.11 to 08.11. Their full evidence is in `~/w/ooocv/.demo-ooocv/.build-notes/research/kimi-model-ledger.md`.

## Deficiencies, with a first check against the code

| # | Report | Checked | Priority |
| --- | --- | --- | --- |
| 1 | Default model `k3` is the 1M variant at about twice the quota, and it is refused as ambiguous once two providers declare `k3` | Confirmed: `DEFAULT_MODEL="k3"` (`kimi-delegate:17`); the ambiguity refusal is at :228 | High (OOOCV's top 3) |
| 2 | The model check validates against a stale list (the plan list is cached at login; imported providers have hand-written lists) | Plausible; the check reads `config.toml` | Medium: add a "your list may be stale, run `kimi login`" hint to the refusal |
| 3 | The provenance line names the requested model, never the served one | Matches the SKILL.md design; Kimi exposes nothing better | Low: add a caveat in the docs |
| 4 | A quota or rate limit exits 1 like any other failure, with empty stdout | Confirmed: `die()` always exits 1 | High (OOOCV's top 3): a distinct exit code (75) plus one parsable stderr line with the window and reset |
| 5 | `--via claude` spends the subscription even with a provider-qualified model | To verify | High (OOOCV's top 3): refuse or warn |
| 6 | On `--via kimi`, the thinking text and progress chatter come out on stdout as `•` lines | Matches our own outputs | Medium: document it, or offer `--final-only` |

## For the docs

- **Quota is metered per model:** `k3` costs about twice `k3-256k`, and highspeed IDs cost 2–3×.
- **K3.1 Pro rejects thinking-off** with HTTP 400. Switching model mid-session loses the cache.
- **CLI upgrades are machine-wide:** one session moved the CLI from 0.38.0 to 2.5.1 under a peer.
- **A quota helper must check both the 5-hour and the weekly window.** OOOCV's own `kimi-usage.sh` failed open on the weekly one (raised with light separately).
- **"Do not" lesson:** check a reviewer's counterexample against the production write path before acting on it. A K3.1 Pro fix-check rested on a false premise, which led to a wrong fix that was then reverted.

## Model notes, from about 27 K3.1 Pro runs

- **K3.1 Pro** is a strong reviewer: it found real blockers in a code review, and all eight findings of a design review were confirmed. Quota is its practical limit.
- **K2.8 Preview** (`kimi-for-coding`) is good for mechanical coding and drafting, not for reviews.
