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

And if you have a Kimi Code subscription or a Kimi API key, and want a
second model on tap:

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
| **codebase-vocabulary-human** | Two more from the same source that need someone at the keyboard: domain glossary and ADR discipline, and a setup skill that installs hooks blocking dangerous git commands. | Interactive work only. See the warning below. |
| **shadow-learn-memory** | The [shadow learning](https://github.com/Ludentes/Claude-Shadow-Learn) store. Reads your Claude Code, Codex and Kimi transcripts, extracts the corrections and facts worth keeping, and consolidates them into pattern and entity files the agent reads before judgment work. | Interactive work only — every write asks you first. |
| **kimi-delegation** | Hand a task to Kimi — read-only review and bulk work through its own agents, or Claude Code itself running on its model. Needs either a Kimi Code subscription or a Kimi API key; refuses loudly with neither. | You want a second model's judgment, or want to spare Claude context. |

## Do not install both spines

`superpowers-human` and `superpowers-agents` are the same skills with
opposite answers about when to involve a person. Installing both puts two
skills with identical trigger conditions in front of the model, and which
one fires is a coin flip. Pick one per environment.

## Why codebase-vocabulary-human is separate

Both skills in it need a person. `domain-modeling` works by asking you
questions, and unattended there is nobody to answer.
`git-guardrails-claude-code` is a setup skill you run once per repo.

Installing the plugin does not install the hook. It ships the setup skill;
you run it once per repo, and until you do, nothing about your git commands
changes.

The hook is safe to install in a repo that also runs unattended agents:
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

## Using kimi-delegation outside Claude Code

`kimi-delegation` is the one plugin here that is useful without Claude Code.
Its Path A is a bash call to the Kimi CLI, so it works from Codex, a script,
or a bare shell. The marketplace only distributes it; it is not a runtime
dependency.

To install it anywhere else, put the skill directory where your tool looks for
skills — for Codex that is `~/.agents/skills/`:

```
git clone https://github.com/opcheese/skills-catalog /tmp/skills-catalog
cp -r /tmp/skills-catalog/plugins/kimi-delegation/skills/delegating-to-kimi \
      ~/.agents/skills/
```

The scripts locate their own siblings, so nothing else is needed. If you split
them up, set `KIMI_DELEGATION_ROOT` to the install root.

One caveat: `--via claude` runs the Claude Code CLI as the delegate, so it
needs `claude` on `PATH` whatever called it. On a machine without it, Path A
works and Path B refuses with a clear message.

## Why kimi-delegation is a single plugin

The catalog splits a plugin in two when some of its skills need a person at
the keyboard — that is what `codebase-vocabulary-human` and the interactive-only
`shadow-learn-memory` are about. Delegation has no human gate on either path:
both run headless, and delegating is *more* valuable unattended, where sparing
Claude quota matters most. The split convention tracks human gates, not
caution, so it does not apply here.

It does carry a precondition the other plugins do not: a Kimi credential.
Either works, and they buy different things:

- **A Kimi Code subscription** — `kimi login` plus CLI >= 0.38.0. Required for
  `--via kimi`, which runs Kimi's own agent system through its own OAuth.
- **An API key** in `KIMI_API_KEY` (or `MOONSHOT_API_KEY`) — covers `--via
  claude` and needs neither the CLI nor a login. Set
  `KIMI_DELEGATE_BASE_URL` if your key was issued outside the coding plan.

On a key-only machine there is no Kimi CLI config, so there is no model list
to check a name against, and that changes how the model argument behaves:

- The default, `k3`, is sent **unverified**. It is a Kimi Code plan name; if
  your key is not on that plan, Kimi answers HTTP 200 with some other model
  rather than an error, and you are billed for it.
- Any other name is **refused** rather than sent, unless you also set
  `KIMI_DELEGATE_SKIP_MODEL_CHECK=1`.

So on a key outside the coding plan, name your model *and* take the opt-out
deliberately:

```
export KIMI_DELEGATE_MODEL=the-model-your-key-serves
export KIMI_DELEGATE_SKIP_MODEL_CHECK=1
```

Runs taken that way are marked `(unverified)` in the provenance line, which is
the only signal you get that nothing checked the name.

With neither the skill refuses loudly rather than degrading, so installing it
on a machine without Kimi costs nothing but the description tokens.

## Why these four, when Superpowers is already this big

Superpowers is a *process* library. It tells the agent what to do next and
when to stop: brainstorm before building, write the test first, review before
the PR. It says almost nothing about what good structure looks like or what
your words mean — and it can run start to finish without ever answering
either, which is why it never grew that layer.

Those questions live *between* the process steps. "Where does this boundary
go?" never appears in a workflow diagram; it comes up in the middle of one. A
skill that fires on a workflow moment cannot help there, because from the
workflow's point of view nothing has happened.

You notice the gap in three specific ways:

- The agent ships working code behind a wide, shallow interface — every caller
  has to understand how it works. Nothing in the spine flags this, because the
  tests pass and the task is done.
- One PR uses three words for the same concept, none of them the word the
  business uses. You correct it, and it drifts back next session.
- A merge conflict arrives and the agent either invents behaviour that was in
  neither branch, or reaches for `--abort` and throws the work away.

Each skill answers one of those:

**`codebase-design`** gives one vocabulary — module, interface, depth, seam,
adapter, leverage, locality — used consistently enough that "make this deeper"
is an instruction rather than a vibe. Pure reference, meant to be consulted
mid-design rather than run. Install it and forget it.

**`domain-modeling`** is the glossary discipline: challenge a fuzzy term the
moment it appears, and write the decision down. It costs the most, because it
only pays off in a repo that will actually keep a `CONTEXT.md`. Its three-part
test for whether a decision deserves an ADR — hard to reverse, surprising
without context, a real trade-off — earns its place on its own.

**`resolving-merge-conflicts`** is 117 words and has no analogue anywhere in
Superpowers: read both intents before resolving either, preserve both where
you can, never invent behaviour, never `--abort`, then run the project's own
checks. A conflict is exactly where an unsupervised agent does something you
cannot easily undo.

**`git-guardrails-claude-code`** is the odd one out — not vocabulary but a
hook, and the only mechanical answer in a catalog otherwise full of procedural
ones. Worth it in any repo you let an agent work in unattended.

**When to skip them.** `codebase-vocabulary` costs a couple of description
lines per session and does nothing until design is actually happening, so
there is no real reason not to carry it. `codebase-vocabulary-human` is the
one to leave out if you do not keep a glossary and do not want the hook.

To see the two working together on one task, request to merged PR, read
[the worked example](docs/worked-example.md). The full reasoning, including
the two skills we borrowed ideas from and the four we declined outright, is in
[the adoption writeup](https://github.com/opcheese/superpowers/blob/agents/docs/research/2026-08-23-mattpocock-skills-and-adoption-framework.md).

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

Two commands, and you need both:

```
/plugin marketplace update opcheese-skills   # refresh what is on offer
/plugin update superpowers-agents@opcheese-skills
```

Refreshing the marketplace does **not** upgrade anything you have installed.
An installed plugin stays pinned at the commit it was installed from until you
run `/plugin update` on it by name, and the new version only loads after a
restart. This is easy to miss: a machine here quietly ran a five-month-old
spine because the marketplace had been refreshed and the plugin never had.

To see what you are actually running, `claude plugin list` prints the resolved
version of each installed plugin.

The two Superpowers entries and `shadow-learn-memory` track branches, so a
`/plugin update` on them picks up the latest sync. The two `codebase-vocabulary*`
plugins are pinned copies and move only when we deliberately bump them.
