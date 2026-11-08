---
status: draft — not approved, nothing built
last-verified: 2026-11-08
owner: Kirill (opcheese)
---

# ui-hill-climb — draft design

A plugin skill that improves an app's UI by screenshotting the real app, having a
panel of judges from different providers score the screenshots against reference
screens, fixing, and repeating until the bar is met or the round cap hits.

Source: Theo (t3.gg), "Agents Sucked At UI (Until Today)",
https://www.youtube.com/watch?v=xq0eB8vxeqk. Digest kept by the youtube-hub
session at `~/w/assistant/youtube/digests/2026-11-08-theo-ui-harness-review.md`.
Every number from that video is the speaker's own, unverified claim.

## Gates before any build

- **Owner approval** from Kirill, and from the Galatea owner for the parts Galatea consumes.
- **Image-input spike (ours).** Can the headless judges see a screenshot? Test
  `kimi -p` with `k3.1-pro`, and `credits-delegate` (claude -p reading a PNG).
  Both must describe a known screenshot correctly, and each must report the model
  ID it resolved to. If Kimi can't see images, the panel is Claude plus a local
  model only, and Limits says so.
- **Recall spike (Galatea's).** Score past UI MRs that got human design feedback,
  against a recall/noise bar set before the run. If the panel misses most of what
  designers flagged, don't build. Galatea sends its bar before the run.

## Shape

One skill. The panel is built in, not a separate "council" primitive; split it
out only when a second consumer, such as code review, actually needs it.
It lives in the skills-catalog marketplace, not in superpowers core, because it
is UI-specific.

## Two modes: human-piloted and agent-piloted

The same skill and the same output contract serve both modes. The modes differ only in
who steers between rounds and who signs off.

- **Human-piloted.** After each round the parent shows the score table and the
  before/after pairs, then asks through the harness's question tool (AskUserQuestion):
  continue, add a taste constraint, or stop. The human holds the taste veto and gives the
  final approval. The round cap still applies, but the human may extend it.
- **Agent-piloted.** Runs unattended within the round cap and the stop rule; no human
  input mid-run. Taste constraints come only from the constraints file written before the
  run. It ends by handing over `scores.md`, `changes.json` and `references.json` (in a PR,
  per the agents spine), and never merges. Galatea's developer seat uses this mode.

The mode is chosen from how the skill was started: a human in the session means
human-piloted; a headless or scheduled run means agent-piloted. Only the human-piloted
mode extends the round cap.

## Rules

- **References in every panel:** competitor screens, or the product's own best
  screens. The target is "beat the references in every category".
- **References as the drift control:** the unchanged references are rescored every
  round, and scores are read relative to them.
- **Hidden target:** the judges never see the target score; only the parent knows it.
- **Judges staged by cost:** iterate against the cheapest judge until it passes, then
  add the others.
- **Per-category scores:** hierarchy, typography, iconography, colour and
  contrast, consistency, and so on.
- **Human taste constraints:** these go in a constraints file that every judge reads.
- **Round cap:** 5 by default. Stop early when the gain over two consecutive
  rounds is under 0.3.
- **Repeated findings:** never raise the same finding twice. This is checked by change ID.

## Judges, in the user's spend order

1. Kimi `k3.1-pro` via kimi-delegation (flat fee).
2. Claude via api-credits-delegation.
3. Optional: a local multimodal Ollama model.

That gives two providers, not three; Limits states it. If a judge's resolved model
ID differs from the one requested, the run fails rather than scores: there is
no silent substitution. A mistyped Kimi ID falls back silently, which is why the
resolved ID is checked.

## Output contract (agreed with Galatea, 2026-11-08)

Per run:

- `references.json`: each reference screen's path and sha256, written once per
  run, so the drift figure is tied to a fixed set.

Per round:

- `changes.json`: one entry per change, with:
  - `id`, which stays the same across rounds;
  - `screen`;
  - the `before` and `after` image paths;
  - `after_size` as `{w, h}` in pixels;
  - `region` as `{x, y, w, h}` in after-image pixels;
  - `rationale`, one line;
  - `categories`.
- `scores.md`: a per-category table for each screen and each reference, with each
  score tagged with the judge's resolved model ID and provider, plus the
  reference drift and the round log.

The skill draws no arrows in v1. Consumers render annotations from `region`;
Galatea does this when it attaches the MR.

## Deferred / out of scope

- Drawn annotated images: the region boxes are enough for a renderer.
- Programmatic scoring (an eval-first climb, then trimming the prompt): a
  separate idea.
- Screenshot capture uses the existing agent-browser skill; no new tooling.

## Consumer: Galatea

Galatea uses this as a capability, not a seat. Its developer seat runs the skill
before filing an MR. Its reviewer reads the evidence and doesn't re-run it. A named
human holds the taste veto. Galatea adds its gate floor, MR evidence class,
per-MR budget and circuit breaker. See galatea
`docs/research/2026-11-08-agent-ui-and-review-at-scale.md`.
