# Manual Verification: kimi-delegation

Verifies that Claude Code can hand work to Kimi on both paths, that Path A cannot
write to your working tree, and that the failure messages tell you what to fix.
Every step is copy-paste runnable. Results from the 2026-08-24 run are at the bottom.

Following the shadow-learn precedent, this single document is both the guide a dev
runs on their own machine and the record of what happened here.

## Before you start

You need a Kimi Code subscription and CLI >= 0.38.0:

```bash
kimi --version
kimi login   # only if the next step complains
```

`kimi upgrade` misdetects native Linux installs as Windows and refuses. Upgrade with:

```bash
curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash
```

## The automated suite

Hermetic — fake `kimi` and `claude` on `PATH`, fixture credential files, no network
and no subscription needed. Run this on any checkout:

```bash
cd /path/to/skills-catalog
for t in plugins/kimi-delegation/skills/delegating-to-kimi/tests/*.sh; do
  echo "== $t"; bash "$t" || break
done
```

Expected: `13 passed`, `17 passed`, `4 passed`, all with `0 failed`.

## Path A cannot write — the check that matters most

This is the load-bearing safety property. An unqualified `kimi -p` edits a working
tree with no approval gate; the plugin contains it by defaulting to Kimi's read-only
`explore` agent. Verify that on your own machine:

```bash
SB=$(mktemp -d)
printf 'def add(a,b):\n    return a - b\n' > "$SB/calc.py"
sha256sum "$SB/calc.py" > "$SB/before.sha"

plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate \
  --via kimi --cwd "$SB" -- "Fix the bug in calc.py by editing it, and create WROTE.txt."

sha256sum -c "$SB/before.sha"
ls "$SB/WROTE.txt" 2>&1
```

Expected: Kimi identifies the `a - b` bug and reports it, but declines to act.
`sha256sum -c` prints `OK`, and `WROTE.txt` does not exist.

**If either file changed, stop.** The containment default is broken and nothing else
in this plugin matters. Check that `--agent explore` is still the default in
`kimi-delegate` and that the CLI is 0.38.0 or newer.

To let Kimi write, you must name an agent that can:

```bash
kimi-delegate --via kimi --agent coder -- "Apply the rename across the repo."
```

## Path B answers

Runs Claude Code itself on Kimi's model, through the `apiKeyHelper`:

```bash
plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate \
  --via claude -- "Reply with exactly: PONG"
```

Expected: `PONG`.

Two informational lines from the `claude` CLI appear on stderr and are harmless: a
notice that claude.ai connectors are disabled because another auth source is set, and
`[claude-code:unrecognized_model]` because Kimi's model names are not Anthropic's. The
script deliberately does not swallow stderr — hiding these would hide real errors too.

To prove it really routed to Kimi rather than falling back to Anthropic, ask for a
model only Kimi serves. Anthropic's API would reject the name outright:

```bash
KIMI_DELEGATE_MODEL=kimi-for-coding \
  plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate \
  --via claude -- "Reply with exactly: ROUTED"
```

Expected: `ROUTED`.

## The refusals

Three things the plugin refuses. Each should print a message naming the fix, and
none should reach the CLI.

```bash
# Nesting a delegation inside a delegation
KIMI_DELEGATE_DEPTH=1 plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate \
  --via kimi -- "x"

# Bypassing permission checks
plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-delegate \
  --via kimi --dangerously-skip-permissions -- "x"
```

Expected: `already in progress (depth 1); refusing to nest`, and
`refusing --dangerously-skip-permissions`.

The third is the version gate, which needs a CLI older than 0.38.0. The hermetic
suite covers it with a fake `kimi` reporting `0.18.0`; the real message names the
install-script upgrade path because `kimi upgrade` does not work on Linux.

## No subscription

With no credentials the helper fails closed and names the fix:

```bash
KIMI_CODE_HOME=$(mktemp -d) plugins/kimi-delegation/skills/delegating-to-kimi/scripts/kimi-credential
```

Expected on stderr: `no usable credential at ... Run: kimi login`, exit 1, nothing on
stdout. Claude Code treats any stderr from an `apiKeyHelper` as an error, which is
exactly the behaviour wanted here — a broken credential must not look like success.

## Results — 2026-08-24

Kimi CLI 0.38.0, Claude Code on Linux, subscription auth via `managed:kimi-code`.

| Step | Result |
| --- | --- |
| Automated suite | Pass — `13`, `17`, `4`, all `0 failed` |
| Path A cannot write | **Pass** — `calc.py: OK`, no `WROTE.txt`, exit 0 |
| Path A still does the work | Pass — reported `add(a, b)` returns `a - b`, proposed the one-line fix |
| Path B answers | Pass — `PONG` |
| Path B really routes to Kimi | Pass — `kimi-for-coding` answered `ROUTED`; identity prompt replied "powered by the k3 model" |
| Recursion refused | Pass — covered in suite, `already in progress` |
| `--dangerously-skip-permissions` refused | Pass — covered in suite |
| Version gate | Pass — covered in suite against a fake `0.18.0` |
| No secrets in the repo | Pass — see below |

Path A's own words, verbatim: *"I'm a read-only exploration subagent — I don't have
editing tools."* It then reported the bug and left both files alone.

### Which refresh command won

The spec deferred one question to implementation: whether some Kimi subcommand cheaper
than a prompt rewrites the credential file. Tested against a real credential file with
`expires_at` forced into the past, in an isolated `KIMI_CODE_HOME`:

| Command | Refreshed the file? |
| --- | --- |
| `kimi provider list` | **No** — exit 0, `expires_at` unchanged, token unchanged |
| `kimi -p "ok"` | **Yes** — `expires_at` moved to now + 889s |

`provider list` reads local configuration and never contacts the API, so it cannot
stand in for a refresh. `kimi-credential` keeps `-p "ok"`, and the script now records
this finding in a comment so the question is not reopened.

Note that a stale token costs one extra round trip, not a failure: Claude Code caches
the helper for 5 minutes and re-invokes it on HTTP 401, and the Kimi token lives 900s,
so the cache sits comfortably inside the TTL.

### Secret hygiene

No token, PAT, or key appears anywhere in this repo. Verified three ways: a
high-entropy scan over the plugin and this document, and a literal `grep -F` for the
live access and refresh tokens across the whole working tree. The temporary credential
copies used for the refresh test lived in `mktemp -d` directories and were removed by
their `trap`.
