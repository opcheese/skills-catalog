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

## Fix plan for 1.3.0 (paused 2026-11-08: the 5-hour quota is spent)

The output-shape probe in `sources/2026-11-08-kimi-output-probe/` hit the 5-hour limit on both
formats. Its stderr is a third real sample of the quota message. Resume once the window resets.

- **1. Default model:** change `DEFAULT_MODEL` to `k3.1-pro`. An ambiguous bare name stays
  refused: the script never picks which account to bill.
- **2. Stale list:** the "not a model" refusal adds that the plan's list is cached at
  `kimi login` (run it again), and that an imported provider's list is hand-written in
  `config.toml`. SKILL.md says the same.
- **3. Served model:** the provenance line gains `served=unconfirmed`, and SKILL.md carries a
  caveat about the silent fallback to K2.8 Preview.
- **4. Quota:** run the child instead of `exec`-ing it, and tee its stdout and stderr. On a
  non-zero exit, match `usage limit` or `(429)` and exit 75, with one line:
  `kimi-delegate: quota-exhausted window=5-hour|weekly|unknown reset=window-end`. Kimi gives no
  reset time. Path A reports it on stderr (`provider.api_error`); Path B on stdout
  (`API Error: Request rejected (429)`).
- **5. `--via claude` with a provider-qualified model:** if the provider holds its own key
  (not OAuth) and no `KIMI_API_KEY` is set, refuse, naming `--via kimi`. If a key is set, warn
  that the env key is what gets spent.
- **6. Output:** add `--final-only`. Its shape needs the probe to finish first: does the text
  format put thinking on stdout, and what does stream-json's final assistant message look like?
- **Docs:** per-model quota cost; K3.1 Pro rejects thinking-off; switching model mid-session
  loses the cache; CLI upgrades are machine-wide; check both quota windows; under *Do not*,
  check a reviewer's counterexample against the production write path.
- **Tests first,** in the hermetic `test-kimi-delegate.sh`, for each item (fake `kimi` and
  `claude` that print the 5-hour and weekly messages). Then one live run per path once quota
  is back.
