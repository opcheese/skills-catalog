---
last_verified: 2026-10-12
---

# Claude Code on a local model

This guide sets up Claude Code to run on a model on your own GPU, through
Ollama. Your prompts and code go to that model, not to Anthropic, so nothing
is billed to your Claude account. You keep the team plugins and auto mode.

Use it for private code, offline work, or when you're out of usage. For
hard work, use the normal `claude`: a local model is noticeably weaker and
slower than Claude.

**What was tested.** One Linux machine (RTX 5090, 32 GB) with Claude Code
2.1.296 and Ollama 0.34.2, in a clean Claude Code config with the team
plugins. Network tracing there showed no traffic to Anthropic. Macs and zsh
were not tested. Anthropic doesn't support non-Claude models in Claude Code,
so a future release could break this. Details are in the
[spike report](https://github.com/opcheese/superpowers/blob/agents/docs/research/2026-10-12-local-claude-code-spike.md).

## Words used here

| Word | Meaning |
|---|---|
| Ollama | A program that runs AI models on your own computer. |
| context | How much text the model can see at once, counted in tokens. 128k means 131,072 tokens. |
| Modelfile | A small recipe file Ollama uses to make a variant of a model. Here it only changes the context size. |
| auto mode | Claude Code runs commands without asking you, and a model checks each risky command first. |
| the spine | Our main plugin, `superpowers-human`. See the [dev guide](dev-guide.md). |
| WebFetch | The tool the agent uses to open a web page. |

## Before you start

You need:

- **Linux with an NVIDIA GPU with at least 20 GB of free memory.** The model
  uses about 17 GB. Run `nvidia-smi`: free memory is the total minus the used
  amount in the Memory-Usage column.
- **About 20 GB of free disk** for the model.
- **Claude Code with the team plugins**, set up as in the
  [dev guide](dev-guide.md). Run the dev guide's check (step 8) with the
  normal `claude` first, so you know the plugins work.
- **Ollama.** We tested 0.34.2; older versions may not work. Install it:

  ```
  curl -fsSL https://ollama.com/install.sh | sh
  ```

  On Linux this also starts Ollama as a background service. Check it's
  running:

  ```
  ollama --version
  ollama list
  ```

  An empty list is fine. An error means Ollama isn't running; see
  *Troubleshooting*.

All commands below go in your **terminal**.

## Setup, once per machine

1. Download the model (about 17 GB):

   ```
   ollama pull qwen3.8:27b
   ```

2. Make a copy of it with a 128k context. Ollama's default is too small
   for Claude Code, and Claude Code can't change it:

   ```
   printf 'FROM qwen3.8:27b\nPARAMETER num_ctx 131072\n' > ~/qwen-128k.Modelfile
   ollama create qwen3.8-27b-128k -f ~/qwen-128k.Modelfile
   ```

   `ollama list` now shows `qwen3.8-27b-128k`. It shares its files with the
   original, so it doesn't take another 17 GB.

3. Add the `claude-local` command. Check your shell first:

   ```
   echo $SHELL
   ```

   If it ends in `zsh`, replace `~/.bashrc` with `~/.zshrc` in both commands
   below. Then copy and paste the whole block **once**:

```bash
cat >> ~/.bashrc <<'EOF'
# Claude Code on a local Ollama model
claude-local() {
  local m="${CLAUDE_LOCAL_MODEL:-qwen3.8-27b-128k}" arg
  for arg in "$@"; do
    case "$arg" in
      --settings|--settings=*)
        echo "claude-local: don't pass --settings; it would replace the local setup and send prompts to Anthropic." >&2
        return 2 ;;
    esac
  done
  claude --settings "{
    \"skipWebFetchPreflight\": true,
    \"permissions\": { \"ask\": [\"Bash(git push:*)\"] },
    \"env\": {
      \"ANTHROPIC_BASE_URL\": \"http://127.0.0.1:11434\",
      \"ANTHROPIC_AUTH_TOKEN\": \"ollama\",
      \"ANTHROPIC_API_KEY\": \"\",
      \"ANTHROPIC_MODEL\": \"$m\",
      \"ANTHROPIC_DEFAULT_OPUS_MODEL\": \"$m\",
      \"ANTHROPIC_DEFAULT_SONNET_MODEL\": \"$m\",
      \"ANTHROPIC_DEFAULT_HAIKU_MODEL\": \"$m\",
      \"ANTHROPIC_DEFAULT_FABLE_MODEL\": \"$m\",
      \"CLAUDE_CODE_SUBAGENT_MODEL\": \"$m\",
      \"CLAUDE_CODE_MAX_CONTEXT_TOKENS\": \"131072\",
      \"CLAUDE_CODE_AUTO_MODE_SERVER\": \"0\",
      \"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC\": \"1\"
    }
  }" "$@"
}
EOF
source ~/.bashrc
```

   New terminals get `claude-local` automatically. Terminals that were
   already open need `source ~/.bashrc`, or close and reopen them.

   The settings sit inside `--settings` on purpose: that way they win over
   any `env` block in your own or a project's settings files, which could
   otherwise send your prompts somewhere else. For the same reason,
   `claude-local` refuses a second `--settings` flag: Claude Code would use
   that one instead, and the session would go to Anthropic.

4. Check it works. In an empty scratch folder:

   ```
   mkdir -p ~/local-test && cd ~/local-test && git init
   claude-local
   ```

   If Claude Code asks whether you trust the folder, choose yes. The first
   answer can take half a minute while the model loads. Say:

   ```
   Let's make a react todo list
   ```

   The agent should ask what the list is for instead of writing code. Its
   first message offers to skip the questions; don't take that offer for
   this test. If it starts writing code and the dev guide's check passed
   with the normal `claude`, the local model is the problem. Say so in the
   team channel either way. Type `/exit` when done.

5. Check the model is set up right. Start `claude-local` again, send any
   message, and while it runs, in a second terminal:

   ```
   ollama ps
   ```

   - `CONTEXT` should say `131072`. Any other number (often `32768` or
     `4096`) means the original model started instead of the `-128k` copy.
   - `PROCESSOR` should say `100% GPU`. If it mentions CPU, the model
     doesn't fit in GPU memory: close other GPU programs, or `ollama stop`
     other models.
   - If `ollama ps` shows nothing, the model was unloaded after a few idle
     minutes. Send a message and check again.

## Daily use

- **Start it:** `claude-local` in your project folder. Most of what you
  know from `claude` works the same way; see *What works and what doesn't*.
- **Auto mode is on when a session starts.** The footer shows
  `⏵⏵ auto mode on`. The check runs on the same local model and adds about
  10 seconds to each shell command it checks, more for the first one.
  Reading and editing files inside the project skip it. The local check is
  less proven than Claude's: it passed our 16-case test, which is a smoke
  test only. To be asked before every command instead, press `Shift+Tab`
  until the footer shows manual mode, or start with
  `claude-local --permission-mode default`.
- **Pushes always ask you.** `claude-local` adds a rule that asks before
  every `git push`, because local models sometimes tried to push without
  being asked. Approve it only when you meant to push.
- **Back to Claude:** run the normal `claude`. Nothing in this setup changes
  it.
- **Updates:** `claude-local` turns off Claude Code's automatic updates. If
  you mostly use it, run `claude update` now and then.
- **Another model:** `qwen3.6:35b-a3b` is faster but needs about 24 GB of
  GPU memory, so in practice a 32 GB card, and 23 GB more disk:

  ```
  ollama pull qwen3.6:35b-a3b
  printf 'FROM qwen3.6:35b-a3b\nPARAMETER num_ctx 131072\n' > ~/qwen3.6-128k.Modelfile
  ollama create qwen3.6-35b-a3b-128k -f ~/qwen3.6-128k.Modelfile
  CLAUDE_LOCAL_MODEL=qwen3.6-35b-a3b-128k claude-local
  ```

  Its safety checks are slower. Don't use `gemma4`: it skipped the design
  step in testing.

## What works and what doesn't

| Works | Doesn't work |
|---|---|
| Plugins, skills, the brainstorm → plan → build spine | Web search (it needs Anthropic's servers) |
| Reading, editing, running commands, git | claude.ai connectors (Gmail, Drive and so on) |
| Subagents | Automatic Claude Code updates while `claude-local` runs |
| Auto mode, with a less proven local check | Some features that need Anthropic's servers, such as plugins synced from claude.ai |
| Opening a web page you name (WebFetch) | |

Not tested yet: `/code-review`, which the spine asks you to run after each
task.

## What leaves your machine

Your prompts and code go only to Ollama. In testing, Claude Code itself
connected only to Ollama, plus the website when the agent opened a page.

- The function points Claude Code at Ollama (`ANTHROPIC_BASE_URL`), and
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` turns off telemetry, error
  reports and update checks.
- `skipWebFetchPreflight` stops WebFetch sending each site's name to
  Anthropic before opening it. That check also blocks sites on Anthropic's
  list of unsafe domains, so with it off, be careful which pages you let the
  agent open.

Other things still use the network as usual:

- **Commands the agent runs.** `git push` sends your code to your remote
  (after you approve it), and installs download packages.
- **Your plugins and MCP servers**, if they talk to online services.

## Troubleshooting

- **Connection error or connection refused:** Ollama isn't running. On
  Linux, run `sudo systemctl start ollama`. Check it with
  `systemctl status ollama`, and read its logs with
  `journalctl -e -u ollama`. Don't run `ollama serve` yourself on Linux: it
  starts a second Ollama that can't see the models you downloaded.
- **Model not found:** check the name with `ollama list`. The function uses
  `qwen3.8-27b-128k`.
- **"Not run · auto mode's check had no usable answer":** the safety check
  failed or timed out. Try the action again. If it keeps happening, check
  that `ollama ps` shows only one model loaded.
- **Very slow answers:** another model is using GPU memory, or the model
  is running on the CPU. Run `ollama ps`, and `ollama stop <name>` for
  anything except `qwen3.8-27b-128k`.
