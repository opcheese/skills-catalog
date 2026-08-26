---
title: Changelog
status: current
audience: developers
---

# Changelog

Notable changes to the catalog: what devs install, and what the docs tell them.

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

`kimi-delegation` **1.1.0**. Bump the version whenever a vendored plugin's
contents change: `/plugin update` compares version strings, so a changed
plugin left at the same version reports "already at the latest version" and
never ships.

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
