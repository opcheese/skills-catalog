---
name: delegating-to-kimi
description: Use when work should go to Kimi instead of Claude - an independent second opinion on a review or design, a large mechanical pass that would burn Claude context, or any task where a different model's judgment is worth more than a faster answer. Requires a Kimi Code subscription.
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

The scripts live beside this skill:

```bash
"$CLAUDE_PLUGIN_ROOT/skills/delegating-to-kimi/scripts/kimi-delegate" \
  --via kimi -- "Review src/auth.ts for auth bypasses. Report findings only."
```

Path A defaults to Kimi's `explore` agent, which is **read-only**. This is
deliberate: an unqualified `kimi -p` edits the working tree with no approval
gate at all, and `--yolo` is refused precisely because `-p` already behaves
that way. Naming a read-only agent is what contains it.

To let Kimi write, name an agent that can:

```bash
kimi-delegate --via kimi --agent coder -- "Apply the rename across the repo."
```

Path B runs Claude Code itself on Kimi's model, so Kimi's output is subject to
Claude Code's own permission system:

```bash
kimi-delegate --via claude --agent my-reviewer -- "Review the staged diff."
```

## Flags

- `--via kimi|claude` — required
- `--agent NAME` — Path A: a Kimi agent (`coder`, `explore`, `plan`, or one
  of yours in `.kimi-code/agents/`). Path B: one of your `.claude/agents/`.
- `--cwd DIR` — run in DIR instead of the current directory
- `--output text|stream-json` — passed through unaltered
- Everything after `--` is the prompt

`KIMI_DELEGATE_MODEL` overrides the model, default `k3`.

## What it refuses

- `--dangerously-skip-permissions`, on either path
- Nesting — a delegation started inside a delegated session
- Kimi CLI older than 0.38.0, which predates `--agent` and so cannot be
  contained

## Requirements

A Kimi Code subscription (`kimi login`) and CLI >= 0.38.0. Note that
`kimi upgrade` misdetects native Linux installs as Windows and refuses;
upgrade with `curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash`.

## Do not

Do not delegate work whose result you cannot check. A second model is useful
because it disagrees; that is only worth something if you read the
disagreement and judge it. Passing a Kimi answer through unread is worse than
not asking.
