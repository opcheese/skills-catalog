#!/usr/bin/env bash
# Tests for block-dangerous-git.sh
#
# Every case runs the hook in a throwaway git repo so branch detection is real.
# ALLOW = exit 0, BLOCK = exit 2.

set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/block-dangerous-git.sh"
PASS=0
FAIL=0

REPO=$(mktemp -d)
trap 'rm -rf "$REPO"' EXIT
git -C "$REPO" init -q -b main
git -C "$REPO" config user.email t@t.t
git -C "$REPO" config user.name t
git -C "$REPO" commit -q --allow-empty -m init

# A PATH with everything but jq, the usual state of Git Bash on Windows. The
# hook must still block there; the inputs are built with jq out here, before.
# Only the tools the hook calls, so a jq.exe or a "Program Files" PATH entry
# cannot leak in, and nothing gets copied where symlinks are copies.
NOJQ_BIN="$REPO.nojq"
mkdir -p "$NOJQ_BIN"
trap 'rm -rf "$REPO" "$NOJQ_BIN"' EXIT
for tool in bash cat git grep sed tr; do
  ln -s "$(command -v "$tool")" "$NOJQ_BIN/$tool"
done
HOOK_PATH=$PATH

run_case() {
  local expect=$1 branch=$2 command=$3
  git -C "$REPO" checkout -q -B "$branch"
  local out status
  out=$(printf '%s' "$command" \
    | jq -R -s '{tool_input:{command:.}}' \
    | (cd "$REPO" && PATH="$HOOK_PATH" bash "$SCRIPT") 2>&1)
  status=$?
  local actual="ALLOW"
  [ "$status" -eq 2 ] && actual="BLOCK"
  if [ "$actual" = "$expect" ]; then
    PASS=$((PASS + 1))
    printf '  [ok]   %-6s on %-8s  %s\n' "$expect" "$branch" "$command"
  else
    FAIL=$((FAIL + 1))
    printf '  [FAIL] expected %s, got %s (exit %d) on %-8s  %s\n' \
      "$expect" "$actual" "$status" "$branch" "$command"
    [ -n "$out" ] && printf '         %s\n' "$out"
  fi
}

run_raw() {
  local expect=$1 branch=$2 json=$3
  git -C "$REPO" checkout -q -B "$branch"
  local status
  printf '%s' "$json" | (cd "$REPO" && PATH="$HOOK_PATH" bash "$SCRIPT") >/dev/null 2>&1
  status=$?
  local actual="ALLOW"
  [ "$status" -eq 2 ] && actual="BLOCK"
  if [ "$actual" = "$expect" ]; then
    PASS=$((PASS + 1)); printf '  [ok]   %-6s raw  %.70s\n' "$expect" "$json"
  else
    FAIL=$((FAIL + 1)); printf '  [FAIL] expected %s, got %s (exit %d)  %s\n' "$expect" "$actual" "$status" "$json"
  fi
}

all_cases() {
echo "The always-blocked set:"
run_case BLOCK feature "git reset --hard HEAD~1"
run_case BLOCK feature "git clean -fd"
run_case BLOCK feature "git clean -f"
run_case BLOCK feature "git branch -D old-thing"
run_case BLOCK feature "git checkout ."
run_case BLOCK feature "git restore ."

echo
echo "Pushing a feature branch must work — the always-PR spine depends on it:"
run_case ALLOW feature "git push -u origin feature"
run_case ALLOW feature "git push origin feature"
run_case ALLOW feature "git push"
run_case ALLOW feature "git push origin"
run_case ALLOW feature "git push origin HEAD:refs/heads/new-branch"
run_case ALLOW feature "git -C /some/path push -u origin feature"
run_case ALLOW feature "git push --set-upstream origin feature"
run_case ALLOW feature "git add -A && git commit -m wip && git push -u origin feature"

echo
echo "Pushing to a protected branch must not:"
run_case BLOCK feature "git push origin main"
run_case BLOCK feature "git push origin master"
run_case BLOCK feature "git push origin feature:main"
run_case BLOCK feature "git push origin HEAD:refs/heads/main"
run_case BLOCK main    "git push"
run_case BLOCK main    "git push origin"
run_case BLOCK main    "git push origin HEAD"

echo
echo "Destructive push modes, regardless of target:"
run_case BLOCK feature "git push --force origin feature"
run_case BLOCK feature "git push -f origin feature"
run_case BLOCK feature "git push --force-with-lease origin feature"
run_case BLOCK feature "git push origin +feature"
run_case BLOCK feature "git push --mirror origin"
run_case BLOCK feature "git push --all origin"
run_case BLOCK feature "git push --delete origin feature"

echo
echo "Unresolved targets fall back to where HEAD is:"
run_case ALLOW feature 'git push -u origin "$BRANCH"'
run_case BLOCK main    'git push -u origin "$BRANCH"'

echo
echo "Things that must not trip the guard:"
run_case ALLOW feature "git status"
run_case ALLOW feature "git log --oneline"
run_case ALLOW feature "git commit -m 'clean up the restore path'"
run_case ALLOW feature "echo 'git push origin main is banned' >> README.md"

echo
echo "Inputs a JSON encoder may produce, given as raw JSON:"
run_raw BLOCK feature '{"tool_input":{"command":"git push origin m\u0061in"}}'
run_raw BLOCK feature '{"tool_input":{"command":"git push origin main","extra":{"command":"ls"}}}'
run_raw ALLOW feature '{"tool_input":{"command":"ls","extra":{"command":"git push origin main"}}}'

echo
echo "A long command is judged before the hook would time out:"
BIG=$(printf 'x%.0s' $(seq 1 60000))
SECONDS=0
run_case BLOCK feature "cat > f <<'EOF'
$BIG
EOF
git reset --hard"
if [ "$SECONDS" -le 5 ]; then
  PASS=$((PASS + 1)); printf '  [ok]   judged in %ss\n' "$SECONDS"
else
  FAIL=$((FAIL + 1)); printf '  [FAIL] took %ss; a hook that times out lets the command run\n' "$SECONDS"
fi

echo
echo "Quotes, backslashes and newlines survive the JSON:"
run_case BLOCK feature 'git commit -m "say \"hi\"" && git push origin main'
run_case BLOCK feature $'git status\ngit push origin main'
run_case ALLOW feature 'git commit -m "a \\ b" && git push origin feature'
}

echo "== with jq"
all_cases
echo
echo "== without jq"
HOOK_PATH=$NOJQ_BIN
all_cases

echo
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
