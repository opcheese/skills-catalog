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

New machine, in your terminal:

```
claude plugin marketplace add opcheese/skills-catalog
claude plugin install superpowers-human@opcheese-skills     # at the keyboard
claude plugin install codebase-vocabulary@opcheese-skills
claude plugin install codebase-vocabulary-human@opcheese-skills
```

For `claude -p` in CI, cron or pipelines, install `superpowers-agents`
instead of `superpowers-human`. Never install both. The full list of
plugins is in the [README](../README.md) and the step-by-step guide is in
the [dev guide](dev-guide.md).

Existing machine, to pick up the v7.0.0 sync (2026-10-12), in your
terminal:

```
claude plugin marketplace update opcheese-skills
claude plugin update superpowers-human@opcheese-skills      # or superpowers-agents
```

Then restart Claude Code. `claude plugin list` should show
`Version: 7.0.0` for the spine.

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
| Effort | `medium` | Opus 5.5 already starts at `medium`. If you changed it, type `/effort medium` in a session; that saves it as your default. For `claude -p`, set `CLAUDE_CODE_EFFORT_LEVEL=medium`. |
| Raising effort | `high` for hard debugging or architecture, for that session only | Type `/effort` with nothing after it, move the slider to `high`, and press `s` (this session only). Typing `/effort high` would save `high` as your default. |
| `max` | Don't | Several times the tokens for little gain, and it can loop. Claude Code applies it to the current session only anyway. |
| Subagent effort and model | Cheaper than the main session for search, scanning and audits | Ask Claude, for example "use a subagent on Sonnet at low effort for the search". For a custom agent, set `effort:` and `model:` in its file under `.claude/agents/`. |
| Model training on your data | Off | Codex: Settings → Data controls → "Improve the model for everyone" → off. Claude: the model-training toggle in your claude.ai privacy settings. |
| Auto memory | On, but check it monthly | Type `/memory` in a session to see and open what Claude saved. Delete stale entries. To turn it off for yourself in one repo, set `"autoMemoryEnabled": false` in that repo's `.claude/settings.local.json`; `.claude/settings.json` would turn it off for the whole team. |

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

## Using other models in either harness

Both harnesses can drive another vendor's model. Skills, hooks, plugins and
subagents still work, because they run in the harness, not the model.

A few rules apply to every setup below:

- **Billing.** These setups bill per token on that provider's API key. A
  Claude subscription works only with Claude models in Claude Code, and a
  ChatGPT plan only with OpenAI models in Codex.
- **Keys.** Never put a key in `settings.json` or `config.toml`. Export it
  from your secrets store, or use Claude Code's `apiKeyHelper`. This is the
  route `kimi-delegation` takes.
- **Support.** Anthropic doesn't support Claude Code on non-Claude models.
  Claude-specific features (effort levels, prompt caching, server-side web
  search) may degrade or fail. Check `/status` after switching.
- **Scope.** Switch one terminal or one `claude -p` run at a time with
  environment variables. Don't change the team's global settings.

| Model | In Claude Code | In Codex |
|---|---|---|
| **Kimi** (K3, K2.7 Code) | Native: Kimi serves the Anthropic Messages format | Native: Kimi serves the Responses API |
| **Ollama** (local or Ollama cloud) | Native: Ollama serves the Anthropic format; `ollama launch claude` | Native: `codex --oss` or `ollama launch codex` |
| **OpenAI** (GPT-6.x) | Through a translating proxy (LiteLLM) | Default |
| **Claude** | Default | Through a translating proxy (LiteLLM). Codex speaks only the Responses API, and Anthropic doesn't serve it. |

### Kimi in Claude Code

From Kimi's [Claude Code guide](https://platform.kimi.ai/docs/guide/claude-code-kimi.md):

```bash
export ANTHROPIC_BASE_URL=https://api.moonshot.ai/anthropic
export ANTHROPIC_AUTH_TOKEN="$KIMI_API_KEY"      # from your secrets store
export ANTHROPIC_API_KEY=""
export ANTHROPIC_MODEL='kimi-k3[1m]'
export ANTHROPIC_DEFAULT_OPUS_MODEL='kimi-k3[1m]'
export ANTHROPIC_DEFAULT_SONNET_MODEL='kimi-k3[1m]'
export ANTHROPIC_DEFAULT_FABLE_MODEL='kimi-k3[1m]'
export ANTHROPIC_DEFAULT_HAIKU_MODEL=kimi-k2.7-code
export CLAUDE_CODE_SUBAGENT_MODEL='kimi-k3[1m]'
claude
```

With a Kimi Code subscription instead of an API key, use the
`kimi-delegation` plugin; it handles the endpoint and credential. Leftover
`env` values in `~/.claude/settings.json` override what you export, so
remove them first.

### Ollama in Claude Code

From Ollama's [Claude Code guide](https://docs.ollama.com/integrations/claude-code.md):

```bash
ollama pull qwen3.6:35b-a3b             # once; about 23 GB
ollama launch claude                    # interactive setup
# or by hand:
ANTHROPIC_BASE_URL=http://localhost:11434 ANTHROPIC_AUTH_TOKEN=ollama ANTHROPIC_API_KEY="" \
  claude --model qwen3.6:35b-a3b
```

Give the model a context window of at least 64k tokens; Ollama defaults
lower. Set `OLLAMA_CONTEXT_LENGTH=65536` before starting `ollama serve`, or
see Ollama's [context length](https://docs.ollama.com/context-length) page.
If Ollama runs as a system service or the desktop app, set the variable
there and restart it. For Ollama's cloud models, set `ANTHROPIC_BASE_URL=https://ollama.com`
and `ANTHROPIC_AUTH_TOKEN="$OLLAMA_API_KEY"`. Small local models handle
tool-heavy agent work poorly, so they suit exploration and drafts, not
unattended runs.

**Auto mode works with Ollama, and its safety checks stay local.** Claude
Code's classifier, which checks each risky action, runs on the Sonnet-tier
model you set. Without that setting it runs on the session's model. To
choose a classifier model and skip a startup notice:

```bash
export ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3.8:27b   # the classifier
export CLAUDE_CODE_AUTO_MODE_SERVER=0
claude --model qwen3.8:27b --permission-mode auto
```

For a tested, copy-paste setup (model, context size, a `claude-local`
command, and no traffic to Anthropic), follow
[Claude Code on a local model](local-claude-code.md).

Expect about 10 seconds per checked shell command. Don't use a 12B model or a
reasoning model as the classifier: in our test the first blocked routine
work, and the second answered too slowly. Details and the model comparison:
[local auto mode classifier](https://github.com/opcheese/superpowers/blob/agents/docs/research/2026-10-12-local-auto-mode-classifier.md).

### OpenAI models in Claude Code

OpenAI doesn't serve the Anthropic format, so run a translating proxy.
[LiteLLM](https://docs.litellm.ai/docs/anthropic_unified) exposes
`/v1/messages` for any provider it supports:

```yaml
# litellm.yaml
model_list:
  - model_name: gpt-sol
    litellm_params:
      model: openai/gpt-6.1-sol
      api_key: os.environ/OPENAI_API_KEY
```

```bash
uv tool install 'litellm[proxy]'        # once
export LITELLM_KEY=sk-local-test        # any value if your proxy has no master key
litellm --config litellm.yaml           # serves http://localhost:4000
ANTHROPIC_BASE_URL=http://localhost:4000 ANTHROPIC_AUTH_TOKEN="$LITELLM_KEY" \
  claude --model gpt-sol
```

`LITELLM_KEY` is the master key you configure for your LiteLLM proxy (see
LiteLLM's docs). For a quick local test without one, any non-empty value
works.

For a second opinion from an OpenAI model, running Codex itself (`codex
exec`, `/review`) is usually simpler than this.

### Kimi in Codex

From Kimi's [Codex guide](https://platform.kimi.ai/docs/guide/codex-kimi.md),
in `~/.codex/config.toml`, or a `--profile` so it isn't the default:

```toml
model = "kimi-k3"
model_provider = "kimi"
model_context_window = 1048576

[model_providers.kimi]
name = "Kimi"
base_url = "https://api.moonshot.ai/v1"
env_key = "KIMI_API_KEY"
wire_api = "responses"
```

### Ollama in Codex

From Ollama's [Codex guide](https://docs.ollama.com/integrations/codex.md)
and Codex's [OSS mode](https://learn.chatgpt.com/docs/config-file/config-advanced.md):

```bash
ollama launch codex                     # sets up a dedicated profile
# or by hand:
codex --oss -m gpt-oss:120b             # set oss_provider = "ollama" to skip the prompt
```

Use a context window of at least 64k tokens.

### Claude in Codex

Codex supports only `wire_api = "responses"`, and Anthropic doesn't serve
the Responses API. LiteLLM's [`/v1/responses`](https://docs.litellm.ai/docs/response_api)
bridges to Claude:

```yaml
# litellm.yaml
model_list:
  - model_name: claude-opus
    litellm_params:
      model: anthropic/claude-opus-5-5
      api_key: os.environ/ANTHROPIC_API_KEY
```

```toml
# ~/.codex/config.toml (or a profile)
model = "claude-opus"
model_provider = "litellm"

[model_providers.litellm]
name = "LiteLLM"
base_url = "http://localhost:4000/v1"
env_key = "LITELLM_KEY"
wire_api = "responses"
```

Of the six setups, this is the least tested; neither OpenAI nor LiteLLM
documents it end to end. If you only want Claude's judgment on Codex's
work, run `claude -p` or `/code-review` on the branch instead.

## Deadlines

- **Oct 14 2026:** GPT-5.5 is retired from Codex. Update saved configs and
  custom agents that name it.
- **Nov 12 2026 (proposed, still being negotiated):** OpenAI plans to end
  Cursor's direct access to its models after SpaceX bought Cursor
  ([report](https://forklog.com/en/news/openai-to-end-partnership-with-cursor-following-spacex-acquisition)).
  Anyone who reaches GPT models through Cursor should plan for a direct Codex
  plan or their own API key.

## Sources

- [Claude Code docs](https://code.claude.com/docs/llms.txt) and
  [changelog](https://code.claude.com/docs/en/changelog)
- [Codex docs](https://learn.chatgpt.com/llms.txt) and
  [changelog](https://learn.chatgpt.com/docs/changelog)
- [Claude Code LLM gateways](https://code.claude.com/docs/en/llm-gateway),
  [Kimi API docs](https://platform.kimi.ai/docs/llms.txt),
  [Ollama docs](https://docs.ollama.com/llms.txt),
  [LiteLLM](https://docs.litellm.ai/docs/)
- [Superpowers fork v7.0.0 sync record](https://github.com/opcheese/superpowers/blob/agents/docs/superpowers/plans/2026-10-12-sync-upstream-v7.0.0.md)
