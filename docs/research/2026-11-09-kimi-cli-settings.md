---
status: current
last-verified: 2026-11-09
owner: Kirill (opcheese)
---

# Kimi Code CLI 2.5.1: settings and env variables that matter to kimi-delegation

Sources: the official docs (config files, env vars, overrides, providers) and the 2.5.1 binary
itself. Both are saved in `sources/2026-11-09-kimi-cli-2.5.1-settings/`. The binary names 125
`KIMI_*` variables. The docs cover most of them; the rest are TUI, cron, dev-server and debug
internals.

The docs set three ground rules:
- **Command-line flags beat `config.toml`,** and the config file is user-level only: there is
  no per-project config. `KIMI_CODE_HOME` is the only way to isolate one setup from another.
- **The shell's `KIMI_API_KEY` is never read.** A provider's key comes from `api_key`,
  `api_key_env`, or the provider's `[providers.<name>.env]` table in `config.toml`. The
  `KIMI_MODEL_*` family is the one other channel.
- **A few env variables override specific config fields.** They are listed one by one; there is
  no general fallback from env to config.

## What changes for the skill

| Setting | What it does | Consequence for kimi-delegation |
| --- | --- | --- |
| `KIMI_MODEL_THINKING_EFFORT` | Forces `thinking.effort` on every request (kimi provider only), bypassing the model's `support_efforts` | **SKILL.md is wrong.** It says no per-invocation effort dial exists, but this is one. Expose it as `--effort`. K3.1 Pro still rejects thinking-off. |
| `KIMI_CODE_NO_AUTO_UPDATE=1` (legacy `KIMI_CLI_NO_AUTO_UPDATE`) | Turns off the update preflight entirely: no check, no background install, no prompt | **This is how the CLI changed under a peer** (0.38.0 → 2.5.1 in 17 minutes): a run can install an update in the background. The delegate should set it on every run. |
| `api_key_env` on a provider | Reads the key from a named shell variable on every request, instead of plain text | **The office key is plain text in `config.toml`.** Recommend `api_key_env`. It fails fast when the variable is unset, with no silent fallback. |
| `[models."<alias>".overrides]` | User fields that survive managed catalog refreshes (`max_context_size`, `max_input_size`, `capabilities`, `support_efforts` and more) | The supported place for hand fixes to a model entry. A plain top-level edit can be rewritten by a refresh. |
| `max_context_size`, `max_input_size` (model fields) | The window the CLI budgets and compacts against | **A suspect for "tokenization failed":** the hand-written `kimi-for-coding/k3.1-pro` declares 1,048,576. If the office endpoint accepts less, the CLI never compacts before the server refuses. Test with an override of `max_input_size`. |
| `[read] max_chars` / `default_max_chars` | Character budget per Read call (default 100,000) | One read is capped, but 27 whole files across many reads still add up. This is consistent with the size hypothesis. |
| `[loop_control] reserved_context_size` | Compacts when the remaining window falls below this | Only helps if the declared window is the true one. |
| `KIMI_TOKEN_COUNTING_STRATEGY` | `measured`, `estimated` or `measured+estimated` | Diagnostic only. |
| `KIMI_LOG_LEVEL=debug` | Log level (default `info`) | **The next diagnostic:** at `info`, the log recorded neither the tokenization error nor the model served. Debug may show the request and the response model. Check before using it on the served-model caveat (item 3). |
| `KIMI_LOOP_MAX_STEPS_PER_TURN`, `KIMI_LOOP_MAX_ATTEMPTS_PER_STEP` | Bound the agent loop (default unlimited steps, 10 attempts) | Bounds for unattended delegation. Leave the default unless a run loops. |
| `KIMI_SUBAGENT_TIMEOUT_MS`, `KIMI_CODE_SWARM_TIMEOUT_MS` | Wall-clock cap per sub-agent (default 2 h) | Worth capping for named agents that orchestrate. |
| `KIMI_CODE_BACKGROUND_PRINT_BACKGROUND_MODE` | What `kimi -p` does with pending background tasks: `exit`, `drain` or `steer` (default `steer`) | K2.8 ran background commits on its own (OOOCV, S9-C3). A one-shot delegation may want `drain`, or `exit` for read-only runs. |
| `KIMI_CODE_INFINITE_RETRY` | Retries failed LLM requests forever, honouring Retry-After | **Must never be set for delegation:** a spent quota would hang the run instead of failing. The delegate should unset it. |
| `KIMI_CODE_HOME` | The data root: config, credentials, sessions, logs | Isolation between sessions and tests. Our tests already use it. Sessions sharing a home share config and credentials. |
| `KIMI_DISABLE_TELEMETRY=1` | Turns off anonymous telemetry | A sensible default for delegated runs. |
| `KIMI_MODEL_TEMPERATURE`, `KIMI_MODEL_TOP_P` | Global sampling, kimi provider only | Not needed. |
| `KIMI_MODEL_*` family | Builds a temporary provider and model from env (the name and the key are required) | An alternative to editing `config.toml` for a one-off key. It is outranked by `-m`, which the delegate always passes, so it can't be mixed with our alias check. |
| `[tools] enabled` / `disabled` | A global tool allowlist or denylist, enforced before execution | Our pinned agent file already limits tools per run. |
| `KIMI_CODE_DANGEROUS_COMMAND_GUARD` (undocumented) | Binds to `permission.dangerousCommandGuard` | Leave on. |
| `KIMI_CODE_MODEL_CATALOG_REFRESH_ON_START`, `..._INTERVAL_MS` (undocumented) | The catalog refresh in the `kimi web` server, every 6 h | Not reachable from `kimi -p`. For a stale list, use `kimi login` (the plan) or re-import the provider. |

Two related CLI commands: `kimi provider list` shows the configured providers and their model
counts, and `kimi doctor` validates the config files.

## Added to the 1.3.0 plan

- **8. Safe environment on every run:** set `KIMI_CODE_NO_AUTO_UPDATE=1` and
  `KIMI_DISABLE_TELEMETRY=1`, and unset `KIMI_CODE_INFINITE_RETRY`.
- **9. `--effort low|high|max`,** mapped to `KIMI_MODEL_THINKING_EFFORT` on Path A, and
  reported in the provenance line instead of "effort from config.toml". Correct the
  *Thinking is on* section.
- **Docs:**
  - `api_key_env` for imported providers;
  - `overrides` for hand fixes to a model entry;
  - the `max_input_size` override as the remedy to test for "tokenization failed";
  - `KIMI_LOG_LEVEL=debug` for diagnosis;
  - `kimi provider list` and `kimi doctor`.
- **Once quota is back:** replay S13-C3 with `KIMI_LOG_LEVEL=debug`. Then try a lower
  `max_input_size` override on `kimi-for-coding/k3.1-pro`.
