---
title: Using our agent skills
status: current
last_verified: 2026-10-12
audience: developers
---

# Using our agent skills

Everything we use is in one **marketplace**: a catalog of plugins that
Claude Code can install from. A **plugin** is a package of skills
(instructions the agent follows when a situation calls for them), and
sometimes hooks and commands. This guide covers setup, updates, and the
working habits that make the plugins pay off.

## Words used in this guide

| Word | Meaning |
|---|---|
| spine | Our main plugin, a fork of [Superpowers](https://github.com/obra/superpowers). It guides the agent through brainstorm, plan, build, review. There are two versions: `superpowers-human` and `superpowers-agents`. |
| fork, upstream, sync | We keep our own copy (fork) of Superpowers. Upstream is the original project. A sync brings upstream's changes into our copy. |
| subagent | A second Claude that the main session starts for one job, such as building a task or reviewing it. |
| TDD | Test-driven development: write a failing test first, then the code that makes it pass. |
| hook | A script Claude Code runs automatically at certain moments, for example before a git command. |
| worktree | A second working copy of the same git repo, so the agent can work on a branch without touching yours. |
| ADR | Architecture decision record: a short note on why a hard-to-reverse decision was made. |
| effort | How long the model thinks before answering. Our default is `medium`. |
| ledger | The agent's running notes file for a plan: what it finished, the rulings it made, the findings it set aside. |
| `claude -p` | Claude Code run without a person: it takes one prompt, works, prints the result and exits. Used in CI and scripts. |

## Before you start

You need:

- **Claude Code, up to date.** Install it from
  [code.claude.com](https://code.claude.com/docs/en/overview) if you haven't.
  Then, in your terminal:

  ```
  claude update
  claude --version
  ```

- **To be signed in.** Run `claude` once and finish `/login`.
- **git**, and network access to GitHub. The marketplace and three of its
  plugins come from public GitHub repos.
- **`jq`**, if you will use the git guardrails (see below), on your machine
  and on any CI machine where the hook runs. Without it the hook blocks
  nothing and says nothing. Check with `jq --version`.
- **Only for `kimi-delegation`:** a Kimi API key or a Kimi Code
  subscription. See *kimi-delegation* below. Skip that plugin if you have
  neither; it refuses to run without one.

All setup and update commands below go in your **terminal**, not in a
Claude Code session. Commands starting with `/` go in a Claude Code
session, at the prompt where you talk to Claude.

## Setup, once per machine

1. Add our marketplace:

   ```
   claude plugin marketplace add opcheese/skills-catalog
   ```

2. Install **one** spine. For working at the keyboard:

   ```
   claude plugin install superpowers-human@opcheese-skills
   ```

   Never install `superpowers-agents` on the same machine as well. It is for
   unattended runs; see *Unattended runs* below.

3. Install the vocabulary skills:

   ```
   claude plugin install codebase-vocabulary@opcheese-skills
   claude plugin install codebase-vocabulary-human@opcheese-skills
   ```

4. Optional, recommended: the memory store.

   ```
   claude plugin install shadow-learn-memory@opcheese-skills
   ```

5. Optional, only if you have a Kimi credential:

   ```
   claude plugin install kimi-delegation@opcheese-skills
   ```

6. Check what you installed:

   ```
   claude plugin list
   ```

   Each plugin should show `Status: ✔ enabled`.
7. Start Claude Code (`claude`). If it was already running, quit it with
   `/exit` and start it again: the spine loads its instructions when a
   session starts.
8. Check the spine actually works. In an empty scratch folder:

   ```
   mkdir -p /tmp/sp-test && cd /tmp/sp-test && claude
   ```

   Then say:

   ```
   Let's make a react todo list
   ```

   The agent should ask what you want instead of writing code. Its first
   message offers to skip the questions; don't take that offer for this
   test. If it starts writing code, the plugin isn't loading. Say so in the
   team channel instead of working around it. Type `/exit` when done.

The team's recommended settings (effort `medium`, model choices, privacy)
are in the [AI coding setup memo](2026-10-12-ai-coding-setup-memo.md).

You can also do all of this from inside Claude Code by typing `/plugin`,
which opens a panel with the same options. The terminal commands are
simpler to follow.

## Updating

Run these in your terminal, then restart Claude Code:

```
claude plugin marketplace update opcheese-skills
claude plugin update superpowers-human@opcheese-skills
```

Run `claude plugin update <name>@opcheese-skills` for each other plugin you
installed too. The first command only refreshes the catalog; it doesn't
update anything you installed.

Check the result with `claude plugin list`. After the October 2026 sync,
`superpowers-human` shows `Version: 7.0.0`.

A plugin only updates when its version number changes. If the update says
`already at the latest version`, nothing changed on your machine. The spines
take their version from upstream Superpowers, so they change when we sync a
new upstream release, and not in between.

## What you just installed

**superpowers-human** is a methodology, not a pile of tips. It runs a spine:

```
brainstorm → design doc (for projects) → plan → you review the plan
           → implement (TDD) → review → you verify → merge, PR, or keep
```

You don't invoke most of it. It triggers itself when you ask for something
that needs it. Where it stops and waits for you is described under *Where
it stops for you* below.

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
| `git-guardrails-claude-code` | codebase-vocabulary-**human** | you run it once per repo | a hook that blocks `reset --hard`, `clean -f`, `checkout .`, `restore .`, force branch deletion (`branch -D`), force pushes, and pushes to a protected branch. Feature-branch pushes still work. |

The bottom two are in a separate plugin because they need a person. Read
*What the guardrails actually block* and *Unattended runs* below before
running the guardrails setup.

Run the guardrails setup once in any repo you let an agent work in. In a
Claude Code session, type:

```
/git-guardrails-claude-code
```

If another plugin has a skill with the same name, use the full form
`/codebase-vocabulary-human:git-guardrails-claude-code`. Asking in words
("set up the git guardrails in this repo") works too.

The setup asks whether to install for **this project only** or **all
projects**. If you choose this project, commit the `.claude/settings.json`
and `.claude/hooks/` files it creates, so the whole team gets the hook.

To check the hook works, ask the agent to run `git reset --hard`. It should
be refused with a `BLOCKED:` message. If the command runs, check that `jq`
is installed.

### What the guardrails actually block

Pushing is branch-aware, so the hook is safe to install in a repo that also
runs unattended agents:

- **Blocked** — pushing to `main`, `master` or the remote's default branch,
  by any route: `git push origin main`, `git push origin feature:main`, or a
  bare `git push` while you are standing on `main`. Force pushes,
  `+refspec`, `--mirror`, `--all` and `--delete` are blocked wherever they
  point.
- **Allowed** — pushing a feature branch, which is what opening a PR needs.

To protect more branches, set `GIT_GUARDRAILS_PROTECTED_BRANCHES` to the
**full** comma-separated list. It replaces the default list (`main`,
`master` and the remote's default branch) instead of adding to it. So list
every branch you want protected, including `main`, and your default branch
if it has another name: `main,master,release`.

For one repo, add an `env` key to that repo's `.claude/settings.json`, next
to the `hooks` key the setup wrote. Don't replace the file:

```json
"env": { "GIT_GUARDRAILS_PROTECTED_BRANCHES": "main,master,release" }
```

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
- `docs/playbooks/*.md` — repeatable procedures (deploy, setup, release), if your project has them

When the user corrects you, note the correction explicitly in your reply.
```

Without it the store is written and never opened.

### kimi-delegation

Hands a task to Kimi instead of Claude. You don't type commands for it.
Ask in words, for example "get a second opinion from Kimi on this diff",
and the agent picks one of three modes:

| Mode | What it does |
| --- | --- |
| `--via kimi` | Kimi's own agents. **Read-only by default** |
| `--via kimi --agent coder` | Kimi's agents, allowed to write files |
| `--via claude` | Claude Code running on Kimi's model, with Claude Code's permissions |

Use it for a second opinion on a review or design, and for large mechanical
passes you would rather not spend Claude context on. Read what comes back —
a second model earns its keep by disagreeing, which is only worth something
if you judge the disagreement.

It needs a Kimi credential, set up once per machine. There are two kinds:

- **A Kimi API key.** This covers `--via claude`. Set it in the terminal
  before you start `claude`:

  ```
  printf 'Kimi API key: '; read -rs KIMI_API_KEY; echo; export KIMI_API_KEY
  ```

  Paste the key and press Enter. Nothing shows while you paste; that is
  expected. To keep it, add `export KIMI_API_KEY=<your key>` to `~/.bashrc`
  or `~/.zshrc`. That file stays on your machine; never copy it into a repo.
- **A Kimi Code subscription.** Install the Kimi CLI (0.38.0 or later; see
  Kimi Code's install page), then run `kimi login`. This is what `--via
  kimi` uses.

If both are present, `--via claude` uses the API key. Each run prints an
`auth=` field saying which one it used.

Unlike everything else in the catalog, this one is not tied to Claude Code.
`--via kimi` is a plain bash call, so it works from Codex or a script too —
see *Using kimi-delegation outside Claude Code* in the README. `--via claude`
does need the `claude` CLI on `PATH`, whatever you called it from.

## Where it stops for you

**While designing, it talks to you.** Brainstorming asks one question at a
time and plays back what it understood in a few paragraphs, so you can
correct it. You can say "skip the questions, just start", but think twice:
the questions are where it finds out what you actually want.

**After writing the plan, it asks you to review it** and to pick how to run
it:

- **Subagent-driven:** a fresh subagent builds each task and a fresh
  reviewer checks it. Most thorough, and it costs more tokens.
- **Native:** the session builds every task itself, with one fresh review
  at the end. Cheaper and faster.

It recommends one, with a reason. Read the plan before you answer:
approving it is approving what gets built.

**While it builds, it does not ask "should I continue?".** That is
deliberate; if it starts doing it, something is wrong. It has two planned
stops, whichever way you chose to run the plan. It also stops for the four
emergencies listed under *What "rulings" are*.

**At each task boundary, it asks you to run the reviewer.** You will see
something like:

```
Task 3 (add rate limiting to the ingest endpoint) is reviewed clean: a1b2c3d..e4f5a6b
Please run:  /code-review high a1b2c3d..e4f5a6b
```

Copy that line and run it. It is not a progress ping. `/code-review` is
Claude Code's built-in reviewer, and the spine is set up so that you run
it, not the agent. The review looks at the task's changes with fresh eyes.

Its findings appear in the same session, so the agent already sees them.
You don't need to paste them, even though its message offers that. It fixes
them before the next task. To skip one review, say `skip`. To skip them for the rest
of the run, say `waive run`. Both get recorded. If you say nothing, the
agent waits.

**At the end of the run, it asks you to verify.** You get what was built,
test results, deferred minor findings, parked findings, and the rulings it
made on your behalf. Read the rulings especially: those are decisions it
took without asking, each with what it costs if wrong. That is your chance
to catch a wrong one cheaply.

**Then it asks what to do with the branch:** merge it locally, push it and
open a pull request, or keep it as it is. Our default is **push and open a
pull request**, so a teammate can review it.

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

**Let brainstorming size the work.** Once it understands what you want, it
says how big the work is:

- **a quick, clear task:** it just does it;
- **a small change:** you agree the change in chat, then it builds;
- **a project:** it writes a design document, then a plan.

If it sized the work wrong, say so. It can also offer a throwaway spike,
which is a quick experiment to learn something. A spike's code is not kept
unless you ask for it again through the normal process.

**Answer the questions.** Skipping them is allowed, and for a truly quick
task it's fine. For anything bigger, a few minutes of questions costs far
less than an agent building the wrong thing.

**Keep a `CONTEXT.md`.** `domain-modeling` maintains a glossary of what your
project's words actually mean. Agents get dramatically more accurate once
"account", "order" and "cancellation" have one definition each, and it is
the cheapest documentation you will ever keep because the agent writes it
as terms get resolved.

**Correct it out loud, then extract.** Shadow learning has nothing to learn
from a correction you made silently by editing the file yourself. Say what
was wrong, then run `/session-knowledge-extract` before you close the
laptop. It learns from the corrections you said out loud in the
conversation, and from nothing else.

**Write ADRs sparingly.** Only when all three are true: hard to reverse,
surprising without context, and the result of a real trade-off. If any one
is missing, skip it.

## Unattended runs

For CI, cron, or anything driven by `claude -p`, install the other spine
**in that environment only**, and leave the `-human` plugin out. There is
usually no interactive session there, so use the terminal commands. CI
machines usually start empty, so run these in the job itself, before
`claude -p`:

```
claude plugin marketplace add opcheese/skills-catalog
claude plugin install superpowers-agents@opcheese-skills
claude plugin install codebase-vocabulary@opcheese-skills
```

`claude -p` there also needs its own login. Either run `claude setup-token`
on your own machine (it needs a Claude subscription) and store the token as
a CI secret named `CLAUDE_CODE_OAUTH_TOKEN`, or store an API key as
`ANTHROPIC_API_KEY`. A shared pipeline should use an API key, because the
token is tied to the subscription of whoever created it. Never put either
in the repo. If the guardrails hook runs there too, the CI image needs
`jq`.

The unattended spine does not ask questions. Brainstorming writes the
design in one pass, and a reviewer subagent reads it. Nobody reviews the
plan before it runs. Decisions it would have asked you about become rulings (see
*What "rulings" are*).

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
review one of those PRs, read that section first. It is the only place
those decisions survive: the agent's notes live in its workspace, which a
CI run throws away.

## Getting help

- Which skill covers what: ask the agent "what skills do you have for X".
- Team settings, running other models (Kimi, Ollama, OpenAI) and the
  Codex comparison: the [AI coding setup memo](2026-10-12-ai-coding-setup-memo.md).
- Running Claude Code on a local model through Ollama:
  [Claude Code on a local model](local-claude-code.md).
- Something triggers when it should not, or does not trigger when it
  should: that is a real bug in our fork, not something to work around.
  Report it with the exact message that did or did not trigger it.
