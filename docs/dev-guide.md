---
title: Using our agent skills
status: current
last_verified: 2026-08-23
audience: developers
---

# Using our agent skills

Everything we use is in one marketplace. This guide is the whole setup and
the working habits that come with it.

## Setup, once per machine

```
/plugin marketplace add opcheese/skills-catalog
/plugin install superpowers-human@opcheese-skills
/plugin install codebase-vocabulary@opcheese-skills
```

Restart Claude Code. To check it worked, start a fresh session and say:

```
Let's make a react todo list
```

The agent should stop and start asking you questions instead of writing
code. If it starts writing code, the plugin is not loading — say so in the
team channel rather than working around it.

## What you just installed

**superpowers-human** is a methodology, not a pile of tips. It runs a spine:

```
brainstorm → spec → plan → implement (TDD, one subagent per task)
           → review each task → whole-branch review → PR
```

You do not invoke most of it. It triggers itself when you ask for something
that needs it. The two places it deliberately stops and waits for you are
described under *The two gates* below.

**codebase-vocabulary** supplies four things the spine does not:

| Skill | Fires when | What it gives you |
|---|---|---|
| `codebase-design` | you are deciding where an interface or module boundary goes | the vocabulary — deep modules, seams, adapters, leverage, locality |
| `domain-modeling` | you are arguing about what a word means, or writing a `CONTEXT.md` / ADR | a glossary discipline, and a three-part test for whether a decision deserves an ADR |
| `resolving-merge-conflicts` | you are mid-merge or mid-rebase with conflicts | a procedure that does not lose work |
| `git-guardrails-claude-code` | you run it once per repo | hooks that block `push`, `reset --hard`, `clean`, branch deletion |

Run the guardrails setup once in any repo you let an agent work in:

```
/git-guardrails-claude-code
```

## The two gates

The spine runs continuously and will not ask you "should I continue?" — that
is deliberate, and if it starts doing it, something is wrong. It stops in
exactly two places.

**At each task boundary, it asks you to run the reviewer.** You will see
something like:

```
Task 3 (add rate limiting to the ingest endpoint) is reviewed clean: a1b2c3d..e4f5a6b
Please run:  /code-review high a1b2c3d..e4f5a6b
```

Copy that line and run it. This is not a rubber stamp and it is not a
progress ping: `/code-review` is marked `disable-model-invocation`, which
means the agent physically cannot run it. You typing it is the only path to
that reviewer, and it is a stronger reviewer than the one the agent has —
it fans out across several specialised reviewers and then runs a separate
pass that throws out its own false positives.

Paste back whatever it finds. The agent routes findings into its fix loop.
If you want to skip one, say `skip`; to skip for the rest of the run, say
`waive run`. Both get recorded. Silence is not a waiver — the agent will
wait.

**At the end of the run, it asks you to verify.** You get what was built,
test results, deferred minor findings, parked findings, and the rulings it
made on your behalf. Read the rulings especially: those are decisions it
took without asking, each with what it costs if wrong. That is your chance
to catch a wrong one cheaply.

## What "rulings" are

When the agent hits an ambiguity, a conflict between two tasks, or a plan
defect, it does not park the session waiting for you. It decides, writes
`Ruling: <what it decided> — <why> — <what it costs if wrong>` into its
ledger, and keeps going. You see the whole list at the end.

This is on purpose. A wrong ruling costs some rework you can see and undo. A
session parked on a question costs you the rest of the day and buys nothing.

Four things still stop it cold and always will: an irreversible or
destructive operation, a security-sensitive action, a side effect outside
its worktree (a merge, a push to a shared branch, a publish), and a plan so
broken that every path forward is a guess.

## Working habits that make it pay off

**Let brainstorming classify the work.** It sorts your request into a spike
(a feasibility question — the output is an answer, not code you keep), a
bounded change (something already in the repo — short design, then build),
or architectural (new subsystem — full spec and plan). It will say which out
loud. If it guesses heavier than you wanted, say so; if it guesses lighter,
that is worth pushing back on, because the ratchet is meant to be one-way.

**Do not ask it to skip the design.** "This is too simple to need a design"
is the single most expensive sentence in this workflow. A design can be two
sentences. It cannot be zero.

**Keep a `CONTEXT.md`.** `domain-modeling` maintains a glossary of what your
project's words actually mean. Agents get dramatically more accurate once
"account", "order" and "cancellation" have one definition each, and it is
the cheapest documentation you will ever keep because the agent writes it
as terms get resolved.

**Write ADRs sparingly.** Only when all three are true: hard to reverse,
surprising without context, and the result of a real trade-off. If any one
is missing, skip it.

## Unattended runs

For CI, cron, or anything driven by `claude -p`, install the other spine
**in that environment only**:

```
/plugin install superpowers-agents@opcheese-skills
```

Never install both in the same environment — they are the same skills with
opposite answers about when to involve a person, and the model will pick
between them unpredictably.

What changes on that spine: it never merges and never pushes to a shared
branch, it always opens a PR instead, and every ruling and unresolved
finding is carried into the PR description under **Open items**. When you
review one of those PRs, read that section first — it is the only place
those decisions survive, because the agent's workspace is deleted when the
plan ends.

## Getting help

- Which skill covers what: ask the agent "what skills do you have for X".
- Something triggers when it should not, or does not trigger when it
  should: that is a real bug in our fork, not something to work around.
  Report it with the exact message that did or did not trigger it.
