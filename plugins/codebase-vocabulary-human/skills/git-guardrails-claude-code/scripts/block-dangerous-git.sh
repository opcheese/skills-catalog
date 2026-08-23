#!/usr/bin/env bash
# PreToolUse hook: block destructive git commands before Claude runs them.
#
# Pushing is branch-aware. A push to a protected branch (main/master, or the
# remote's default) is blocked; a push of a feature branch is allowed, because
# opening a PR requires one. Force, mirror, all and delete pushes are always
# blocked regardless of target.
#
# Override the protected set with GIT_GUARDRAILS_PROTECTED_BRANCHES, a
# comma-separated list, e.g. "main,master,release".

set -uo pipefail

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$COMMAND" ] && exit 0

block() {
  printf 'BLOCKED: %s\n' "$1" >&2
  printf 'The user has prevented you from running this.\n' >&2
  exit 2
}

# --- always dangerous, regardless of branch ---------------------------------
declare -a ALWAYS=(
  'reset[[:space:]]+--hard|git reset --hard discards committed and staged work'
  'clean[[:space:]]+-[a-zA-Z]*f|git clean -f deletes untracked files permanently'
  'branch[[:space:]]+-D|git branch -D force-deletes a branch and its unmerged commits'
  'checkout[[:space:]]+\.|git checkout . discards every uncommitted change'
  'restore[[:space:]]+\.|git restore . discards every uncommitted change'
)
for entry in "${ALWAYS[@]}"; do
  pattern=${entry%%|*}
  reason=${entry#*|}
  if printf '%s' "$COMMAND" | grep -qE "git[^;|&]*${pattern}"; then
    block "$reason"
  fi
done

# --- branch-aware push ------------------------------------------------------
current_branch() { git rev-parse --abbrev-ref HEAD 2>/dev/null; }

protected_branches() {
  if [ -n "${GIT_GUARDRAILS_PROTECTED_BRANCHES:-}" ]; then
    printf '%s' "$GIT_GUARDRAILS_PROTECTED_BRANCHES" | tr ',' '\n' | sed '/^$/d'
    return
  fi
  printf 'main\nmaster\n'
  git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||'
}

is_protected() {
  local candidate=$1 p
  [ -z "$candidate" ] && return 1
  while IFS= read -r p; do
    [ "$candidate" = "$p" ] && return 0
  done < <(protected_branches)
  return 1
}

# Split on shell separators so each command is judged on its own.
while IFS= read -r segment; do
  # Is this segment a git push? Tolerate global options: git -C path push ...
  printf '%s' "$segment" | grep -qE '(^|[[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+push([[:space:]]|$)' || continue

  # Always-blocked push modes.
  if printf '%s' "$segment" | grep -qE '(^|[[:space:]])(--force|--force-with-lease([=[:space:]]|$)|-[a-zA-Z]*f([a-zA-Z]*)?([[:space:]]|$))'; then
    block "force-pushing rewrites history that other people may already have"
  fi
  for mode in --mirror --all --delete -d; do
    if printf '%s' "$segment" | grep -qE "(^|[[:space:]])${mode}([[:space:]]|$)"; then
      block "git push ${mode} can remove or overwrite refs on the remote"
    fi
  done

  # Collect the refspecs: non-flag words after "push", minus the remote.
  refspecs=()
  seen_push=0
  seen_remote=0
  read -ra words <<<"$segment"
  for word in "${words[@]}"; do
    if [ "$seen_push" -eq 0 ]; then
      [ "$word" = "push" ] && seen_push=1
      continue
    fi
    case "$word" in
      -*) continue ;;
    esac
    if [ "$seen_remote" -eq 0 ]; then
      seen_remote=1
      continue
    fi
    refspecs+=("$word")
  done

  if [ ${#refspecs[@]} -eq 0 ]; then
    # Bare push: git sends the current branch.
    target=$(current_branch)
    if is_protected "$target"; then
      block "a bare 'git push' from '$target' pushes to the protected branch '$target'"
    fi
    continue
  fi

  for spec in "${refspecs[@]}"; do
    if printf '%s' "$spec" | grep -q '^+'; then
      block "a refspec beginning with '+' is a force push"
    fi
    dst=${spec##*:}                 # src:dst -> dst; bare ref -> itself
    dst=${dst#refs/heads/}
    if [ "$dst" = "HEAD" ]; then
      dst=$(current_branch)
    fi
    case "$dst" in
      *'$'*|*'`'*|*'*'*)
        # Target cannot be resolved here. Fall back to where HEAD is:
        # pushing from a protected branch is the case worth stopping.
        target=$(current_branch)
        if is_protected "$target"; then
          block "unresolved push target while HEAD is on the protected branch '$target'"
        fi
        continue
        ;;
    esac
    if is_protected "$dst"; then
      block "'$dst' is a protected branch; open a pull request instead of pushing to it"
    fi
  done
done < <(printf '%s\n' "$COMMAND" | sed -E 's/(\|\||&&|[;|&])/\n/g')

exit 0
