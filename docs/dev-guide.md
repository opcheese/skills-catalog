---
title: Using our agent skills
status: current
last_verified: 2026-08-26
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
/plugin install codebase-vocabulary-human@opcheese-skills
/plugin install shadow-learn-memory@opcheese-skills
/plugin install kimi-delegation@opcheese-skills
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

**codebase-vocabulary** supplies what the spine does not. The spine is a
process — what to do next, when to stop — and it can run a task start to
finish without ever deciding where a boundary belongs or what a word means.
These skills fire on those judgment moments instead, which is why they compose
with the spine rather than competing with it. The README has the longer
argument under *Why these four*, and [the worked example](worked-example.md)
walks one task through both, request to merged PR.

It is split in two, by whether the skill needs you present:

| Skill | Plugin | Fires when | What it gives you |
|---|---|---|---|
| `codebase-design` | codebase-vocabulary | you are deciding where an interface or module boundary goes | the vocabulary — deep modules, seams, adapters, leverage, locality |
| `resolving-merge-conflicts` | codebase-vocabulary | you are mid-merge or mid-rebase with conflicts | a procedure that does not lose work |
| `domain-modeling` | codebase-vocabulary-**human** | you are arguing about what a word means, or writing a `CONTEXT.md` / ADR | a glossary discipline, and a three-part test for whether a decision deserves an ADR |
| `git-guardrails-claude-code` | codebase-vocabulary-**human** | you run it once per repo | hooks that block `push`, `reset --hard`, `clean`, branch deletion |

The bottom two are in a separate plugin because they need a person. See
*Guardrails and unattended repos* below before running the guardrails setup.

Run the guardrails setup once in any repo you let an agent work in:

```
/git-guardrails-claude-code
```

### What the guardrails actually block

Pushing is branch-aware, so the hook is safe to install in a repo that also
runs unattended agents:

- **Blocked** — pushing to `main`, `master` or the remote's default branch,
  by any route: `git push origin main`, `git push origin feature:main`, or a
  bare `git push` while you are standing on `main`. Force pushes,
  `+refspec`, `--mirror`, `--all` and `--delete` are blocked wherever they
  point.
- **Allowed** — pushing a feature branch, which is what opening a PR needs.

Override the protected set per repo with
`GIT_GUARDRAILS_PROTECTED_BRANCHES`, comma-separated, if you have a
`release` or `staging` branch that deserves the same treatment.

Upstream's version blocked `git push` outright. We changed it, because a
hook that blocks every push blocks the safe workflow along with the
dangerous one — and would break the unattended spine at its finish step,
where pushing a branch is the whole point.

**shadow-learn-memory** is the part that makes the agent better at *your*
project over time. Three skills:

| Skill | Fires when | What it does |
|---|---|---|
| `/session-knowledge-extract` | you ask it to, typically end of day | reads today's Claude Code, Codex and Kimi transcripts, pulls out the corrections and facts worth keeping, and stages them |
| `/memory-consolidate` | weekly, or when the index gets long | routes staged entries into pattern and entity files, merges duplicates, prunes what went stale |
| `/start-research-thread` | you are opening an investigation that will outlive one session | scaffolds the dated-evidence → topic → index document layer before you start |

The store lives in the project, at `.agents/memory/`, and is meant to be
committed — it is team knowledge, not your personal scratch space. Nothing
is written without showing you the full proposed file first, and that
confirmation is the point: a pattern file full of wrong patterns is worse
than no memory at all. Read what it proposes before you say yes.

**One thing you have to add by hand.** The skills fill the store; nothing
makes the agent *read* it back. Put this in the project's `CLAUDE.md` (or
`AGENTS.md`) once, and commit it:

```markdown
## Before work that involves judgment

Read these first — reviews, architecture decisions, and writing depend on them:

- `.agents/memory/patterns/*.md` — domain rules learned from past corrections
- `.agents/memory/entities/*.md` — context about people, services, and systems
- `docs/playbooks/*.md` — repeatable procedures (deploy, setup, release)

When the user corrects you, note the correction explicitly in your reply.
```

Without it the store is written and never opened.

### kimi-delegation

Hands a task to Kimi instead of Claude.

| Command | What it does |
| --- | --- |
| `--via kimi` | Kimi's own agents. **Read-only by default** |
| `--via kimi --agent coder` | Lets Kimi write |
| `--via claude` | Claude Code on Kimi's model, with Claude Code's permissions |

Use it for a second opinion on a review or design, and for large mechanical
passes you would rather not spend Claude context on. Read what comes back —
a second model earns its keep by disagreeing, which is only worth something
if you judge the disagreement.

Needs a Kimi credential, once per machine. Either an API key —
`export KIMI_API_KEY=...`, which covers `--via claude` and needs no CLI and no
login — or a Kimi Code subscription: `kimi login` plus CLI >= 0.38.0, which is
the only thing that unlocks `--via kimi`. An explicit key outranks a stored
subscription token, and the `auth=` field in each run's provenance line records
which one was actually spent.

Unlike everything else in the catalog, this one is not tied to Claude Code.
`--via kimi` is a plain bash call, so it works from Codex or a script too —
see *Using kimi-delegation outside Claude Code* in the README. `--via claude`
does need the `claude` CLI on `PATH`, whatever you called it from.

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

**Correct it out loud, then extract.** Shadow learning has nothing to learn
from a correction you made silently by editing the file yourself. Say what
was wrong, then run `/session-knowledge-extract` before you close the
laptop — the transcripts it reads are the raw material, and untouched
corrections are the only thing in them worth keeping.

**Write ADRs sparingly.** Only when all three are true: hard to reverse,
surprising without context, and the result of a real trade-off. If any one
is missing, skip it.

## Unattended runs

For CI, cron, or anything driven by `claude -p`, install the other spine
**in that environment only**, and leave the `-human` plugin out:

```
/plugin install superpowers-agents@opcheese-skills
/plugin install codebase-vocabulary@opcheese-skills
```

Leave `shadow-learn-memory` out of that environment too. Its skills stop and
wait for you to approve every write, so unattended they stall rather than
learn. The store itself still pays off there, because the `CLAUDE.md` block
above is what makes any agent read it — an unattended run gets the patterns
your team taught it, it just cannot add new ones.

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
