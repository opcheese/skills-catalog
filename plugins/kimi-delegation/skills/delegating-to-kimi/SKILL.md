---
name: delegating-to-kimi
description: Use when work should go to Kimi instead of Claude - an independent second opinion on a review or design, a large mechanical pass that would burn Claude context, or any task where a different model's judgment is worth more than a faster answer. Requires either a Kimi Code subscription or a Kimi API key.
---

# Delegating to Kimi

Two ways across the provider boundary. Both are one Bash call. Neither needs
a new agent format: Path A uses Kimi's own agents, Path B uses the agent
definitions already in `.claude/agents/`.

## Which path

| The work | Path | Command |
| --- | --- | --- |
| Read and report — review, audit, second opinion | A, read-only | `--via kimi` |
| Needs Claude Code's tools, permissions, or your `.claude/agents/` | B | `--via claude` |
| Needs Kimi to orchestrate its own sub-agents | A, named agent | `--via kimi --agent <name>` |

## Running it

The scripts live in `scripts/` beside this file and are not on `PATH`, so call
them by full path. Set the directory once, then reuse it:

```bash
# Claude Code fills in the braced form when it loads this skill:
KD="${CLAUDE_PLUGIN_ROOT}/skills/delegating-to-kimi"
# Codex, or any other harness: set KD to wherever this skill was installed
# instead, e.g. KD=~/.agents/skills/delegating-to-kimi

"$KD/scripts/kimi-delegate" \
  --via kimi -- "Review src/auth.ts for auth bypasses. Report findings only."
```

If you are reading this file, its directory is `$KD` — the scripts are one
level down in `scripts/`.

Path A defaults to a **read-only agent definition shipped with this plugin**,
passed with `--agent-file`. An unqualified `kimi -p` edits the working tree
with no approval gate at all, so something has to contain it.

It has to be a pinned *file*, not an agent *name*. Kimi resolves names
project-first, so a repository that ships `.kimi-code/agents/explore.md` with
`override: true` replaces the read-only built-in and gets full tool access
back. That is not theoretical — it was tested, and the repo's definition won.
`--agent-file` outranks project discovery, which is why the default uses it.

To let Kimi write, name an agent that can:

```bash
"$KD/scripts/kimi-delegate" \
  --via kimi --agent coder -- "Apply the rename across the repo."
```

Path B runs Claude Code itself on Kimi's model, so Kimi's output is subject to
Claude Code's own permission system:

```bash
"$KD/scripts/kimi-delegate" \
  --via claude --agent my-reviewer -- "Review the staged diff."
```

## Flags

- `--via kimi|claude` — required
- `--agent NAME` — Path A: a Kimi agent (`coder`, `explore`, `plan`, or one
  of yours in `.kimi-code/agents/`). Path B: one of your `.claude/agents/`.
  Naming an agent opts out of the pinned default and back into Kimi's normal
  discovery order, which the repository you are working in can win. Only name
  an agent in a repository you trust.
- `--cwd DIR` — run in DIR instead of the current directory
- `--output text|stream-json` — passed through (on `--via claude`, stream-json also adds the `--verbose` that `claude -p` requires)
- `--final-only` — Path A: print only the final answer, as plain text. Without
  it, stdout carries the answer behind a `•` bullet, indented, with any
  progress chatter before it. The thinking always goes to stderr, never stdout.
  On Path B, `claude -p` text output is already only the answer.
- Everything after `--` is the prompt

## Exit codes

| Code | Meaning | What to do |
| --- | --- | --- |
| 0 | The delegate finished | Read stdout |
| 75 | A Kimi quota or rate limit stopped the run. stderr ends with `kimi-delegate: quota-exhausted window=5-hour\|weekly\|unknown reset=window-end` | Move to the next budget, e.g. the Claude API credits. Kimi does not give the reset time. |
| 65 | Kimi rejected the request itself (`Invalid request`, `tokenization failed`). stderr ends with `kimi-delegate: request-rejected reason=...` | Shrink the input: one bundle of the diff and the touched functions, not whole files, or split the task. The partial reasoning is in stderr. |
| other | The child's own code | Read stderr |

Both limit failures leave stdout empty. A wrapper that only reads stdout for a
verdict sees nothing at all, so check the exit code first.

`KIMI_DELEGATE_MODEL` overrides the model, default `k3.1-pro`. Not `k3`: the
plan meters quota per model, and `k3` is the 1M-context variant at about twice
the quota (`k3-256k` costs half as much; highspeed IDs cost 2–3×). The name is checked
against the models your Kimi install declares, and an unknown one is refused
with the list of what is available. This check exists because the endpoint
itself will not do it: a request naming a model Kimi has never heard of
returns HTTP 200 and a normal answer, so without the check a typo is served by
something else with no error anywhere.

On a machine with an API key and no CLI there is no local model list, so no
model can be checked at all. An explicit one is refused — unverifiable is not
the same as valid — and `KIMI_DELEGATE_SKIP_MODEL_CHECK=1` takes that risk on
purpose. The default is let through without the flag, because blocking it
would break every delegation over a config we merely failed to parse.

Either way the run is marked `(unverified)` in the line below. Nothing there
was checked, and the default is the case nobody is watching for: `k3.1-pro` is a
Kimi Code plan name, so a key issued off that plan gets HTTP 200 from some
other model and a bill for it.

The opt-out only covers the unknowable case: when your install does declare a
list, "not on it" is a positive answer and no variable overrules it.

**The list can be stale.** It is read from `~/.kimi-code/config.toml`. The
plan's models are cached there at `kimi login`, and a CLI upgrade does not
refresh them: K3.1 Pro only appeared after a fresh login. An imported provider's
models are written by hand, labels included. So the check can refuse a model
your plan has, and the refusal says so. Put hand fixes under
`[models."<alias>".overrides]`, which survives Kimi's own refreshes.

**Nobody can see which model answered.** The line says `served=unconfirmed`
because Kimi answers HTTP 200 for any name, and a mistyped one silently falls
back to K2.8 Preview with thinking off. Neither its output nor its log names
the model that replied. The check above is the only guard.

Every run prints one line to stderr naming the route, model, endpoint, agent,
credential type, and thinking state, so an answer can be traced to what
produced it. It goes to stderr and never mixes into the answer on stdout.

## Using an API key instead of a subscription

Set `KIMI_API_KEY` (or `MOONSHOT_API_KEY`) and `--via claude` needs nothing
else — no `kimi login`, no Kimi CLI, no version gate. The key is the whole
credential.

```bash
export KIMI_API_KEY=sk-...          # from your shell or a sourced .env
"$KD/scripts/kimi-delegate" --via claude -- "Review the staged diff."
```

A key issued outside the Kimi Code coding plan is answered somewhere else, so
point the delegation there:

```bash
export KIMI_DELEGATE_BASE_URL=https://api.moonshot.ai/anthropic
```

Three things worth knowing:

- **The key never appears on a command line.** It travels by environment to
  `kimi-credential`, which prints it on a pipe to the delegated session.
  `/proc` and `ps` show every argument of every process to every user on the
  machine, so a key passed as an argument would be readable by all of them.
- **`--via claude` never spends an imported provider's key.** It authenticates
  with the subscription token or `KIMI_API_KEY`, nothing else. A model that
  resolves to a key-bearing provider (`kimi-for-coding/...`, say) is refused
  on Path B without `KIMI_API_KEY`, because it would bill the subscription.
  With `KIMI_API_KEY` set it runs, and warns that the env key is what gets
  spent. Use `--via kimi` to spend that provider's key.
- **An explicit key outranks a stored subscription token**, so on a machine
  with both, exporting the key is what decides which account gets billed. The
  `auth=` field of the provenance line says which one a given run spent.
- **`--via kimi` reaches a key through a provider, not through the
  environment.** Kimi's *managed* provider authenticates over OAuth and no
  environment variable can displace it. But the CLI takes other providers, and
  an imported one carries its own key:

  ```bash
  KIMI_REGISTRY_API_KEY=$YOUR_KEY kimi provider catalog add kimi-for-coding
  KIMI_DELEGATE_MODEL=kimi-for-coding/k3 kimi-delegate --via kimi -- "..."
  ```

  The `auth=` field then reads `provider-api-key` rather than
  `subscription-token`. Keep the key out of `config.toml` with
  `api_key_env = "NAME"` on the provider: Kimi re-reads that variable on every
  request and fails loudly if it is unset. The shell's `KIMI_API_KEY` is never
  read by the Kimi CLI itself. Path A still needs `kimi login` when you are spending
  the subscription, which is the default.

- **Name the provider when two of them offer the same model.** `k3` is offered
  by the managed provider and by any imported one, and they are different
  accounts with different bills. An unqualified name that matches more than
  one is **refused**, not resolved — a delegation must never pick which
  account to spend.

An empty value (`KIMI_API_KEY=`, which is what sourcing a `.env` without the
key leaves behind) is treated as no key at all, not as an empty credential.

## Thinking is on, and you cannot turn it off

Both paths think, always, and neither exposes a switch. Measured 2026-08-24:

- Kimi's `k3` declares the `always_thinking` capability, and the CLI refuses
  to resolve an effort of `off` for such a model. K3.1 Pro rejects thinking-off
  with HTTP 400. Effort itself (`low`, `high`, `max`) is set in `[thinking]` in
  `~/.kimi-code/config.toml`.
- Kimi documents one per-run override, `KIMI_MODEL_THINKING_EFFORT`, for
  `type = "kimi"` providers only. This skill exposes no flag for it. On
  2026-11-09, `low` and `max` gave the same thinking length on the office key,
  which is an `anthropic`-type provider, as the docs predict, and it is untested
  on the subscription. If you set it yourself it passes through, and the
  provenance line names it.
- On Path B the delegated Claude Code sends `thinking: {type: adaptive}` or
  omits the field entirely, and Kimi thinks by default in both cases.
  `MAX_THINKING_TOKENS` changes only which of those two it sends, and a
  positive value is not forwarded as a budget at all.

Do not add a thinking parameter to this skill on the strength of an accepted
request. The endpoint returns 200 for parameters it discards — a bogus effort
string and a bogus model both come back with a normal answer — so "it was
accepted" is not evidence that anything happened.

## What every run sets

`KIMI_CODE_NO_AUTO_UPDATE=1` and `KIMI_DISABLE_TELEMETRY=1`, and it unsets
`KIMI_CODE_INFINITE_RETRY`. The CLI's update preflight can install a new
version in the background, and that changes the CLI under every session on the
machine: one session moved it from 0.38.0 to 2.5.1 between two of a peer's runs.
Infinite retry would turn a spent quota into a run that never ends.

Also worth knowing: switching model mid-session loses the cache and degrades
output. Everything else Kimi reads is in
`docs/research/2026-11-09-kimi-cli-settings.md` in the catalog.

## What it refuses

- `--dangerously-skip-permissions`, on either path
- Nesting — a delegation started inside a delegated session
- `--via claude` with a model on a key-bearing provider and no `KIMI_API_KEY`
- `--final-only` together with `--output`
- Kimi CLI older than 0.38.0, which predates `--agent` and so cannot be
  contained

## Any harness, not just Claude Code

Nothing here is Claude Code specific except one path. `--via kimi` is a bash
call to the Kimi CLI and works from Codex, a script, or a bare shell. Set
`KIMI_DELEGATION_ROOT` to the install directory if the scripts cannot find
their own siblings; `CLAUDE_PLUGIN_ROOT` is accepted as an alias.

`--via claude` runs the Claude Code CLI as the delegate, so it needs `claude`
on `PATH` regardless of which harness you called from. Without it you get
`the claude CLI is not on PATH` and exit 1 — nothing half-runs.

## Requirements

`bash` and `python3`, plus one of:

- a Kimi Code subscription (`kimi login`) and CLI >= 0.38.0 — needed for
  `--via kimi` always, and for `--via claude` when there is no API key;
- a Kimi API key in `KIMI_API_KEY`, which covers `--via claude` on its own.

Note that
`kimi upgrade` misdetects native Linux installs as Windows and refuses;
upgrade with `curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash`.

## Do not

Do not delegate work whose result you cannot check. A second model is useful
because it disagrees; that is only worth something if you read the
disagreement and judge it. Passing a Kimi answer through unread is worse than
not asking.

Do not act on a reviewer's counterexample until you have checked it against
the production write path. A K3.1 Pro fix-check once assumed a timestamp came
straight from an outside system when the code rewrote it first. The "fix" built
on that mixed two clocks and had to be reverted.
