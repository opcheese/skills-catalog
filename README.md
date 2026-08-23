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

New here? Read [docs/dev-guide.md](docs/dev-guide.md) — it is step by step
and copy-paste ready.

## What is in the catalog

| Plugin | What it is | Install when |
|---|---|---|
| **superpowers-human** | Our [Superpowers](https://github.com/obra/superpowers) fork, `main` branch. The full methodology — brainstorm → spec → plan → implement → review → PR — with human gates kept: a per-task checkpoint that asks you to run the native `/code-review`, and an end-of-run sign-off. | You are working interactively. This is the default for everyone. |
| **superpowers-agents** | The same fork, `agents` branch. Every human gate is replaced by something an unattended run can actually do: recorded rulings instead of questions, an automated verification gate instead of sign-off, escalation instead of stopping, and always-open-a-PR instead of merging. | You are running `claude -p` with nobody watching. |
| **codebase-vocabulary** | Two skills from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, attributed) covering what Superpowers does not: deep modules and seams, and merge-conflict resolution. Neither waits on a person. | Always. It composes with either spine. |
| **codebase-vocabulary-human** | Two more from the same source that need someone at the keyboard: domain glossary and ADR discipline, and hooks that block dangerous git commands. | Interactive work only. See the warning below. |

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

The two Superpowers entries track branches, so they pick up each upstream
sync automatically. The two `codebase-vocabulary*` plugins are pinned copies
and move only when we deliberately bump them.
