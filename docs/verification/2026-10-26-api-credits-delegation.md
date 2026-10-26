---
status: current
last_verified: 2026-10-26
owner: opcheese
---

# Verifying api-credits-delegation by hand

Each step is copy-paste ready. The real calls use Haiku with a cap of a few
cents, and together they cost under $0.02. Run them in an empty directory, so
that no project's settings take part.

```bash
mkdir -p /tmp/credits-check && cd /tmp/credits-check
```

## Setup

1. Link a Console organization to your Max or Team plan. On claude.ai, go to
   Settings > Billing > API credits.
2. Create an API key in that organization, at platform.claude.com > API keys.
3. Store the key. Paste it, press Enter, then press Ctrl-D:

   ```bash
   install -d -m 700 ~/.config/claude-credits
   (umask 077; cat > ~/.config/claude-credits/key)
   ls -l ~/.config/claude-credits/key      # expect -rw-------
   ```

4. Install the plugin and restart Claude Code:

   ```bash
   claude plugin marketplace update opcheese-skills
   claude plugin install api-credits-delegation@opcheese-skills
   ```

5. Find the script. The plugin cache path contains the version:

   ```bash
   CD=$(ls -d ~/.claude/plugins/cache/opcheese-skills/api-credits-delegation/*/skills/delegating-to-api-credits | tail -1)
   ```

## Happy path

```bash
"$CD/scripts/credits-delegate" --budget 0.05 -- "Reply with the word pong."
```

Expect `pong` on stdout. On stderr, expect two `credits-delegate:` lines: one
naming `model=haiku` and `auth=api-credits`, and one with `cost_usd=` and
`served_by=claude-haiku-...`.

Then, within a few hours, the Console's Usage or Cost page shows the spend
under that organization.

## Edge cases

- **The key file is readable by others.** The script must refuse, and it must
  name `chmod 600`:

  ```bash
  chmod 644 ~/.config/claude-credits/key
  "$CD/scripts/credits-delegate" -- "x"; chmod 600 ~/.config/claude-credits/key
  ```

- **The key is wrong.** The script must refuse at once with `rejected ...
  (HTTP 401)`. It must not hang:

  ```bash
  printf 'sk-ant-api03-wrong\n' > bad; chmod 600 bad
  CLAUDE_CREDITS_KEY_FILE=$PWD/bad "$CD/scripts/credits-delegate" -- "x"
  ```

- **The budget runs out.** The script must exit 1. On stderr, expect
  `Reached maximum budget ($0.001) (subtype error_max_budget_usd)` and a cost
  a little over the cap:

  ```bash
  "$CD/scripts/credits-delegate" --budget 0.001 -- "Read README.md in $CD/../.. and summarise it in 300 words."
  ```

- **Nesting.** The script must refuse with `already in progress`:

  ```bash
  CREDITS_DELEGATE_DEPTH=1 "$CD/scripts/credits-delegate" -- "x"
  ```

- **Skipping permissions.** The script must refuse:

  ```bash
  "$CD/scripts/credits-delegate" --dangerously-skip-permissions -- "x"
  ```

## Round trip: the plan login is untouched

1. In a new terminal, run `claude`, then `/status`. It must still show your
   claude.ai login, with no API key in use. The script never exports the key.
2. Run `env | grep -c ANTHROPIC_API_KEY`. The expected count is `0`.

## Hermetic tests

These make no network calls and cost nothing:

```bash
bash "$CD/tests/test-credits-delegate.sh"     # expect: 51 passed, 0 failed
```
