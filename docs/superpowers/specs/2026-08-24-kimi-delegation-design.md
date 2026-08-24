---
title: kimi-delegation — design
status: complete
last_verified: 2026-08-24
owner: opcheese
area: spec
audience: maintainers
---

# kimi-delegation — design

A marketplace plugin that lets Claude Code hand work to Kimi, both ways:
through Kimi's own agent system, and by running Claude Code itself on Kimi's
model. Research and verified behaviour are in
`superpowers/docs/research/2026-08-24-calling-kimi-from-claude-code.md`; this
document assumes those findings and does not restate them.

## Purpose and constraints

The goal is flexibility and control: a second brain that can be pointed at
review work, at bulk work that should not spend Claude quota, or at anything
where an independent model is worth more than a faster one — installable by a
dev from the `opcheese-skills` marketplace with one command.

Fixed by the research:

- Claude Code cannot route a subagent to another provider, so the boundary is
  always a process spawn.
- An unqualified `kimi -p` **edits a working tree with no approval gate**, and
  `--yolo` is refused because `-p` already behaves that way. Containment comes
  from naming a read-only agent.
- `--agent` requires Kimi **0.38.0+**.
- The subscription OAuth token has a **900-second** TTL and is auto-refreshed
  by the Kimi CLI when a command runs against an expired token.
- `apiKeyHelper` runs under `/bin/sh`, must print **only** the credential to
  stdout and exit 0; **any stderr output is treated as an error**. Its result
  is cached 5 minutes by default (`CLAUDE_CODE_API_KEY_HELPER_TTL_MS`) and it
  is re-invoked on HTTP 401.

Catalog constraints: zero third-party dependencies, plugins vendored under
`plugins/<name>/` with their own `.claude-plugin/plugin.json`, scripts under a
skill's `scripts/`, shell tests alongside.

## File layout

```
plugins/kimi-delegation/
  .claude-plugin/plugin.json
  skills/delegating-to-kimi/
    SKILL.md
    scripts/kimi-credential
    scripts/kimi-delegate
    tests/test-kimi-credential.sh
    tests/test-kimi-delegate.sh
  LICENSE
```

Both scripts resolve their own location from `CLAUDE_PLUGIN_ROOT`, falling
back to the directory of the running script so the tests can invoke them
directly from a checkout. `kimi-delegate` builds the Path B settings JSON at
call time and writes the **absolute** path of `kimi-credential` into its
`apiKeyHelper` field, because the nested Claude Code resolves that command
through `/bin/sh` with no knowledge of the plugin.

## Approaches considered

**One skill with a single entry-point script (chosen).** One skill decides
*whether* to delegate and *which* path; one script crosses the boundary in
either direction. Path choice is a judgment the skill body can state as a
rule, so it does not need to be a separate skill.

**A skill per path (rejected).** Two skills whose descriptions both say
"delegate to Kimi" collide at the trigger layer. Skill selection happens
before either body is read, so the choice resolves as a coin flip — the same
failure the adoption framework's trigger-overlap filter exists to catch. The
path decision must live *inside* one skill, not between two.

**An MCP server (rejected).** MCP is the supported extension point, but both
existing servers are dead (7 stars/5 months stale; 0 stars/single-day), so
this means authoring and running a server process to wrap a CLI that already
works as a subprocess. It adds a long-running dependency to a zero-dependency
catalog and buys nothing unless Kimi must be reachable from many MCP clients.
Revisit only if that becomes true.

## Architecture

Three units with narrow contracts.

### kimi-credential — the apiKeyHelper

*What it does:* prints a currently-valid bearer token for the Kimi
subscription. *How you use it:* named as `apiKeyHelper` in the settings blob
Path B passes to the nested Claude Code. *What it depends on:* the Kimi CLI
and its credential file. Nothing else.

Reads `${KIMI_CODE_HOME:-$HOME/.kimi-code}/credentials/kimi-code.json`.

- Token valid for more than a 60-second skew → print `access_token`, exit 0.
- Otherwise → trigger a refresh by invoking the Kimi CLI with **all output
  suppressed**, re-read the file, print the new token. The CLI owns the OAuth
  refresh; we never implement one and never write a token anywhere.
- Still invalid → exit 1, with a message on stderr naming `kimi login`.

The refresh trigger is the cheapest Kimi subcommand *verified by test* to
rewrite the credential file; `kimi -p` with a minimal prompt is the guaranteed
fallback if no cheaper command refreshes. Determining this is a required step
of the implementation plan, not an open question.

Because the helper may be called far more often than the documented 5-minute
cache implies, the valid-token path must stay a file read and a print — no
subprocess, no network.

### kimi-delegate — the boundary crosser

*What it does:* runs one delegated task on Kimi and streams the result back.
*How you use it:* from the Bash tool. *What it depends on:* the Kimi CLI,
`kimi-credential`, and for Path B the `claude` binary.

```
kimi-delegate --via kimi|claude [--agent NAME] [--cwd DIR]
              [--output text|stream-json] -- <prompt>
```

`--via kimi` (Path A) runs `kimi -p --agent "${AGENT:-explore}"`. **The
default agent is `explore`, which is read-only.** Writing requires explicitly
naming a write-capable agent. This inverts Kimi's headless default and is the
single most important decision in this design.

`--via claude` (Path B) runs `claude -p` with `ANTHROPIC_BASE_URL` pointed at
`https://api.kimi.com/coding`, `ANTHROPIC_MODEL` at `${KIMI_DELEGATE_MODEL:-k3}`,
and `apiKeyHelper` set to `kimi-credential`, passed via `--settings` as a JSON
string. `--agent` forwards to the nested Claude Code, which discovers the
dev's own `.claude/agents/` definitions natively.

Both paths refuse `--dangerously-skip-permissions`; the script never passes
it and rejects it if supplied.

Preflight, in order, each failing loudly with a fix: Kimi CLI present and
`>= 0.38.0`; credential file present; for Path B, `claude` on PATH.

Recursion guard: the script exports `KIMI_DELEGATE_DEPTH` and refuses to run
at depth `>= 1`, so a delegation started inside a delegated session cannot
nest. This matters most for Path B, where the child is itself a Claude Code.

### delegating-to-kimi — the skill

*What it does:* tells Claude when delegating is right and which path to take.
*What it depends on:* the two scripts.

The path rule, stated so it needs no judgment:

- Work that reads and reports — review, audit, second opinion, "is this
  right" — goes to **Path A with `explore`**. Nothing can be modified, and
  the result is a report.
- Work that must use Claude Code's own tools, permissions, or the dev's
  existing agent definitions goes to **Path B**.
- Work that needs Kimi to orchestrate its own sub-agents goes to **Path A**
  with an agent that names its `subagents`.

Neither path introduces a new agent format. Path A uses `.kimi-code/agents/`
and Kimi's built-in `coder`/`explore`/`plan`; Path B uses `.claude/agents/`.
The plugin ships **no agent definitions** — the built-ins and the dev's own
files cover the cases, and shipping a library would create exactly the
maintenance surface the catalog avoids.

## Data flow

Path A: skill → Bash → `kimi-delegate --via kimi` → `kimi -p --agent explore`
→ stdout → tool output.

Path B: skill → Bash → `kimi-delegate --via claude` → `claude -p` with Kimi
env and `apiKeyHelper` → nested Claude Code with its own tool and permission
enforcement → stdout → tool output.

Output passes through unaltered. `stream-json` is forwarded, not parsed or
reformatted.

## Error handling

| Condition | Behaviour |
| --- | --- |
| Kimi CLI missing or `< 0.38.0` | Refuse; name the version and the install-script route, noting `kimi upgrade` misdetects native Linux installs |
| Credential file missing or refresh fails | Refuse; tell the user to run `kimi login` |
| `KIMI_DELEGATE_DEPTH >= 1` | Refuse; report that delegation is already in progress |
| `--dangerously-skip-permissions` supplied | Refuse |
| Child exits non-zero | Propagate the child's exit code, surface the tail of its stderr |
| apiKeyHelper cannot produce a token | Exit 1 with stderr — the only case where stderr is correct |

## Testing

Shell tests following the catalog's existing `tests/test-*.sh` convention,
**hermetic**: fake `kimi` and `claude` on `PATH`, fixture credential files, no
network and no subscription required, so a dev can run them on a clean
checkout.

- valid-token fixture → helper prints exactly the token, nothing on stderr,
  exit 0, and spawns no subprocess
- expired fixture with a fake refreshing `kimi` → helper returns the new token
- expired fixture with a failing `kimi` → exit 1, message names `kimi login`
- no `--agent` given → the `kimi` invocation contains `--agent explore`
- `--agent coder` given → forwarded verbatim, `explore` not substituted
- `KIMI_DELEGATE_DEPTH=1` → refuses
- fake `kimi --version` reporting 0.18.0 → refuses with upgrade guidance
- `--dangerously-skip-permissions` in arguments → refuses
- no test output contains a token-shaped string

## Distribution

Vendored at `plugins/kimi-delegation/` and added to `marketplace.json` as the
sixth plugin. Vendored rather than sourced from a repo because we author it
and it ships scripts, matching `codebase-vocabulary`.

**One plugin, not a human/unattended pair.** The catalog splits plugins when a
skill needs a person at the keyboard. Neither path does: both run headless,
and delegation is *more* valuable unattended, where sparing Claude quota
matters most. The split convention is about human gates, not about caution,
and applying it here would double maintenance for nothing. The catalog README
and dev guide should say so, since the shadow-learn entry establishes the
opposite precedent for a different reason.

Preconditions are real and must be documented as such: a Kimi Code
subscription and Kimi CLI `>= 0.38.0`. The skill fails loudly when they are
absent rather than degrading quietly.

## Deliberately excluded

No MCP server. No shipped agent-definition library. No parsing or
reformatting of `stream-json`. No session-resume plumbing. No OAuth refresh of
our own — the CLI owns it. No fan-out across multiple concurrent Kimi calls;
the subscription is documented at 30 concurrent requests, and a single
delegation does not approach it.
