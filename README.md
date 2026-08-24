# opcheese-skills

Our agent skills, in one place. Add the marketplace once, install the
plugin that matches what you are doing.

```
/plugin marketplace add opcheese/skills-catalog
```

Then pick **one** spine:

```
/plugin install superpowers-human@opcheese-skills     # you are at the keyboard
/plugin install superpowers-agents@opcheese-skills    # claude -p in CI, cron, pipelines
```

And, in both cases:

```
/plugin install codebase-vocabulary@opcheese-skills
```

If you are at the keyboard, also:

```
/plugin install codebase-vocabulary-human@opcheese-skills
```

And if you want the agent to remember what you taught it between sessions:

```
/plugin install shadow-learn-memory@opcheese-skills
```

And if you have a Kimi Code subscription and want a second model on tap:

```
/plugin install kimi-delegation@opcheese-skills
```

New here? Read [docs/dev-guide.md](docs/dev-guide.md) — it is step by step
and copy-paste ready.

## What is in the catalog

| Plugin | What it is | Install when |
|---|---|---|
| **superpowers-human** | Our [Superpowers](https://github.com/obra/superpowers) fork, `main` branch. The full methodology — brainstorm → spec → plan → implement → review → PR — with human gates kept: a per-task checkpoint that asks you to run the native `/code-review`, and an end-of-run sign-off. | You are working interactively. This is the default for everyone. |
| **superpowers-agents** | The same fork, `agents` branch. Every human gate is replaced by something an unattended run can actually do: recorded rulings instead of questions, an automated verification gate instead of sign-off, escalation instead of stopping, and always-open-a-PR instead of merging. | You are running `claude -p` with nobody watching. |
| **codebase-vocabulary** | Two skills from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, attributed) covering what Superpowers does not: deep modules and seams, and merge-conflict resolution. Neither waits on a person. | Always. It composes with either spine. |
| **codebase-vocabulary-human** | Two more from the same source that need someone at the keyboard: domain glossary and ADR discipline, and hooks that block dangerous git commands. | Interactive work only. See the warning below. |
| **shadow-learn-memory** | The [shadow learning](https://github.com/Ludentes/Claude-Shadow-Learn) store. Reads your Claude Code, Codex and Kimi transcripts, extracts the corrections and facts worth keeping, and consolidates them into pattern and entity files the agent reads before judgment work. | Interactive work only — every write asks you first. |
| **kimi-delegation** | Hand a task to Kimi — read-only review and bulk work through its own agents, or Claude Code itself running on its model. Refuses loudly without a Kimi subscription and CLI >= 0.38.0. | You have a Kimi subscription and want a second model's judgment, or want to spare Claude context. |

## Do not install both spines

`superpowers-human` and `superpowers-agents` are the same skills with
opposite answers about when to involve a person. Installing both puts two
skills with identical trigger conditions in front of the model, and which
one fires is a coin flip. Pick one per environment.

## Why codebase-vocabulary-human is separate

Both skills in it need a person. `domain-modeling` works by asking you
questions, and unattended there is nobody to answer.
`git-guardrails-claude-code` is a setup skill you run once per repo.

Its hook is safe to install in a repo that also runs unattended agents:
pushing is branch-aware, so pushing to `main` is blocked while pushing a
feature branch — which is what opening a PR requires — still works. That is
a change from upstream, which blocked `git push` outright; see
[the notice](plugins/codebase-vocabulary-human/NOTICE.md).

## Why shadow-learn-memory is interactive only

All three of its skills stop and show you what they are about to write before
writing it — that confirmation is the quality gate on what enters the store,
because a memory file full of wrong patterns is worse than no memory at all.
Under `claude -p` there is nobody to say yes, so the skill stalls. Install it
alongside `superpowers-human`, not `superpowers-agents`.

The plugin install is nearly self-contained: the store creates itself under
`.agents/memory/` in whatever project you run it in, and the transcript
normalizer ships with the skills. The one manual step is a short block in the
project's `CLAUDE.md` telling the agent to read the store back —
[the dev guide](docs/dev-guide.md) has it copy-paste ready. Without it the
store gets written and never opened.

If you also use Codex CLI or Kimi Code and want all three reading one store,
run that repo's `shadow-learn.sh init` instead — it links the skills into
those tools and writes the `AGENTS.md` for you.

## Why kimi-delegation is a single plugin

The catalog splits a plugin in two when some of its skills need a person at
the keyboard — that is what `codebase-vocabulary-human` and the interactive-only
`shadow-learn-memory` are about. Delegation has no human gate on either path:
both run headless, and delegating is *more* valuable unattended, where sparing
Claude quota matters most. The split convention tracks human gates, not
caution, so it does not apply here.

It does carry a hard precondition the other plugins do not: a Kimi Code
subscription and CLI >= 0.38.0. Without those the skill refuses loudly rather
than degrading, so installing it on a machine without Kimi costs nothing but
the description tokens.

## Why not just install mattpocock/skills too?

Because most of that pack is a second, complete methodology that runs
parallel to this one — its own spec step, its own ticketing, its own
implement loop, its own code review. The overlap is at the *trigger* layer,
where the model chooses a skill before reading either one, so the failure is
silent and non-deterministic rather than loud.

These four skills are the part of that pack that collides with nothing. See
[codebase-vocabulary/NOTICE.md](plugins/codebase-vocabulary/NOTICE.md) and
[codebase-vocabulary-human/NOTICE.md](plugins/codebase-vocabulary-human/NOTICE.md).

## Updating

```
/plugin marketplace update opcheese-skills
```

The two Superpowers entries and `shadow-learn-memory` track branches, so they
pick up each upstream sync automatically. The two `codebase-vocabulary*`
plugins are pinned copies and move only when we deliberately bump them.
