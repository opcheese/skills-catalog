---
title: AI coding setup, October 2026
status: current
date: 2026-10-12
last_verified: 2026-10-12
audience: developers
---

# AI coding setup, October 2026

**What changes:**
- Effort is `medium` by default.
- Update the Superpowers spine to the v7.0.0 sync.
- Claude Code stays our main harness. Codex is the second opinion.

Everything below is copy-paste ready.

## Install and update

New machine:

```
/plugin marketplace add opcheese/skills-catalog
/plugin install superpowers-human@opcheese-skills     # at the keyboard
/plugin install codebase-vocabulary@opcheese-skills
/plugin install codebase-vocabulary-human@opcheese-skills
```

For `claude -p` in CI, cron or pipelines, install `superpowers-agents`
instead of `superpowers-human`. Never install both. The full list of
plugins is in the [README](../README.md) and the step-by-step guide is in
the [dev guide](dev-guide.md).

Existing machine, to pick up the v7.0.0 sync (2026-10-12):

```
/plugin marketplace update opcheese-skills
/plugin update superpowers-human@opcheese-skills      # or superpowers-agents
```

Then restart Claude Code and check with `claude plugin list`.

The v7.0.0 sync changes how three skills behave:

- **Brainstorming** (interactive spine) asks one question at a time and
  plays back what it heard before proposing anything.
- **Native plan execution** is a cheaper alternative to subagent-driven
  development. The interactive spine still asks you to run `/code-review`
  after each task and to sign off at the end.
- **Plans are leaner.** They record signatures and test assertions instead
  of full code.

## Settings

| Setting | Team default | How |
|---|---|---|
| Effort | `medium` | Opus 5.5 already starts at `medium`. If you changed it, run `/effort medium` and press Enter to save it as your default. For `claude -p`, set `CLAUDE_CODE_EFFORT_LEVEL=medium`. |
| Raising effort | `high` for hard debugging or architecture, for that session only | `/effort high`, then press `s` (session only) instead of Enter |
| `max` | Don't | Several times the tokens for little gain, and it can loop. Claude Code applies it to the current session only anyway. |
| Subagent effort and model | Cheaper than the main session for search, scanning and audits | `effort:` and `model:` in the agent's frontmatter, or the Agent tool's `effort` parameter (Claude Code 2.1.292+) |
| Model training on your data | Off | Codex: Settings → Data controls → "Improve the model for everyone" → off. Claude: the model-training toggle in your claude.ai privacy settings. |
| Auto memory | On, but check it monthly | Read `~/.claude/projects/<repo>/memory/MEMORY.md`. Delete stale entries, or set `"autoMemoryEnabled": false` in a repo's `.claude/settings.json` if it keeps collecting noise. |

The effort settings follow Anthropic's
[model configuration docs](https://code.claude.com/docs/en/model-config).

## How we work

1. **Say what "done" means in the prompt.** For example, "tests green and a
   PR open" or "old client deleted and nothing imports it". Without an end
   state, the agent stops early or wanders.
2. **Ask for the whole task, not a step.** "Fix the bug, find the files,
   test it, open a PR" works better than "edit this file".
3. **Don't watch the agent work.** Start a task, do something else, and come
   back when it finishes or asks for you. Put the effort into making the
   result easy to verify: tests, previews, a revertable PR.
4. **Have a different model review the code.** Use `kimi-delegation` or
   Codex `/review` on Claude's work, and the other way round. A second model
   catches what the author's own blind spots hide.
5. **Steer, don't restart.** Send a follow-up message to a running session
   to correct it; a fresh thread loses everything it learned.
6. **After a long run, ask:** "What are the risks of merging this, and what
   couldn't you verify?"

## Codex or Claude Code

Claude Code is the primary tool, because our plugins target it and its
multi-agent features are ahead. Use Codex for a second-model review and
for computer-use or browser work in the ChatGPT desktop app.

| | Claude Code 2.1.296 | Codex 0.162 |
|---|---|---|
| Running agents in parallel | Subagents, background sessions (`claude agents`), scripted dynamic workflows, experimental agent teams | Subagents (only when asked), parallel tasks in managed worktrees, cloud tasks |
| Sessions talking to each other | Yes: one session can message your other sessions, on this machine, another machine or the cloud | No: you can only hand a chat over to another host |
| Memory | Auto memory on by default, per repo | Off by default; background recall when on |
| Code review | `/code-review`; `/code-review ultra` reproduces every finding before reporting it; GitHub PR bot | `/review`; review pane in the desktop app; automatic GitHub PR reviews |
| Sandbox | Off by default (`/sandbox`); permission modes and hooks | On by default; an AI reviewer can approve sandbox escapes |
| Skills | `SKILL.md` | Same `SKILL.md` format; can import a Claude Code setup |

The full comparison, with sources, is in the Superpowers fork:
[Codex vs Claude Code: the harnesses](https://github.com/opcheese/superpowers/blob/agents/docs/research/2026-10-12-codex-vs-claude-code-harness.md).

## Deadlines

- **Nov 12 2026 (proposed, still being negotiated):** OpenAI plans to end
  Cursor's direct access to its models after SpaceX bought Cursor
  ([report](https://propakistani.pk/2026/08/29/openai-cutting-off-cursors-access-to-its-models-after-spacex-takeover/)).
  Anyone who reaches GPT models through Cursor should plan for a direct Codex
  plan or their own API key.
- **Oct 14 2026:** GPT-5.5 is retired from Codex. Update saved configs and
  custom agents that name it.

## Sources

- [Claude Code docs](https://code.claude.com/docs/llms.txt) and
  [changelog](https://code.claude.com/docs/en/changelog)
- [Codex docs](https://learn.chatgpt.com/llms.txt) and
  [changelog](https://learn.chatgpt.com/docs/changelog)
- [Superpowers fork v7.0.0 sync record](https://github.com/opcheese/superpowers/blob/agents/docs/superpowers/plans/2026-10-12-sync-upstream-v7.0.0.md)
