---
name: delegating-to-api-credits
description: Use when work should run on the monthly Claude API credits that come with a Max or Team plan rather than on the plan's own usage limits - test loops, bulk mechanical passes, second-opinion reviews, or anything headless you would otherwise run with claude -p
---

# Delegating to API credits

Max and Team plans include monthly API credits in a linked Claude Console
organization. They cover `claude -p` **only when it runs on that
organization's API key**. Signed in with the plan, the same command draws on
the plan's limits, and interactive Claude Code is never covered.

So the work is one Bash call to a script that makes the key the credential
that wins, caps the spend, and reports what the run cost.

## Running it

The scripts live in `scripts/` beside this file and are not on `PATH`:

```bash
# Claude Code fills in the braced form when it loads this skill:
CD="${CLAUDE_PLUGIN_ROOT}/skills/delegating-to-api-credits"

"$CD/scripts/credits-delegate" -- "Run the tests in tests/unit and report failures."
```

If you are reading this file, its directory is `$CD`.

The answer comes back on stdout. Two lines go to stderr: what the run used
(model, budget, agent, key file) and what it cost (`cost_usd=`,
`served_by=`). Read the cost line and pass it on when you report the result.
The exit code is 0 for an answer and 1 for anything else: a refusal, an API
error, or a stop at the budget.

A third stderr line, `claude.ai connectors are disabled because
ANTHROPIC_API_KEY or another auth source is set`, is expected: it is Claude
Code noting that the run is on the key, not the plan login. It is not a fault.

## Flags

- `--model NAME` — default `haiku`. Name `sonnet` or `opus` when the task
  needs it; the credits are dollars, and a stronger model spends them faster.
- `--budget USD` — default `1`. Passed as `--max-budget-usd`. It is checked
  between turns, so the turn that crosses it still completes and the cost can
  land past it (measured: $0.0023 on a $0.001 cap). The stop is reported on
  stderr as `Reached maximum budget`.
- `--agent NAME` — one of your `.claude/agents/`, to give the run that
  agent's prompt and tool limits.
- `--cwd DIR` — run in DIR instead of the current directory.
- `--bare` — skip hooks, plugins, `CLAUDE.md` and auto-memory. Built-in
  tools still work. Measured in a repo with plugins installed, every request
  carried about 33k tokens of context without it, and 1.6k with it. That made
  the first run about 14 times cheaper. Use it when the prompt carries
  everything the task needs. Leave it off when the run needs the project's
  `CLAUDE.md`, skills or agents (`--agent` under `--bare` is untested).
- `--output text|json|stream-json` — `text` (default) prints only the answer;
  `json` and `stream-json` pass Claude Code's own output through.
- Everything after `--` is the prompt.

## The key

The script reads the linked organization's API key from
`~/.config/claude-credits/key` (override with `CLAUDE_CREDITS_KEY_FILE`). The
file must be mode 600 or the script refuses. One-time setup:

```bash
install -d -m 700 ~/.config/claude-credits
(umask 077; cat > ~/.config/claude-credits/key)   # paste the key, then Ctrl-D
```

The key reaches the delegated session only through `apiKeyHelper`, so it is
never on a command line and never in that session's environment, where its
tools could read it. Inherited `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`ANTHROPIC_BASE_URL`, `CLAUDE_CODE_OAUTH_TOKEN` and the cloud-provider
switches are removed, because each would outrank the key or send it somewhere
else.

**Never export the key yourself**, and never put it in a shell profile. An
`ANTHROPIC_API_KEY` in the environment outranks the plan login: interactive
Claude Code would then try to bill the organization, which the credits do not
cover.

Before the run, the script checks the key with an unbilled `GET /v1/models`.
`claude -p` given a rejected key does not fail: it hangs until killed. The
check turns a revoked key, or one from another organization, into an
immediate refusal.

## The delegated session

Without `--bare` it is ordinary `claude -p` in the working directory: your user
and project settings, plugins, hooks and `CLAUDE.md` all load, and its permission rules
apply. Nothing can approve a prompt in `-p`, so a tool your settings do not
allow is denied, not asked about. Write the prompt for a session that cannot
ask you anything, and give it everything it needs.

## When the credits run out

Requests stop with `Credit balance too low`, the run fails, and nothing is
charged to the plan. If the organization has purchased credits or auto-reload,
runs continue on those instead and cost real money. Credits expire at the end
of each billing period and do not roll over; the Console's Billing page shows
the balance and expiry.

## What it refuses

- `--dangerously-skip-permissions`
- Nesting: a delegation started inside a delegated session
- A missing, empty, or group/world-readable key file
- A key the API rejects

## Do not

- Delegate work that needs a conversation with your human partner. The
  delegated session cannot ask anything.
- Raise `--budget` to finish a run that hit it without first reading why it
  spent that much.
- Use it for interactive Claude Code. The credits do not cover it.
