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

## Follow-up, 2026-11-09: "tokenization failed" (OOOCV, S13-C3)

Two `--via kimi` reviews on `kimi-for-coding/k3.1-pro` (office key) died with
`provider.api_error: Invalid request: tokenization failed`, rc 1 and empty stdout. Checked
locally without spending quota:

- **Not the model alias or the account.** Four runs on the same alias and key succeeded
  between 03:35 and 05:45 (S13-C2, S13-C4).
- **Not bad bytes.** The patch (98,665 bytes) and all 27 files it touches (707,493 bytes) are
  valid UTF-8, with no control characters, BOMs, private-use or astral code points. The text is
  heavily Cyrillic.
- **Kimi's log records nothing about it,** only unrelated index-flush warnings.
- **Likely cause, unconfirmed: request size.** If the agent reads every touched file whole, the
  request is about 800 KB of text, mostly Cyrillic, which tokenizes densely. The second brief
  asked for touched functions only, but the read-only agent's Read tool may still load whole
  files.
- **The office provider entry is hand-written** (`config.toml:136`). It differs from the plan's
  `kimi-code/k3.1-pro` entry: no `always_thinking` and no `dynamically_loaded_tools`
  capability, and a `max_output_size` of 131072. That is not the cause, since the same entry
  succeeded earlier, but it is item 2 in practice.
- **The partial reasoning is already kept.** In CLI 2.5.1 the text format writes thinking to
  stderr (the `•` lines), so the stderr file holds the half-written findings. That also settles
  part of item 6: in text mode, stdout carries only the answer.

Added to the 1.3.0 plan:
- **7. Request-rejected errors:** match `provider.api_error: Invalid request` and exit 65,
  with `kimi-delegate: request-rejected reason=<text>` and a hint to shrink the input (pass the
  diff and function excerpts, not whole files) or split the review. Keep the stderr path in that
  line so the partial reasoning is easy to find.
- **To confirm once quota is back:** replay S13-C3 with a pre-cut excerpt bundle. If it passes,
  size is the cause; then bisect for the threshold.

## Follow-up, 2026-11-09: CLI settings

See `2026-11-09-kimi-cli-settings.md`. It adds items 8 (a safe environment on every run) and 9
(`--effort`) to the plan, and corrects SKILL.md's claim that no per-invocation effort dial exists.

## Follow-up, 2026-11-09: S13-C3 replay. Size is ruled out; the cause is not found

The replay ran on `kimi-for-coding/k3.1-pro` (office key), through kimi-delegation 1.3.0. Raw
outputs are in `sources/2026-11-09-kimi-size-replay/`.

| Run | Bundle | Context at the end | Result |
| --- | --- | --- | --- |
| full | 817,876 bytes (diff and all 27 touched files, whole) | 254,790 tokens, 10 contiguous Reads | completed; returned the end marker |
| halfA | 415,776 bytes | 133,334 tokens | completed |
| halfB | 402,159 bytes | 123,105 tokens | completed |

The two original failures died at **85,404 and 192,991 tokens**, below what the full replay
carried. Ruled out, using Kimi's own session wire logs (`~/.kimi-code/sessions/*/agents/main/wire.jsonl`):

- **Request size,** at least up to 255k tokens of this very material.
- **Bad characters:** no control, surrogate, private-use, unassigned, BOM or U+FFFD characters
  anywhere in the failed contexts.
- **Special-token look-alikes** (`<|...|>`, `<s>`, `[EOS]` and similar): none.
- **Preserved thinking alone:** every run, failed or not, sends `thinkingKeep: all`. The full
  replay carried 22 encrypted thinking blocks and passed.
- **Parallel tool calls alone:** the failed runs made 6 and 10 batches of 5–6 calls each, but
  OOOCV's S13-C4 reviews on the same key and model made 9–10 batches of up to 9 calls and
  completed.

Still open:
- **A transient server-side fault.** Both failures fell within four minutes (06:27 and 06:31
  UTC), and a third S13-C3 session at 07:14 completed. The traceIds are
  `29fe7b298af12f95217edf1fc341c6b9` and `20c6009405fe8570a74a9bf4e4c48595`.
- **A content trigger on the server that is invisible client-side.**

The next test that tells them apart: replay OOOCV's exact narrow brief (the `turn.prompt` of
session `07ba4cd0` holds it) on the same tree. If it completes, the fault was transient.

What changes for users: 1.3.0 already reports this as exit 65 with a hint to shrink the input.
The hint stays, because shrinking is harmless. But the evidence no longer says size is the
cause, so the hint now also says that retrying once is reasonable.
