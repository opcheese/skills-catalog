# Attribution

The skill in this plugin is copied from
[mattpocock/skills](https://github.com/mattpocock/skills), MIT licensed,
Copyright (c) 2026 Matt Pocock. The full license text is in `LICENSE`.

Provenance: commit `5b15a47f2d7150f545fbcacbfe381787fc0230dc` (2026-08-21).
Reconciled with upstream at commit `4ae2317` (2026-11-08): the one later change to
`codebase-design` (`DESIGN-IT-TWICE.md`, sub-agents get a fresh context window) is
taken, and `resolving-merge-conflicts` is dropped because upstream removed it in v1.3.0.

| Skill | Upstream path |
|---|---|
| `codebase-design` | `skills/engineering/codebase-design/` |

The two that need a person at the keyboard live in the sibling plugin
`codebase-vocabulary-human`, which has its own copy of this notice.

## Why only these

The upstream pack is 36 skills and is excellent, but most of it is a
complete second methodology — spec, tickets, implement, review, wayfind —
that runs parallel to the Superpowers spine we already use. Installing both
does not give an agent two opinions; it gives it a coin flip at trigger
time, because skill selection happens before either skill's body is read.

These were selected because they collide with nothing we run. They
supply *vocabulary and rails*, not process: what a deep module is, where a
seam belongs, and when a decision deserves an ADR. Superpowers tells an agent what process to follow and
says almost nothing about what good structure looks like. This is the hole
these skills fill (the other two live in `codebase-vocabulary-human`).

The full reasoning, and the framework used to pick them, is in
`docs/research/2026-08-23-mattpocock-skills-and-adoption-framework.md` on
the `agents` branch of our Superpowers fork.

## Updating

These files are a pinned copy, not a submodule. To refresh them, diff
against the upstream paths above at a newer commit, re-apply deliberately,
and bump the provenance SHA in this file. One local change: the
*After the design* section in `codebase-design/SKILL.md` is ours (hand-offs
to brainstorming, TDD and domain-modeling). Re-apply it after a refresh;
everything else is a straight copy.
