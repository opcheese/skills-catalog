---
title: Changelog
status: current
audience: developers
---

# Changelog

Notable changes to the catalog: what devs install, and what the docs tell them.

## 2026-10-19: review fixes to the day's changes

From a `/code-review` of the three changes below:

- The guardrails' jq-free reader took 24 seconds on a 60KB command, long
  enough for the hook to time out, which lets the command run. It is now
  linear. It also decodes `\u` escapes and reads `tool_input.command` rather
  than the last `command` key in the input. The test suite now sends each
  case as one JSON message and covers all three.
- The kimi skill's path block set `KD` for Claude Code and then overwrote
  it with the other-harness example. The example is now a comment.

codebase-vocabulary-human 1.2.1, kimi-delegation 1.2.2.

## 2026-10-19: git guardrails work without jq

The guardrails hook read the command with `jq` and, without it, blocked
nothing and said nothing. That is the usual state of Git Bash on Windows. It
now reads the command itself when `jq` is missing, and the test suite runs
every case both with and without `jq`. `jq` is no longer a prerequisite. On
Windows the hook still needs Git Bash: without it Claude Code runs hooks in
PowerShell, the script cannot start, and nothing is blocked.
codebase-vocabulary-human is now 1.2.0.

## 2026-10-19: CONTEXT.md is now GLOSSARY.md

`domain-modeling` and `codebase-design` follow upstream mattpocock/skills
(commit `d80fa0f`): the project glossary is `GLOSSARY.md`, a multi-context
repo's map is `GLOSSARY-MAP.md`, and the format guide is `GLOSSARY-FORMAT.md`.
The skills no longer look for `CONTEXT.md`. If your repo keeps one, rename it
so they find it again:

```bash
git mv CONTEXT.md GLOSSARY.md   # and CONTEXT-MAP.md -> GLOSSARY-MAP.md, if you have one
```

codebase-vocabulary is now 1.2.0 and codebase-vocabulary-human 1.1.0.

## 2026-10-19: kimi-delegation 1.2.1

Three fixes, found while testing a document-review skill against this plugin's
plan:

- `--via claude --output stream-json` failed at once: `claude -p` refuses
  stream-json without `--verbose`. The script now adds it.
- The skill's script path used `$CLAUDE_PLUGIN_ROOT`, which Claude Code does
  not export to the Bash tool. It now uses the braced `${CLAUDE_PLUGIN_ROOT}`,
  which Claude Code fills in when it loads the skill.
- The plugin's LICENSE named the wrong copyright holder (copied from a
  vendored plugin). It is now opcheese.

The marketplace entry now carries the plugin's own version (it said 1.1.0).

## 2026-10-12: Claude Code on a local model

New guide, [local-claude-code.md](local-claude-code.md): run Claude Code on
`qwen3.8:27b` through Ollama, with the team plugins and auto mode. Tested on
one machine (RTX 5090, Claude Code 2.1.296, Ollama 0.34.2) in a clean Claude
Code config with the team plugins; network tracing there showed no traffic
to Anthropic. A review pass then hardened the `claude-local` command: its
settings now go through `--settings`, so a settings file can't redirect
prompts elsewhere, and every `git push` asks first. After an outside report, it also
refuses a second `--settings` flag (which would replace its settings and send
the session to Anthropic) and uses `127.0.0.1` instead of `localhost`. Linked from the AI
coding setup memo and the dev guide.

## 2026-10-12

Team memo: [AI coding setup, October 2026](2026-10-12-ai-coding-setup-memo.md).
It covers:

- effort `medium` as the team default;
- how to pick up the Superpowers v7.0.0 sync on both spines;
- working practices;
- a one-table Codex vs Claude Code summary;
- running Kimi, Ollama and OpenAI models in Claude Code, and Kimi, Ollama and Claude in Codex;
- upcoming deadlines.

The dev guide, README and memo were revised for beginners and reviewed
twice:

- **Setup and updates now use terminal commands** (`claude plugin install`,
  `claude plugin update`). Typed into a session, `/plugin install <name>`
  only opens a panel, and `/plugin update` doesn't exist. Earlier
  instructions here told you to run them anyway.
- **Updates are version-gated.** A plugin updates only when its version
  number changes. The README's claim that the spines track their branch was
  wrong.
- **New sections:** a glossary, prerequisites, and numbered setup steps.
- **Matches the v7.0.0 spine:** plan review and the choice of how to run
  the plan, the end-of-branch menu (our default is a pull request), and
  how brainstorming sizes the work.
- **Guardrails:** `GIT_GUARDRAILS_PROTECTED_BRANCHES` replaces the default
  list, so it must include `main`.

## 2026-08-26

`codebase-vocabulary` **1.1.0**. The vocabulary skills are no longer islands.

### The vocabulary skills connect to the spine

`codebase-design` and `domain-modeling` had no references in or out, so they
only fired when a dev named them. They now sit on the path:

- `superpowers:brainstorming` gained two checklist steps — name the boundaries
  via `codebase-design`, record the model via `domain-modeling`
- `codebase-design` gained a closing hand-off to `superpowers:test-driven-development`:
  the interface it just settled is the test surface, so the first failing test
  goes through it
- `superpowers:test-driven-development` gained a seam gate before RED

What this changes for you: ask for a design and the deep-module vocabulary and
the ADR now arrive on their own, instead of only when you remember to ask.

The spine half of this lives in the fork (branch `agents`), so it reaches you
through `superpowers-agents`, not through this version bump.

**Pointers written as prose in a skill body do not work.** Two rounds of them
failed under test — the agent borrowed their wording and skipped the skill.
Only structural positions fire: a numbered checklist item, or a closing hand-off
section. Worth knowing before adding more links. Full RED/GREEN record, 13
measured sessions: `docs/research/2026-08-26-skill-interconnection-eval.md` in
the superpowers fork.

One caveat recorded honestly: the TDD seam gate improves what the agent does
without producing a skill invocation. It ships labelled as a partial.

### kimi-delegation, earlier the same day

`kimi-delegation` **1.1.0**. Bump the version whenever a **path-vendored**
plugin's contents change — one whose `source` is a directory in this repo.
`claude plugin update` compares version strings for those, so a changed plugin left
at the same version reports "already at the latest version" and never ships.

Corrected 2026-08-26: this does **not** apply to plugins sourced from a github
ref, such as `superpowers-agents`. Those track the branch and refetch its
current contents, even while reporting "already at the latest version (6.3.0)".
The message is unreliable in both directions — verify the installed file, not
the output.

**Superseded 2026-10-12:** this correction was wrong for current Claude Code.
A github-sourced plugin also updates only when its manifest `version`
changes. See the 2026-10-12 entry.

### kimi-delegation runs on an API key

`KIMI_API_KEY` (or `MOONSHOT_API_KEY`) is now a complete credential for
`--via claude`: no Kimi CLI, no `kimi login`. The key travels by environment to
the `apiKeyHelper` and never touches a command line, because `/proc` and `ps`
expose every argument of every process on the machine. An explicit key
outranks a stored subscription token, and `auth=` in the provenance line
records which one a run actually spent.

`--via kimi` is unchanged and still needs the subscription — it drives Kimi's
own agent system through Kimi's own OAuth, which a key cannot reach.

`KIMI_DELEGATE_BASE_URL` overrides the endpoint for keys issued outside the
coding plan.

### The model gate marks what it could not check

On a machine with no Kimi CLI config there is no model list, so nothing in
that branch is verified. Previously only the deliberate
`KIMI_DELEGATE_SKIP_MODEL_CHECK=1` path was marked `(unverified)`; the default
`k3` went out with a clean provenance line. That was backwards — the opt-out
is the case someone chose with their eyes open, and the default is the case
nobody watches. Both are marked now.

The default is still sent rather than refused. Blocking it would break every
delegation over a config we merely failed to parse.

This does not make an unverifiable model *safe*. It makes the run honest about
not knowing.

### Documentation corrections

- **Updating instructions were wrong.** They gave `/plugin marketplace update`
  alone, which refreshes what is on offer and upgrades nothing installed. An
  installed plugin stays pinned until `/plugin update <name>` and a restart.
  A machine here ran a five-month-old spine on exactly that mistake.
- **Installing `codebase-vocabulary-human` does not install the git hook.** The
  plugin ships a setup skill you run per repo; `claude plugin details` reports
  `Hooks (0)`. The README, the dev-guide table, and the marketplace
  description all implied otherwise.
- **Plugin skills are addressed `plugin:skill`**, so the guardrails setup is
  `/codebase-vocabulary-human:git-guardrails-claude-code`.
- **New: [why the vocabulary skills exist](../README.md)** — the spine is a
  process library and says nothing about structure or terminology, which is
  the gap these four fill — and **[a worked example](worked-example.md)**
  running one task through both layers, request to merged PR.
- The design spec is marked superseded in part; its preconditions predate the
  API-key path.

## 2026-08-24

`kimi-delegation` added. Two paths: Kimi's own agents (read-only by default)
and Claude Code running on Kimi's model. Verification record in
[docs/verification](verification/2026-08-24-kimi-delegation.md).

## 2026-08-23

Catalog created. The Superpowers fork's two branches become two installable,
ref-pinned plugins, plus four MIT skills vendored from
[mattpocock/skills](https://github.com/mattpocock/skills), split by whether
they need a person at the keyboard.
