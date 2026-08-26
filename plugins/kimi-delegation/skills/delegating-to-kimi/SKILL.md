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
# Claude Code sets this for you:
KD="$CLAUDE_PLUGIN_ROOT/skills/delegating-to-kimi"
# Codex, or any other harness: wherever this skill was installed, e.g.
KD=~/.agents/skills/delegating-to-kimi

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
- `--output text|stream-json` — passed through unaltered
- Everything after `--` is the prompt

`KIMI_DELEGATE_MODEL` overrides the model, default `k3`. The name is checked
against the models your Kimi install declares, and an unknown one is refused
with the list of what is available. This check exists because the endpoint
itself will not do it: a request naming a model Kimi has never heard of
returns HTTP 200 and a normal answer, so without the check a typo is served by
something else with no error anywhere.

On a machine with an API key and no CLI there is no local model list, so an
explicit model cannot be checked at all. That is refused too — unverifiable is
not the same as valid. `KIMI_DELEGATE_SKIP_MODEL_CHECK=1` takes the risk on
purpose, and the run is marked `(unverified)` in the line below. The opt-out
only covers the unknowable case: when your install does declare a list, "not
on it" is a positive answer and no variable overrules it.

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
- **An explicit key outranks a stored subscription token**, so on a machine
  with both, exporting the key is what decides which account gets billed. The
  `auth=` field of the provenance line says which one a given run spent.
- **`--via kimi` cannot use it.** Kimi's own agent system authenticates
  through its own OAuth provider; the key has no way in. Path A still needs
  `kimi login`, and says so if you try.

An empty value (`KIMI_API_KEY=`, which is what sourcing a `.env` without the
key leaves behind) is treated as no key at all, not as an empty credential.

## Thinking is on, and you cannot turn it off

Both paths think, always, and neither exposes a switch. Measured 2026-08-24:

- Kimi's `k3` declares the `always_thinking` capability, and the CLI refuses
  to resolve an effort of `off` for such a model. Effort itself (`low`,
  `high`, `max`) is real, but it is a global setting in `[thinking]` in
  `~/.kimi-code/config.toml` — there is no per-invocation flag, so this skill
  cannot set it for one delegation.
- On Path B the delegated Claude Code sends `thinking: {type: adaptive}` or
  omits the field entirely, and Kimi thinks by default in both cases.
  `MAX_THINKING_TOKENS` changes only which of those two it sends, and a
  positive value is not forwarded as a budget at all.

Do not add a thinking parameter to this skill on the strength of an accepted
request. The endpoint returns 200 for parameters it discards — a bogus effort
string and a bogus model both come back with a normal answer — so "it was
accepted" is not evidence that anything happened.

## What it refuses

- `--dangerously-skip-permissions`, on either path
- Nesting — a delegation started inside a delegated session
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
