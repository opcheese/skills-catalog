# Attribution

The skills in this plugin are copied verbatim from
[mattpocock/skills](https://github.com/mattpocock/skills), MIT licensed,
Copyright (c) 2026 Matt Pocock. The full license text is in `LICENSE`.

Provenance: commit `5b15a47f2d7150f545fbcacbfe381787fc0230dc` (2026-08-21).

| Skill | Upstream path |
|---|---|
| `domain-modeling` | `skills/engineering/domain-modeling/` |
| `git-guardrails-claude-code` | `skills/misc/git-guardrails-claude-code/` |

## Why these two are separate

Both need a person at the keyboard, so they ship apart from the spine-neutral
skills in `codebase-vocabulary`.

`domain-modeling` works by interrogating you — "your glossary defines
'cancellation' as X, but you seem to mean Y, which is it?" — and an
unattended run has nobody to answer, so it stalls exactly where our
`agents` spine is built never to stall.

`git-guardrails-claude-code` installs a `PreToolUse` hook that blocks
`git push` with no branch distinction. Our `agents` spine always opens a
PR, which means pushing a feature branch, so the default blocked list
breaks every unattended run at its finish step. See the dev guide before
installing it in a repo that also runs unattended.

## Why only these

The upstream pack is 36 skills and is excellent, but most of it is a
complete second methodology — spec, tickets, implement, review, wayfind —
that runs parallel to the Superpowers spine we already use. Installing both
does not give an agent two opinions; it gives it a coin flip at trigger
time, because skill selection happens before either skill's body is read.

These were selected because they collide with nothing we run. They
supply *vocabulary and rails*, not process: what a deep module is, where a
seam belongs, when a decision deserves an ADR, and how not to lose work in
a merge conflict. Superpowers tells an agent what process to follow and
says almost nothing about what good structure looks like. This is the hole
these four fill.

The full reasoning, and the framework used to pick them, is in
`docs/research/2026-08-23-mattpocock-skills-and-adoption-framework.md` on
the `agents` branch of our Superpowers fork.

## Updating

These files are a pinned copy, not a submodule. To refresh them, diff
against the upstream paths above at a newer commit, re-apply deliberately,
and bump the provenance SHA in this file. Nothing here has been modified
from upstream, and keeping it that way makes every future refresh a
straight copy.
