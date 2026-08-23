---
name: git-guardrails-claude-code
description: Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute. Use when user wants to prevent destructive git operations, add git safety hooks, or block git push/reset in Claude Code.
---

# Setup Git Guardrails

Sets up a PreToolUse hook that intercepts and blocks dangerous git commands before Claude executes them.

## What Gets Blocked

Always, regardless of branch:

- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`
- `git push --force` / `-f` / `--force-with-lease`, a `+refspec`, and
  `git push --mirror` / `--all` / `--delete`

Pushing is **branch-aware**:

- **Blocked** — any push whose destination is a protected branch, including
  `git push origin main`, `git push origin feature:main`,
  `git push origin HEAD:refs/heads/main`, and a bare `git push` while HEAD is
  on a protected branch.
- **Allowed** — pushing a feature branch: `git push -u origin my-feature`,
  `git push`, `git push origin HEAD:refs/heads/new-branch`.

Protected means `main`, `master`, and the remote's own default branch. Override
the set with `GIT_GUARDRAILS_PROTECTED_BRANCHES`, comma-separated.

Why not block pushing outright: opening a pull request requires pushing a
branch. A hook that blocks every push blocks the safe workflow along with the
dangerous one, and it breaks any unattended agent whose finish step is
"push the branch, open a PR."

When blocked, Claude sees a message naming the reason and telling it that it does not have authority to run the command.

## Steps

### 1. Ask scope

Ask the user: install for **this project only** (`.claude/settings.json`) or **all projects** (`~/.claude/settings.json`)?

### 2. Copy the hook script

The bundled script is at: [scripts/block-dangerous-git.sh](scripts/block-dangerous-git.sh)

Copy it to the target location based on scope:

- **Project**: `.claude/hooks/block-dangerous-git.sh`
- **Global**: `~/.claude/hooks/block-dangerous-git.sh`

Make it executable with `chmod +x`.

### 3. Add hook to settings

Add to the appropriate settings file:

**Project** (`.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

**Global** (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

If the settings file already exists, merge the hook into the existing `hooks.PreToolUse` array. Don't overwrite other settings.

### 4. Ask about customization

Ask if user wants to add or remove any patterns from the blocked list. Edit the copied script accordingly.

### 5. Verify

Run a quick test:

```bash
echo '{"tool_input":{"command":"git push origin main"}}' | <path-to-script>
```

Should exit with code 2 and print a BLOCKED message to stderr. Then check the
safe case is still allowed, which is the half that actually breaks workflows:

```bash
echo '{"tool_input":{"command":"git push -u origin my-feature"}}' | <path-to-script>
```

Should exit 0 and print nothing.

The bundled suite covers both directions:

```bash
bash tests/test-block-dangerous-git.sh
```
