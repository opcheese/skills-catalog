# kimi-delegation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `kimi-delegation` plugin on the `opcheese-skills` marketplace that lets Claude Code hand work to Kimi, either through Kimi's own agent system or by running Claude Code itself on Kimi's model.

**Architecture:** One skill and two bash scripts under `plugins/kimi-delegation/`. `kimi-credential` is an `apiKeyHelper` that prints a valid subscription token, delegating OAuth refresh to the Kimi CLI. `kimi-delegate` crosses the provider boundary in either direction, defaulting Path A to Kimi's read-only `explore` agent.

**Tech Stack:** bash (`set -uo pipefail`), `python3` for JSON and epoch arithmetic, the Kimi Code CLI (>= 0.38.0), the `claude` CLI. No third-party packages.

**Spec:** `docs/superpowers/specs/2026-08-24-kimi-delegation-design.md`

**Working directory:** all paths are relative to `/home/newub/w/skills-catalog`.

---

### Task 1: Plugin scaffold

**Files:**
- Create: `plugins/kimi-delegation/.claude-plugin/plugin.json`
- Create: `plugins/kimi-delegation/LICENSE`
- Test: `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-manifest.sh`

- [ ] **Step 1: Write the failing test**

Create `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-manifest.sh`:

```bash
#!/usr/bin/env bash
# The plugin manifest must be valid JSON with the fields the marketplace reads.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MANIFEST="$ROOT/.claude-plugin/plugin.json"
PASS=0
FAIL=0

check() {
  local label=$1 actual=$2 expected=$3
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1)); printf '  [ok]   %s\n' "$label"
  else
    FAIL=$((FAIL + 1)); printf '  [FAIL] %s: expected %s, got %s\n' "$label" "$expected" "$actual"
  fi
}

check "manifest exists" "$([ -f "$MANIFEST" ] && echo yes || echo no)" "yes"
check "valid json" "$(python3 -c 'import json,sys;json.load(open(sys.argv[1]));print("yes")' "$MANIFEST" 2>/dev/null || echo no)" "yes"
check "name" "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["name"])' "$MANIFEST" 2>/dev/null)" "kimi-delegation"
check "has description" "$(python3 -c 'import json,sys;print("yes" if json.load(open(sys.argv[1])).get("description") else "no")' "$MANIFEST" 2>/dev/null || echo no)" "yes"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-manifest.sh`
Expected: FAIL — `manifest exists: expected yes, got no`

- [ ] **Step 3: Create the manifest**

Create `plugins/kimi-delegation/.claude-plugin/plugin.json`:

```json
{
  "name": "kimi-delegation",
  "description": "Delegate work to Kimi from Claude Code: read-only review and bulk tasks through Kimi's own agents, or Claude Code itself running on Kimi's model. Requires a Kimi Code subscription and CLI >= 0.38.0",
  "version": "1.0.0",
  "author": {
    "name": "opcheese"
  },
  "license": "MIT",
  "keywords": ["kimi", "delegation", "agents", "review", "multi-model"]
}
```

- [ ] **Step 4: Add the LICENSE**

Copy the existing catalog licence so the new plugin matches its siblings:

```bash
cp plugins/codebase-vocabulary/LICENSE plugins/kimi-delegation/LICENSE
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-manifest.sh`
Expected: `4 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add plugins/kimi-delegation
git commit -m "feat(kimi): scaffold the kimi-delegation plugin"
```

---

### Task 2: kimi-credential — the valid-token path

The helper's contract is strict: print only the token, exit 0, and stay silent on stderr because Claude Code treats any stderr output as an error. When the token is valid this must be a file read and a print, with no subprocess.

**Files:**
- Create: `plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-credential`
- Test: `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`

- [ ] **Step 1: Write the failing test**

Create `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`:

```bash
#!/usr/bin/env bash
# Tests for kimi-credential. Hermetic: fixture credential files and a fake
# kimi on PATH. No network, no subscription required.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/kimi-credential"
PASS=0
FAIL=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Build a credential file whose token expires $1 seconds from now.
make_cred() {
  local home=$1 offset=$2 token=$3
  mkdir -p "$home/credentials"
  python3 - "$home/credentials/kimi-code.json" "$offset" "$token" <<'PY'
import json, sys, time
path, offset, token = sys.argv[1], int(sys.argv[2]), sys.argv[3]
json.dump({"access_token": token, "refresh_token": "r", "token_type": "Bearer",
           "expires_in": 900, "expires_at": int(time.time()) + offset}, open(path, "w"))
PY
}

check() {
  local label=$1 actual=$2 expected=$3
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1)); printf '  [ok]   %s\n' "$label"
  else
    FAIL=$((FAIL + 1)); printf '  [FAIL] %s\n         expected: %s\n         actual:   %s\n' "$label" "$expected" "$actual"
  fi
}

echo "A valid token is printed verbatim:"
HOME_A="$WORK/a"
make_cred "$HOME_A" 600 "tok-valid"
mkdir -p "$WORK/bin_a"
cat > "$WORK/bin_a/kimi" <<EOF
#!/usr/bin/env bash
touch "$WORK/spawned"
EOF
chmod +x "$WORK/bin_a/kimi"
OUT=$(KIMI_CODE_HOME="$HOME_A" PATH="$WORK/bin_a:$PATH" bash "$SCRIPT" 2>"$WORK/err_a")
STATUS=$?
check "stdout is the token" "$OUT" "tok-valid"
check "exit 0" "$STATUS" "0"
check "stderr is empty" "$(cat "$WORK/err_a")" ""
check "no subprocess spawned" "$([ -e "$WORK/spawned" ] && echo yes || echo no)" "no"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`
Expected: FAIL — the script does not exist, so stdout is empty.

- [ ] **Step 3: Write the minimal implementation**

Create `plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-credential`:

```bash
#!/usr/bin/env bash
# apiKeyHelper: print a currently-valid Kimi subscription bearer token.
#
# Claude Code's contract: print ONLY the credential on stdout and exit 0.
# Any stderr output is treated as an error, so the success path is silent.
# The helper is cached for 5 minutes by default and re-invoked on HTTP 401;
# the Kimi token lives 900s, so the cache sits comfortably inside the TTL.
#
# We never implement an OAuth refresh and never write a token anywhere. When
# the stored token is stale we run the Kimi CLI, which refreshes the file as
# a side effect of any successful call, then re-read it.

set -uo pipefail

KIMI_HOME="${KIMI_CODE_HOME:-$HOME/.kimi-code}"
CRED="$KIMI_HOME/credentials/kimi-code.json"
SKEW=60

# Exit 0 and print the token if it is valid; 2 if present but stale; 1 if
# there is nothing usable.
read_token() {
  python3 - "$CRED" "$SKEW" <<'PY' 2>/dev/null
import json, sys, time
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(1)
tok, exp = d.get("access_token"), d.get("expires_at")
if not tok or not isinstance(exp, (int, float)):
    sys.exit(1)
if exp <= time.time() + int(sys.argv[2]):
    sys.exit(2)
print(tok)
PY
}

TOKEN=$(read_token)
case $? in
  0) printf '%s\n' "$TOKEN"; exit 0 ;;
  1) printf 'kimi-credential: no usable credential at %s. Run: kimi login\n' "$CRED" >&2; exit 1 ;;
esac

exit 1
```

Make it executable:

```bash
chmod +x plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-credential
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`
Expected: `4 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add plugins/kimi-delegation
git commit -m "feat(kimi): kimi-credential prints a valid subscription token"
```

---

### Task 3: kimi-credential — the refresh path

**Files:**
- Modify: `plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-credential`
- Modify: `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`

- [ ] **Step 1: Write the failing test**

In `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`, insert this helper immediately after the `make_cred` function:

```bash
# A fake kimi that rewrites the credential file the way the real CLI does.
make_fake_kimi() {
  local bindir=$1 home=$2 newtoken=$3
  mkdir -p "$bindir"
  cat > "$bindir/kimi" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "--version" ]; then echo "0.38.0"; exit 0; fi
python3 - "$home/credentials/kimi-code.json" "$newtoken" <<'PY'
import json, sys, time
path, token = sys.argv[1], sys.argv[2]
d = json.load(open(path))
d["access_token"] = token
d["expires_at"] = int(time.time()) + 900
json.dump(d, open(path, "w"))
PY
echo "fake kimi ran"
EOF
  chmod +x "$bindir/kimi"
}
```

Then append this block immediately before the final `printf '\n%d passed'` line:

```bash
echo "A stale token is refreshed through the Kimi CLI:"
HOME_B="$WORK/b"
make_cred "$HOME_B" -10 "tok-stale"
make_fake_kimi "$WORK/bin_b" "$HOME_B" "tok-fresh"
OUT=$(KIMI_CODE_HOME="$HOME_B" PATH="$WORK/bin_b:$PATH" bash "$SCRIPT" 2>"$WORK/err_b")
check "stale token is replaced" "$OUT" "tok-fresh"
check "refresh keeps stderr empty" "$(cat "$WORK/err_b")" ""
check "no CLI chatter on stdout" "$(printf '%s' "$OUT" | grep -c 'fake kimi ran')" "0"
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`
Expected: FAIL — `stale token is replaced: expected tok-fresh, actual (empty)`, because the script currently exits 1 on a stale token.

- [ ] **Step 3: Implement the refresh**

In `kimi-credential`, replace the final two lines (`esac` is followed by `exit 1`) so the file ends with:

```bash
esac

# Stale. Let the Kimi CLI refresh the file as a side effect of a call, with
# every byte of its output discarded so our stderr stays clean.
KIMI_BIN="${KIMI_BIN:-$(command -v kimi 2>/dev/null || printf '%s' "$KIMI_HOME/bin/kimi")}"
if [ -x "$KIMI_BIN" ]; then
  refresh_kimi_credentials() {
    # Any successful call rewrites the credential file. Task 10 confirms
    # whether a cheaper subcommand than a prompt also does.
    "$KIMI_BIN" -p "ok" >/dev/null 2>&1
  }
  refresh_kimi_credentials
fi

TOKEN=$(read_token)
if [ $? -eq 0 ]; then
  printf '%s\n' "$TOKEN"
  exit 0
fi

printf 'kimi-credential: token expired and refresh failed. Run: kimi login\n' >&2
exit 1
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`
Expected: `7 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add plugins/kimi-delegation
git commit -m "feat(kimi): refresh a stale token through the Kimi CLI"
```

---

### Task 4: kimi-credential — the failure paths

**Files:**
- Modify: `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`

- [ ] **Step 1: Write the failing test**

Append immediately before the final `printf '\n%d passed'` line:

```bash
echo "Failure is loud and names the fix:"
HOME_C="$WORK/c"
mkdir -p "$HOME_C/credentials"
OUT=$(KIMI_CODE_HOME="$HOME_C" PATH="/nonexistent:/usr/bin:/bin" bash "$SCRIPT" 2>"$WORK/err_c")
STATUS=$?
check "missing credential exits 1" "$STATUS" "1"
check "missing credential prints nothing on stdout" "$OUT" ""
check "missing credential names kimi login" "$(grep -c 'kimi login' "$WORK/err_c")" "1"

HOME_D="$WORK/d"
make_cred "$HOME_D" -10 "tok-stale"
mkdir -p "$WORK/bin_d"
printf '#!/usr/bin/env bash\nexit 1\n' > "$WORK/bin_d/kimi"
chmod +x "$WORK/bin_d/kimi"
OUT=$(KIMI_CODE_HOME="$HOME_D" PATH="$WORK/bin_d:$PATH" bash "$SCRIPT" 2>"$WORK/err_d")
STATUS=$?
check "failed refresh exits 1" "$STATUS" "1"
check "failed refresh names kimi login" "$(grep -c 'kimi login' "$WORK/err_d")" "1"

check "no token-shaped string in any stderr" \
  "$(cat "$WORK"/err_* | grep -cE '[A-Za-z0-9._-]{40,}')" "0"
```

- [ ] **Step 2: Run it to verify it passes**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh`
Expected: `13 passed, 0 failed`. These paths were already implemented in Tasks 2 and 3; this task locks them against regression. If any case fails, fix `kimi-credential` rather than the test.

- [ ] **Step 3: Commit**

```bash
git add plugins/kimi-delegation
git commit -m "test(kimi): lock kimi-credential failure paths"
```

---

### Task 5: kimi-delegate — preflight and the version gate

`--agent` requires Kimi 0.38.0. Anything older silently loses the containment this plugin depends on, so the gate refuses rather than falling back.

**Files:**
- Create: `plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate`
- Test: `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`

- [ ] **Step 1: Write the failing test**

Create `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`:

```bash
#!/usr/bin/env bash
# Tests for kimi-delegate. Hermetic: fake kimi and claude on PATH that echo
# their argv, so we assert on the command that would have run.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/kimi-delegate"
PASS=0
FAIL=0

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BIN="$WORK/bin"
mkdir -p "$BIN"

make_cred() {
  mkdir -p "$WORK/home/credentials"
  python3 - "$WORK/home/credentials/kimi-code.json" <<'PY'
import json, sys, time
json.dump({"access_token": "tok", "expires_at": int(time.time()) + 900}, open(sys.argv[1], "w"))
PY
}

run() {
  KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" bash "$SCRIPT" "$@" 2>&1
}

check_contains() {
  local label=$1 haystack=$2 needle=$3
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    PASS=$((PASS + 1)); printf '  [ok]   %s\n' "$label"
  else
    FAIL=$((FAIL + 1)); printf '  [FAIL] %s\n         wanted to find: %s\n         in: %s\n' "$label" "$needle" "$haystack"
  fi
}

check_missing() {
  local label=$1 haystack=$2 needle=$3
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    FAIL=$((FAIL + 1)); printf '  [FAIL] %s\n         did not want: %s\n         in: %s\n' "$label" "$needle" "$haystack"
  else
    PASS=$((PASS + 1)); printf '  [ok]   %s\n' "$label"
  fi
}

make_cred

echo "The version gate:"
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.18.0"; exit 0; fi\necho "KIMI ARGV: $*"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"
OUT=$(run --via kimi -- "review this")
check_contains "0.18.0 is refused" "$OUT" "0.38.0"
check_missing "0.18.0 never reaches the CLI" "$OUT" "KIMI ARGV"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`
Expected: FAIL — the script does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate`:

```bash
#!/usr/bin/env bash
# Run one delegated task on Kimi and stream the result back.
#
#   kimi-delegate --via kimi|claude [--agent NAME] [--cwd DIR]
#                 [--output text|stream-json] -- <prompt>
#
# --via kimi    Kimi's own agent system. Defaults to the read-only `explore`
#               agent, because an unqualified `kimi -p` edits the working
#               tree with no approval gate.
# --via claude  Claude Code itself, running on Kimi's Anthropic-compatible
#               endpoint, keeping its own tools and permission system.

set -uo pipefail

MIN_KIMI_VERSION="0.38.0"
KIMI_HOME="${KIMI_CODE_HOME:-$HOME/.kimi-code}"
MODEL="${KIMI_DELEGATE_MODEL:-k3}"
BASE_URL="https://api.kimi.com/coding"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRED_HELPER="$SCRIPT_DIR/kimi-credential"
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && \
   [ -x "$CLAUDE_PLUGIN_ROOT/skills/delegating-to-kimi/scripts/kimi-credential" ]; then
  CRED_HELPER="$CLAUDE_PLUGIN_ROOT/skills/delegating-to-kimi/scripts/kimi-credential"
fi

die() { printf 'kimi-delegate: %s\n' "$1" >&2; exit 1; }

VIA=""
AGENT=""
CWD=""
OUTPUT="text"
PROMPT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --via)    VIA="${2:-}"; shift 2 ;;
    --agent)  AGENT="${2:-}"; shift 2 ;;
    --cwd)    CWD="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    --dangerously-skip-permissions|--allow-dangerously-skip-permissions)
      die "refusing --dangerously-skip-permissions; delegation never bypasses permission checks" ;;
    --) shift; PROMPT="$*"; break ;;
    *)  die "unknown argument: $1" ;;
  esac
done

[ -n "$VIA" ] || die "--via kimi|claude is required"
[ -n "$PROMPT" ] || die "a prompt is required after --"

KIMI_BIN="${KIMI_BIN:-$(command -v kimi 2>/dev/null || printf '%s' "$KIMI_HOME/bin/kimi")}"
[ -x "$KIMI_BIN" ] || die "Kimi CLI not found. Install: curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"

KIMI_VERSION="$("$KIMI_BIN" --version 2>/dev/null | tr -d '[:space:]')"
older_than() {
  [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ] && [ "$1" != "$2" ]
}
if [ -z "$KIMI_VERSION" ] || older_than "$KIMI_VERSION" "$MIN_KIMI_VERSION"; then
  die "Kimi CLI is ${KIMI_VERSION:-unknown}; $MIN_KIMI_VERSION or newer is required for --agent.
Note that \`kimi upgrade\` misdetects native Linux installs. Upgrade with:
  curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash"
fi

[ -f "$KIMI_HOME/credentials/kimi-code.json" ] || die "no Kimi credentials. Run: kimi login"

[ -n "$CWD" ] && { cd "$CWD" || die "no such directory: $CWD"; }

case "$VIA" in
  kimi)
    exec "$KIMI_BIN" -p "$PROMPT" --agent "${AGENT:-explore}" --output-format "$OUTPUT"
    ;;
  claude)
    die "not implemented yet"
    ;;
  *) die "--via must be kimi or claude, got: $VIA" ;;
esac
```

Make it executable:

```bash
chmod +x plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`
Expected: `2 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add plugins/kimi-delegation
git commit -m "feat(kimi): kimi-delegate preflight and version gate"
```

---

### Task 6: kimi-delegate — Path A containment

The default agent is the whole point of the plugin. These tests are the ones that must never regress.

**Files:**
- Modify: `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`

- [ ] **Step 1: Write the failing test**

Append immediately before the final `printf '\n%d passed'` line:

```bash
echo "Path A containment:"
printf '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "0.38.0"; exit 0; fi\necho "KIMI ARGV: $*"\n' > "$BIN/kimi"
chmod +x "$BIN/kimi"

OUT=$(run --via kimi -- "find the bug")
check_contains "no --agent means explore" "$OUT" "--agent explore"
check_contains "the prompt is passed" "$OUT" "find the bug"

OUT=$(run --via kimi --agent coder -- "fix the bug")
check_contains "an explicit agent is forwarded" "$OUT" "--agent coder"
check_missing "explore is not substituted in" "$OUT" "explore"

OUT=$(run --via kimi --agent coder --dangerously-skip-permissions -- "x")
check_contains "skip-permissions is refused" "$OUT" "refusing"
check_missing "skip-permissions never reaches the CLI" "$OUT" "KIMI ARGV"

OUT=$(KIMI_DELEGATE_DEPTH=1 KIMI_CODE_HOME="$WORK/home" PATH="$BIN:$PATH" bash "$SCRIPT" --via kimi -- "x" 2>&1)
check_contains "recursion is refused" "$OUT" "already in progress"
check_missing "recursion never reaches the CLI" "$OUT" "KIMI ARGV"
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`
Expected: FAIL on `recursion is refused` — the guard does not exist yet. The `explore` and skip-permissions cases already pass from Task 5.

- [ ] **Step 3: Add the recursion guard**

In `kimi-delegate`, insert immediately after the `die()` definition:

```bash
if [ "${KIMI_DELEGATE_DEPTH:-0}" -ge 1 ]; then
  die "delegation is already in progress (depth ${KIMI_DELEGATE_DEPTH}); refusing to nest"
fi
export KIMI_DELEGATE_DEPTH=$(( ${KIMI_DELEGATE_DEPTH:-0} + 1 ))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`
Expected: `10 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add plugins/kimi-delegation
git commit -m "feat(kimi): default Path A to the read-only explore agent, guard recursion"
```

---

### Task 7: kimi-delegate — Path B

**Files:**
- Modify: `plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate`
- Modify: `plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`

- [ ] **Step 1: Write the failing test**

Append immediately before the final `printf '\n%d passed'` line:

```bash
echo "Path B:"
cat > "$BIN/claude" <<'EOF'
#!/usr/bin/env bash
echo "CLAUDE ARGV: $*"
EOF
chmod +x "$BIN/claude"

OUT=$(run --via claude --agent reviewer -- "review this")
check_contains "base url points at kimi" "$OUT" "api.kimi.com/coding"
check_contains "model defaults to k3" "$OUT" '"ANTHROPIC_MODEL": "k3"'
check_contains "apiKeyHelper is an absolute path" "$OUT" "/kimi-credential"
check_contains "the agent is forwarded" "$OUT" "--agent reviewer"
check_contains "the prompt is passed" "$OUT" "review this"

OUT=$(KIMI_DELEGATE_MODEL=kimi-for-coding run --via claude -- "x")
check_contains "the model is overridable" "$OUT" '"ANTHROPIC_MODEL": "kimi-for-coding"'
check_missing "no agent flag when none given" "$OUT" "--agent"
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`
Expected: FAIL — `base url points at kimi`, because Path B still dies with "not implemented yet".

- [ ] **Step 3: Implement Path B**

In `kimi-delegate`, replace the `claude)` branch of the final `case` with:

```bash
  claude)
    command -v claude >/dev/null 2>&1 || die "the claude CLI is not on PATH"
    [ -x "$CRED_HELPER" ] || die "kimi-credential is missing or not executable: $CRED_HELPER"
    SETTINGS="$(python3 - "$CRED_HELPER" "$MODEL" "$BASE_URL" <<'PY'
import json, sys
helper, model, base_url = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({
    "env": {"ANTHROPIC_BASE_URL": base_url, "ANTHROPIC_MODEL": model},
    "apiKeyHelper": helper,
}, indent=None, separators=(", ", ": ")))
PY
)"
    if [ -n "$AGENT" ]; then
      exec claude -p "$PROMPT" --settings "$SETTINGS" --agent "$AGENT" --output-format "$OUTPUT"
    fi
    exec claude -p "$PROMPT" --settings "$SETTINGS" --output-format "$OUTPUT"
    ;;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-delegate.sh`
Expected: `17 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add plugins/kimi-delegation
git commit -m "feat(kimi): Path B runs claude on Kimi's endpoint via apiKeyHelper"
```

---

### Task 8: The skill

**Files:**
- Create: `plugins/kimi-delegation/skills/delegating-to-kimi/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `plugins/kimi-delegation/skills/delegating-to-kimi/SKILL.md`:

```markdown
---
name: delegating-to-kimi
description: Use when work should go to Kimi instead of Claude - an independent second opinion on a review or design, a large mechanical pass that would burn Claude context, or any task where a different model's judgment is worth more than a faster answer. Requires a Kimi Code subscription.
---

# Delegating to Kimi

Two ways across the provider boundary. Both are one Bash call. Neither needs
a new agent format: Path A uses Kimi's own agents, Path B uses the agent
definitions already in `.claude/agents/`.

## Which path

| The work | Path | Command |
| --- | --- | --- |
| Read and report — review, audit, second opinion | A, read-only | `--via kimi` |
| Needs Claude Code's tools, permissions, or your `.claude/agents/` | B | `--via claude` |
| Needs Kimi to orchestrate its own sub-agents | A, named agent | `--via kimi --agent <name>` |

## Running it

The scripts live beside this skill:

```bash
"$CLAUDE_PLUGIN_ROOT/skills/delegating-to-kimi/scripts/kimi-delegate" \
  --via kimi -- "Review src/auth.ts for auth bypasses. Report findings only."
```

Path A defaults to Kimi's `explore` agent, which is **read-only**. This is
deliberate: an unqualified `kimi -p` edits the working tree with no approval
gate at all, and `--yolo` is refused precisely because `-p` already behaves
that way. Naming a read-only agent is what contains it.

To let Kimi write, name an agent that can:

```bash
kimi-delegate --via kimi --agent coder -- "Apply the rename across the repo."
```

Path B runs Claude Code itself on Kimi's model, so Kimi's output is subject to
Claude Code's own permission system:

```bash
kimi-delegate --via claude --agent my-reviewer -- "Review the staged diff."
```

## Flags

- `--via kimi|claude` — required
- `--agent NAME` — Path A: a Kimi agent (`coder`, `explore`, `plan`, or one
  of yours in `.kimi-code/agents/`). Path B: one of your `.claude/agents/`.
- `--cwd DIR` — run in DIR instead of the current directory
- `--output text|stream-json` — passed through unaltered
- Everything after `--` is the prompt

`KIMI_DELEGATE_MODEL` overrides the model, default `k3`.

## What it refuses

- `--dangerously-skip-permissions`, on either path
- Nesting — a delegation started inside a delegated session
- Kimi CLI older than 0.38.0, which predates `--agent` and so cannot be
  contained

## Requirements

A Kimi Code subscription (`kimi login`) and CLI >= 0.38.0. Note that
`kimi upgrade` misdetects native Linux installs as Windows and refuses;
upgrade with `curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash`.

## Do not

Do not delegate work whose result you cannot check. A second model is useful
because it disagrees; that is only worth something if you read the
disagreement and judge it. Passing a Kimi answer through unread is worse than
not asking.
```

- [ ] **Step 2: Verify the skill parses**

Run:

```bash
python3 -c "
import sys
t = open('plugins/kimi-delegation/skills/delegating-to-kimi/SKILL.md').read()
assert t.startswith('---'), 'no frontmatter'
fm = t.split('---')[1]
assert 'name: delegating-to-kimi' in fm, 'name missing'
assert 'description:' in fm, 'description missing'
print('frontmatter ok,', len(fm), 'chars')
"
```

Expected: `frontmatter ok, <n> chars` with n under 1024.

- [ ] **Step 3: Commit**

```bash
git add plugins/kimi-delegation
git commit -m "feat(kimi): the delegating-to-kimi skill"
```

---

### Task 9: Wire it into the catalog

**Files:**
- Modify: `.claude-plugin/marketplace.json`
- Modify: `README.md`
- Modify: `docs/dev-guide.md`

- [ ] **Step 1: Add the plugin to the marketplace**

Run:

```bash
python3 - <<'PY'
import json
p = ".claude-plugin/marketplace.json"
m = json.load(open(p))
assert not any(x["name"] == "kimi-delegation" for x in m["plugins"]), "already present"
m["plugins"].append({
    "name": "kimi-delegation",
    "description": "Delegate work to Kimi from Claude Code: read-only review and bulk tasks through Kimi's own agents, or Claude Code itself running on Kimi's model. Requires a Kimi Code subscription and CLI >= 0.38.0",
    "version": "1.0.0",
    "source": "./plugins/kimi-delegation",
})
json.dump(m, open(p, "w"), indent=2)
open(p, "a").write("\n")
print("added")
PY
```

- [ ] **Step 2: Verify the marketplace still parses**

Run: `python3 -c "import json;d=json.load(open('.claude-plugin/marketplace.json'));print(len(d['plugins']),'plugins')"`
Expected: `6 plugins`

- [ ] **Step 3: Add the install line and table row to README.md**

Add to the install snippet:

```
/plugin install kimi-delegation@opcheese-skills
```

Add a table row matching the existing format:

```markdown
| `kimi-delegation` | Hand a task to Kimi — read-only review through its own agents, or Claude Code running on its model | Either spine |
```

Then add this section immediately before the existing "Why not just install mattpocock/skills too?" section:

```markdown
## Why kimi-delegation is a single plugin

The catalog splits a plugin in two when some of its skills need a person at
the keyboard — that is what `codebase-vocabulary-human` and the interactive-only
`shadow-learn-memory` are about. Delegation has no human gate on either path:
both run headless, and delegating is *more* valuable unattended, where sparing
Claude quota matters most. The split convention tracks human gates, not
caution, so it does not apply here.

It does carry a hard precondition the other plugins do not: a Kimi Code
subscription and CLI >= 0.38.0. Without those the skill refuses loudly rather
than degrading, so installing it on a machine without Kimi costs nothing but
the description tokens.
```

- [ ] **Step 4: Add the dev-guide entry**

In `docs/dev-guide.md`, add `kimi-delegation` to the once-per-machine install
block, then add this subsection under *What you just installed*:

```markdown
### kimi-delegation

Hands a task to Kimi instead of Claude.

| Command | What it does |
| --- | --- |
| `--via kimi` | Kimi's own agents. **Read-only by default** |
| `--via kimi --agent coder` | Lets Kimi write |
| `--via claude` | Claude Code on Kimi's model, with Claude Code's permissions |

Use it for a second opinion on a review or design, and for large mechanical
passes you would rather not spend Claude context on. Read what comes back —
a second model earns its keep by disagreeing, which is only worth something
if you judge the disagreement.

Needs `kimi login` and CLI >= 0.38.0 once per machine.
```

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/marketplace.json README.md docs/dev-guide.md
git commit -m "feat(kimi): publish kimi-delegation on the marketplace"
```

---

### Task 10: Live verification

Everything so far is hermetic. This task runs the real thing once, and settles
the one question the spec deferred to test.

**Files:**
- Create: `docs/verification/2026-08-24-kimi-delegation.md`
- Possibly modify: `plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-credential`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
for t in plugins/kimi-delegation/skills/delegating-to-kimi/tests/*.sh; do echo "== $t"; bash "$t" || exit 1; done
```

Expected: every file reports `0 failed`.

- [ ] **Step 2: Verify Path A read-only containment against the real CLI**

Run:

```bash
cd "$(mktemp -d)" && printf 'def add(a,b):\n    return a - b\n' > calc.py
"$OLDPWD/plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate" \
  --via kimi -- "Fix the bug in calc.py by editing it, and create WROTE.txt."
cat calc.py
ls WROTE.txt 2>&1
```

Expected: Kimi reports the bug but refuses to act; `calc.py` still contains
`a - b`; `WROTE.txt` does not exist. **If anything was written, stop — the
containment default is broken and nothing else in this plugin matters.**

- [ ] **Step 3: Determine the cheapest refresh command**

The spec requires finding the cheapest Kimi subcommand that rewrites the
credential file. Wait until the token is stale (its TTL is 900s), then:

```bash
stat -c '%y' ~/.kimi-code/credentials/kimi-code.json
kimi provider list >/dev/null 2>&1
stat -c '%y' ~/.kimi-code/credentials/kimi-code.json
```

If the mtime advanced and the new `expires_at` is in the future, replace the
body of `refresh_kimi_credentials()` in `kimi-credential` with
`"$KIMI_BIN" provider list >/dev/null 2>&1`. If it did not, leave `-p "ok"`
in place and record the finding. Re-run
`bash plugins/kimi-delegation/skills/delegating-to-kimi/tests/test-kimi-credential.sh` either way.

- [ ] **Step 4: Verify Path B end to end**

Run:

```bash
plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate \
  --via claude -- "Reply with exactly: PONG"
```

Expected: `PONG`. This exercises the full chain — settings JSON, apiKeyHelper,
token refresh, Kimi's Anthropic-compatible endpoint.

- [ ] **Step 5: Write the verification record**

Create `docs/verification/2026-08-24-kimi-delegation.md` recording, for each
step above: the command run, the actual output, and pass/fail. Follow the
format of `claude-shadow-learn/docs/verification/`. State plainly which
refresh command won in Step 3.

- [ ] **Step 6: Confirm no secrets leaked**

Run:

```bash
grep -rIn --exclude-dir=.git -E '[A-Za-z0-9._-]{60,}' plugins/kimi-delegation docs/verification/2026-08-24-kimi-delegation.md || echo "clean"
TOK=$(python3 -c "import json;print(json.load(open('$HOME/.kimi-code/credentials/kimi-code.json'))['access_token'])")
grep -rIn --exclude-dir=.git -F "$TOK" . && echo "!! TOKEN PRESENT !!" || echo "clean: no token in repo"
unset TOK
```

Expected: `clean` on both.

- [ ] **Step 7: Commit and push**

```bash
git add -A
git commit -m "test(kimi): live verification of both delegation paths"
git push origin main
```

---

## Manual verification guide

After Task 10, write `docs/kimi-delegation-verification.md` as a step-by-step
guide a dev can follow on their own machine: installing the plugin from the
marketplace, `kimi login`, confirming the version gate refuses on an old CLI,
confirming Path A cannot write, confirming Path B answers, and what each
failure message means. Cover the happy path, the two refusal paths, and the
missing-subscription case.
