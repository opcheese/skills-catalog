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

run_case() {
  local expect=$1 branch=$2 command=$3
  git -C "$REPO" checkout -q -B "$branch"
  local out status
  out=$(printf '%s' "$command" \
    | jq -R '{tool_input:{command:.}}' \
    | (cd "$REPO" && bash "$SCRIPT") 2>&1)
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
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
