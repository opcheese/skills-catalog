---
last_verified: 2026-10-12
---

# Claude Code on a local model

This guide sets up Claude Code to run on a model on your own GPU, through
Ollama. Your code and prompts never leave your machine, and nothing is
billed. You keep the team plugins and auto mode.

Use it for private code, offline work, or when you're out of usage. For
hard work, use the normal `claude`: a local model is noticeably weaker and
slower than Claude.

Everything here was tested on 2026-10-12 with Claude Code 2.1.296, Ollama
0.34.2 and an RTX 5090. Anthropic doesn't support non-Claude models in Claude
Code, so a future release could break it. The test details are in the
[spike report](https://github.com/opcheese/superpowers/blob/agents/docs/research/2026-10-12-local-claude-code-spike.md).

## Before you start

You need:

- **Linux with an NVIDIA GPU with at least 20 GB of free memory.** The
  model uses about 17 GB. Check with `nvidia-smi`. Macs with Apple Silicon
  and 32 GB or more may work, but we haven't tested them.
- **About 20 GB of free disk** for the model.
- **Claude Code with the team plugins**, set up as in the
  [dev guide](dev-guide.md).
- **Ollama 0.34 or later.** Install it from
  [ollama.com/download](https://ollama.com/download), then check:

  ```
  ollama --version
  ```

All commands below go in your **terminal**.

## Setup, once per machine

1. Download the model (about 17 GB):

   ```
   ollama pull qwen3.8:27b
   ```

2. Make a copy of it with a 128k context. Ollama's default is too small
   for Claude Code, and Claude Code can't change it:

   ```
   printf 'FROM qwen3.8:27b\nPARAMETER num_ctx 131072\n' > /tmp/qwen-128k.Modelfile
   ollama create qwen3.8-27b-128k -f /tmp/qwen-128k.Modelfile
   ```

   `ollama list` should now show `qwen3.8-27b-128k`.

3. Add the `claude-local` command. Open `~/.bashrc` (or `~/.zshrc` if
   you use zsh) in an editor and paste this at the end:

   ```bash
   # Claude Code on a local Ollama model
   claude-local() {
     local m="${CLAUDE_LOCAL_MODEL:-qwen3.8-27b-128k}"
     ANTHROPIC_BASE_URL=http://localhost:11434 \
     ANTHROPIC_AUTH_TOKEN=ollama \
     ANTHROPIC_API_KEY="" \
     ANTHROPIC_MODEL="$m" \
     ANTHROPIC_DEFAULT_OPUS_MODEL="$m" \
     ANTHROPIC_DEFAULT_SONNET_MODEL="$m" \
     ANTHROPIC_DEFAULT_HAIKU_MODEL="$m" \
     ANTHROPIC_DEFAULT_FABLE_MODEL="$m" \
     CLAUDE_CODE_SUBAGENT_MODEL="$m" \
     CLAUDE_CODE_MAX_CONTEXT_TOKENS=131072 \
     CLAUDE_CODE_AUTO_MODE_SERVER=0 \
     CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
     claude --settings '{"skipWebFetchPreflight": true}' "$@"
   }
   ```

   Save the file, then load it:

   ```
   source ~/.bashrc
   ```

   (or `source ~/.zshrc`).

4. Check it works. In an empty scratch folder:

   ```
   mkdir -p /tmp/local-test && cd /tmp/local-test && git init
   claude-local
   ```

   The first answer takes 10–30 seconds while the model loads. Say:

   ```
   Let's make a react todo list
   ```

   The agent should ask what the list is for instead of writing code. If it
   starts writing code, the plugins aren't loading; say so in the team
   channel. Type `/exit` when done.

5. Check the context size. While `claude-local` is running, in a second
   terminal:

   ```
   ollama ps
   ```

   The `CONTEXT` column should say `131072`. If it says `32768`, you started
   the original model instead of the `-128k` copy.

## Daily use

- **Start it:** `claude-local` in your project folder. Everything you know
  from `claude` works the same way: the spine, skills, subagents, `/exit`.
- **Auto mode:** press `Shift+Tab` until the footer says `auto mode on`, or
  start with `claude-local --permission-mode auto`. The safety check runs on
  the same local model. It adds 10–20 seconds to each shell command it
  checks; reading and editing files inside the project skip it.
- **Say "don't push"** when you don't want the agent to push. In testing,
  local models sometimes tried to push without being asked. Auto mode allows
  pushes to the project's own remote, and it respects a "don't push" you
  state in the conversation.
- **Back to Claude:** run the normal `claude`. Nothing in this setup changes
  it.
- **Another model:** `CLAUDE_LOCAL_MODEL=qwen3.6-35b-a3b-128k claude-local`,
  after making a 128k copy of it the same way as step 2. `qwen3.6:35b-a3b`
  is faster but needs 24 GB and is a weaker safety checker. Don't use
  `gemma4`: it skipped the design step in testing.

## What works and what doesn't

| Works | Doesn't work |
|---|---|
| Plugins, skills, the brainstorm → plan → build spine | Web search (it needs Anthropic's servers) |
| Reading, editing, running commands, git | claude.ai connectors (Gmail, Drive and so on) |
| Subagents | Automatic Claude Code updates while `claude-local` runs; the normal `claude` still updates |
| Auto mode | |
| Fetching a web page you name (WebFetch) | |

Not tested yet: `/code-review`, which the interactive spine asks you to run
after each task.

## What leaves your machine

Nothing goes to Anthropic. In testing, the only network connections were to
Ollama, plus the website when the agent fetched a page you asked for. Two
settings in the function make that true:

- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` turns off telemetry, error
  reports and update checks.
- `skipWebFetchPreflight` stops WebFetch sending each site's name to
  Anthropic for a safety check before fetching it.

Your installed plugins can still make their own connections, for example an
MCP server that talks to an online service.

## Troubleshooting

- **"model not found":** check the name with `ollama list`. The function
  uses `qwen3.8-27b-128k`.
- **Connection refused:** Ollama isn't running. Start it with
  `ollama serve`, or start the Ollama app.
- **"Not run · auto mode's check had no usable answer":** the safety check
  failed or timed out. Try the action again. If it keeps happening, check
  that `ollama ps` shows only one model loaded.
- **Very slow answers:** another model is taking GPU memory. Run `ollama ps`
  and `ollama stop <name>` for anything except `qwen3.8-27b-128k`.
- **A warning about claude.ai connectors at startup:** expected. They're
  off in local mode.
