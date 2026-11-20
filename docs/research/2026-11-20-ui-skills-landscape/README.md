---
title: UI design-quality skills and screenshot-critic loops, landscape as of 2026-11-20
status: draft
last_verified: 2026-11-20
owner: Kirill (opcheese)
---

# UI design-quality skills and screenshot-critic loops

Purpose: before building the hill-climb skill described in `docs/superpowers/specs/2026-11-08-ui-hill-climb-design.md`, record what exists, what changed recently, how people react, and whether critic loops measurably help.

Conventions. Every claim carries a source URL. "Archived" means the page or API response is saved under `sources/` (slug given in brackets; each has a `.card.json` with URL, fetch date, HTTP status, sha256; `sources/fetch-log.tsv` lists every fetch including failures). "Anecdote" means a single unverified account. Star counts and push dates are from the GitHub API on 2026-11-20 unless stated.

Not saved, by rule: no video transcripts or summaries. The Theo video is cited only as: "Agents Sucked At UI (Until Today)", https://www.youtube.com/watch?v=xq0eB8vxeqk. A third-party summary page of it surfaced in search; it was not fetched or saved, and anything attributed to it below is a search-snippet paraphrase, marked unverified.

Note on the local marketplace clone: `~/.claude/plugins/marketplaces/claude-plugins-official` is not a git repo (it is a snapshot with a `.gcs-sha` file), so `git log` was impossible. History below comes from the GitHub commits API instead. The local `SKILL.md` is byte-identical to upstream `main` as of today [sources/fd-skill-raw].

## Anthropic's frontend-design skill

### What it is now

- Repo `anthropics/claude-plugins-official`: 47.8k stars, pushed today, 1,320 open issues [repo-meta]. The plugin is `plugins/frontend-design`, local plugin.json version 1.1.1.
- The skill is prompt-only guidance. It has no loop and no tooling. The only critic step is one sentence: "Critique your own work as you build, taking screenshots to review if your environment supports it" [fd-skill-raw].
- Current structure: a "design lead at a studio" persona; "ground in the subject"; design principles (hero, typography, motion, copy); a named-defaults calibration list (cream #F4F1EA + serif + terracotta; near-black + acid accent; broadsheet hairlines; the SaaS card kit; template chrome such as ALL-CAPS eyebrows and "→" suffixes); a two-pass plan-then-review-then-build process; a "restraint and self-critique" section ("spend your boldness in one place", the Chanel remove-one-accessory line); a writing/UX-copy section [fd-skill-raw].

### History (GitHub commits API for `plugins/frontend-design`) [fd-commits, fd-commit-*]

| Date | Commit | What changed |
|---|---|---|
| 2025-11-20 | 4ca561f | Initial scaffolding of the plugin repo |
| 2025-12-02 / 12-13 | 22d3def, 19a119f | Merge and author-metadata edits |
| 2026-02-20 | aecd4c8 | Apache 2.0 LICENSE files added |
| 2026-06-15 | d029127 (#2540) | Big rewrite (SKILL.md +39/-26). Old: "pick an extreme... BOLD aesthetic direction, NEVER use Inter/Roboto, don't hold back", a list of axes to push. New: persona prompt, subject grounding, named AI-default looks with hex codes, two-pass plan/review process, restraint and self-critique, a copy-writing section. |
| 2026-09-01 | 44490cc | Second rewrite (+36/-20). Adds: typography "tells" to avoid (single accented word in a headline, ALL-CAPS labels, unnecessary labels), the fourth and fifth calibration traits (SaaS-card kit, template chrome), tighter motion guidance, "the brief's own words always win". Commit message says it was done "to address" an internal slop-measure; internal link not followed. |
| 2026-10-26 | 30202c7 | Plugin gets an explicit version (previously versionless, which made every repo commit count as an update) |

A DEV post dates the June rewrite as "June 18, commit 423563cf" in another repo copy; the dates differ from the official repo's 2026-06-15 by three days. Treat the exact date as copy-specific [dev-fd-rewrite]. The post's reading, that the rewrite moved from "bold on every axis" to "bold in one place", matches the diff. It is one blogger's interpretation, not a statement from Anthropic.

Before-state (Nov 2025 to June 2026): the skill told the model to "pick an extreme" from a list that included "retro-futuristic", used caps ("CRITICAL", "NEVER", "UNFORGETTABLE"), and said "NEVER converge on common choices (Space Grotesk, for example)" [issue-cpo-6404, fd-commit-d029127].

### Community reaction

Positive or neutral:
- Anthropic's own blog frames the skill as the fix for "AI slop" defaults [anthropic-blog-fd, https://claude.com/blog/improving-frontend-design-through-skills].
- HN, June 2026: users say you "have to use Opus and the frontend-design skill for decent results"; another reports a screenshot-compare loop they had Claude build for a personal app gave an "excellent" design (anecdote) [hn-48504912, https://news.ycombinator.com/item?id=48504912].
- A blogger found it pushed Claude toward distinctive typography on a themed shop; noted no design system and independent generations [https://paddo.dev/blog/claude-code-plugins-frontend-design/, saved as paddo-fd].

Critical:
- HN, Aug 2026: "placebo at best... still generates very cliched AI UIs with little originality, despite the skill spending a lot of time coaching the model to avoid that" [hn-49330250, https://news.ycombinator.com/item?id=49330250]. In the June thread: "defeats its own purpose" and "I don't think Anthropic or anyone else is doing evals on these skills" [hn-48504912].
- GitHub issue, anthropics/claude-plugins-official #6404 (2026-10-09, open): caps register ("CRITICAL", "NEVER", "UNFORGETTABLE") over-steers current models toward novelty for its own sake; keep the concrete avoid-list, drop the register [issue-cpo-6404, https://github.com/anthropics/claude-plugins-official/issues/6404]. Note: that issue quotes line numbers from the older version; the June and September rewrites changed the register.
- Issue #6299 (2026-09-24, open): the typeface line says "avoid defaults" without naming them, so the model swaps one default for another; and the plan-then-gate script over-plans on current models [issue-cpo-6299].
- anthropics/skills issue #1808 (2026-09-23, open): a small eval (7 briefs with no direction, 3 runs each, graded by computed style in Playwright) found pill-shaped buttons on 10 of 21 pages [issue-skills-1808; scripts in a gist, saved as fcsouza-gist]. This is a measured, if small, check, and it is a deterministic grader, not a model judge.
- anthropics/claude-code PR #39043 (2026-03-25, open, 33 comments): Theo (t3dotgg) proposed removing "retro-futuristic" from the tone list; the thread is mostly "LGTM" meme comments, plus one "this ruins designs sometimes" [pr-cc-39043]. It signals the old tone list produced a recognizable look; it is not evidence on its own.
- Opus 5.5 prompting guide, "Frontend design defaults": with no direction the model falls back on a few default styles; "avoid a generic AI look" mostly swaps one default for another; name the specific patterns to avoid; "work iteratively: check which styles the first result used and extend the list" [anthropic-opus55-prompting, https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5]. This is Anthropic's own admission that a negative-list loop is the maintained method.
- HN "Tells of a Slop UI" (2026-09-27, 386 points): one commenter says all modern multimodal models can do vision well enough for web design except negative space and padding/margins, and that the problem is underspecified prompts [hn-49867038, https://news.ycombinator.com/item?id=49867038].
- Open PR queue against the skill shows demand for accessibility (#164, claude-code PR #22027), existing design systems (skills #1561, #1663), DESIGN.md support (skills #1008) [gh-issues-fd-* JSON]. Not one is merged.
- No Reddit data: the search tool refuses reddit.com, so Reddit reaction is unknown. X/Twitter was not searched. HN and GitHub only.

### Evidence that it works

- No published before/after human study of this skill was found. Anthropic's blog states its aim, not a measured effect [anthropic-blog-fd]. A Tessl registry page shows a 94% "evals" score for it [tessl-fd-evals, https://tessl.io/registry/skills/github/anthropics/claude-plugins-official/frontend-design/evals]; that is a vendor's skill-following score, not design quality.
- The closest evidence is Anthropic's own harness article below: criteria wording alone beat a no-prompt baseline "even on the first iteration".

## Projects with a screenshot, critic, fix loop

Activity from the GitHub API on 2026-11-20 [repo-*.json, impeccable-repo, etc.].

| Project | Maintainer | Stars / last push | What it does | Notes |
|---|---|---|---|---|
| Impeccable, https://github.com/pbakaus/impeccable | Paul Bakaus | 113.8k / today | 24 commands (bolder, quieter, polish, critique, audit, live variants), PRODUCT.md and DESIGN.md context files, 62 deterministic slop-detector rules (no LLM), Chrome overlay, CI/SARIF output, hook that runs the detector on every edited UI file. Apache-2.0. Created 2025-11-16. [impeccable-readme] | The big one. `critique` is the closest thing to our judge: two isolated sub-agents (design review, and detector/browser evidence) that "must not see each other's output", a persisted snapshot per target, and a "degraded run" banner if it falls back to one context [impeccable-critique]. No multi-provider panel, no reference screens, no round cap. Reported results are its own before/after images in the README (single model, single brief). Tessl auto-review scores one sub-skill 41% on quality (registry heuristic, not users) [web search snippet, https://tessl.io/registry/skills/github/pbakaus/impeccable/critique/quality; not saved]. Complaints: not found in this pass (no Reddit/HN threads surfaced); the live-mode doc warns of sandbox-off agent launches. |
| Anthropic generator/evaluator frontend harness (article, not a repo), https://www.anthropic.com/engineering/harness-design-long-running-apps | Anthropic Labs (Prithvi Rajasekaran), 2026-03-24 | n/a | Generator plus evaluator agents, four criteria (design quality, originality, craft, functionality), evaluator uses Playwright MCP, 5 to 15 iterations, few-shot calibrated scores. [anthropic-harness-design] | Best primary source on the pattern. Details in the next section. |
| design-review agent, https://github.com/OneRedOak/claude-code-workflows | OneRedOak | 3.9k / 2026-10-09 | One Sonnet subagent with Playwright tools; phased PR design review (live environment first, responsive, accessibility). [oneredoak-agent, oneredoak-repo] | A single-judge review, no scoring loop or references. Maintained but slow. |
| visual-qa in oh-my-openagent, https://github.com/code-yeongyu/oh-my-openagent | code-yeongyu | 71.0k / today | "Dual-oracle" visual QA: script evidence plus two parallel read-only oracle passes, per-item PASS/FAIL, fresh-captures rule, reference-packet hygiene, capture validation before reviewers see an image. [omo-visual-qa] | Good rules to copy (stale-evidence ban, validate the image before dispatch, treat reference text as untrusted). The repo is general-purpose and huge; the skill is a small part of it. |
| ui-preview-loop in portable-agent-skills, https://github.com/Ludenox-GIT/portable-agent-skills | Ludenox-GIT | 0 stars / created and last pushed 2026-07-27 | Screenshot, delta-list critique, fix only listed deltas, hard cap of 2 to 3 iterations ("more loops = diminishing returns and drift"), then a fresh-eyes judge that sees only screenshots, never code. [ui-preview-loop] | Small and new (0 stars). Useful as design ideas only; no measurements. |
| tasteful-design, https://github.com/spsk-dev/tasteful-design | spsk-dev | 0 stars / 2026-03-31 | 7 specialist critics plus a "boss" synthesizer giving a weighted SHIP/BLOCK verdict; optional Gemini CLI for a second model on colour and layout. [tasteful-readme] | Effectively dead/new (0 stars, one month of activity, no issues). The "tier 1 Gemini, tier 2 Claude-only" fallback is the same idea as our "two providers" limit. |
| AgentVision, https://github.com/amitpatole/agent-vision | amitpatole | 11 stars / 2026-10-24 | Render, perceive, report, fix, re-render; findings grounded in DOM geometry, computed-style contrast, OCR boxes; a vision LLM is advisory. [agent-vision-readme] | Small. The grounding idea (deterministic facts before model opinion) is worth stealing. |
| sweetlink visual-iterative agent, npm `@ytspar/sweetlink` | ytspar | repo meta not found | Haiku-driven 10+ iteration loop; claims about 1000 tokens per screenshot versus 5000 for Playwright (author's claim). [sweetlink-agent] | Unverified token claim. |
| ui-design-review, https://github.com/MadAppGang/claude-code | MadAppGang | 290 / 2026-03-15 | Gemini multimodal review prompt templates, routed via a claudish CLI (OpenRouter fallback). [madappgang-ui-review] | Closest to "judge from another provider", but a prompt template, not a loop. Quiet since March. |
| Vercel web-design-guidelines, https://github.com/vercel-labs/agent-skills | Vercel | 34.6k / 2026-11-12 | Checklist-style review of code against Web Interface Guidelines (fetches the guideline text). [webdesign-guidelines] | Code-reading lint, no screenshots. |
| UI UX Pro Max, https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | nextlevelbuilder | 152k / 2026-11-19 | "Design intelligence" knowledge base (styles, palettes, type pairings) for generation. | Generation knowledge, not a critic loop. Popularity is high; I did not evaluate quality. Metadata only [repo-nextlevelbuilder-ui-ux-pro-max-skill]. |
| DESIGN.md spec, https://github.com/google-labs-code/design.md | Google Labs | 29.0k / 2026-11-18 | A format for describing a visual identity to coding agents. | A candidate for how to store taste constraints (metadata only). |
| Browser tooling: Playwright MCP (39.9k stars), Chrome DevTools MCP (58.5k) | Microsoft, Google/Chrome | active today | The screenshot capture layer most loops sit on. | Both active [repo-*.json]. |
| T3 Code, https://github.com/pingdotgg/t3code | Theo / Ping | 67.2k / today | The app Theo's video improves. No public "UI hill-climb harness" repo was found; the only public traces are PRs saying "hill climb", for example #25876, an iOS behaviour eval baseline (25 cases, graded from exact app state, "not pixels", 3 samples with majority vote) [pr-t3code-25876, https://github.com/pingdotgg/t3code/pull/25876] | Unverified paraphrase of the video from a search snippet only: a panel of cross-provider reviewers scored screenshots each round until at least 9 out of 10, first reviews around 6 out of 10, then a 9.5 bar per category, roughly 17.6 agent-hours and about $400 (Theo's own estimate). None of that is confirmed by a primary source here. |

Search found no GitHub project that combines several vendors as screenshot judges with reference screens and a drift control. The nearest are tasteful-design (Claude plus optional Gemini) and MadAppGang (Gemini review templates). I did not find a "UI council" product. A "hill-climb" scorecard-and-judge-panel article exists (levelup.gitconnected.com, "Hill-Climb Until It's True"), but the fetch returned 403 and the author and relation to Theo are unconfirmed [fetch-log.tsv].

## Do critic loops actually help

### Measured evidence

- Anthropic Labs (2026-03-24): separating the generator from a tuned evaluator is "a strong lever"; evaluator calibrated with few-shot score breakdowns "to reduce score drift across iterations"; 5 to 15 iterations; scores generally improved but "not always cleanly linear", and the author sometimes preferred a middle iteration over the last; first-iteration output was already better than a no-prompt baseline, so part of the gain is from the criteria wording, not the loop. Criteria phrasing ("museum quality") pulled outputs toward a visual convergence. Cost: full multi-agent harness 6 hours and $200 versus a solo run 20 minutes and $9 (this figure is for the full-stack harness, not the design-only loop) [anthropic-harness-design]. No numbers for design-only gain; the report is the author's own qualitative judgement.
- WebGen-Agent (arXiv 2509.22644): screenshot feedback from a VLM plus GUI testing, with backtracking and best-step selection, raised Claude-3.5-Sonnet from 26.4% to 51.9% accuracy and appearance score from 3.0 to 3.9 on their benchmark; the appearance score is itself VLM-assigned [arxiv-webgen-agent]. Search-result reading of its ablation: screenshots alone moved appearance about 3.0 to 3.6.
- Vision-guided iterative refinement (Amazon and Bristol, arXiv 2604.05839, ICLR 2026 workshop): a VLM critic gives up to 17.8% gain over three cycles on WebDev Arena prompts; gains are diminishing and token cost roughly triples (for Haiku 4.5: +3.6, +5.2, +5.7 points over cycles 1, 2, 3 while tokens rise from about 38k to about 125k). The judge used for scoring is validated against human preference at about 70% agreement for the multi-dimensional judge, with a single-score judge doing much worse (43% fewer agreements, more ties) [arxiv-vision-guided]. Note the evaluator is an LLM, not humans.
- ReLook (arXiv 2510.11498): a screenshot critic improves a trained web coder; reports "behavioral collapse", where a revision after good feedback is worse, and fixes it by accepting only strictly improving revisions ("Forced Optimization"); a zero-reward rule for invalid renders deters reward hacking; the training critic and the offline evaluator are different models to limit overfitting to the judge [arxiv-relook-html].
- ReDeck (arXiv 2609.00194, slides): render feedback mainly improved layout scores and slightly lowered the design score versus the initial generation, per a search-result reading; not confirmed in the paper text here [arxiv-redeck; second-hand].
- GameUIAgent (arXiv 2603.14724): a "quality ceiling effect": improvement from VLM reflection is bounded by headroom (r = -0.96), and partial rendering fixes can degrade the VLM's own evaluation [arxiv-gameuiagent].

Net: critic loops raise judge-scored quality, mostly in the first one to three rounds, with diminishing returns and rising cost. No source found shows a blind human-preference win for a multi-round critic loop versus a single well-prompted pass on real apps. Gains are measured by the same family of VLM judges that drive the loop.

### Judge reliability

- MLLM as a UI Judge (arXiv 2510.08783): GPT-4o, Claude and Llama approximate human UI preferences on some dimensions and diverge on others; moderate correlation with humans; human and model scores skew high on professional UIs [arxiv-mllm-ui-judge-html]. The abstract's claim is that they work for early narrowing, not final verdicts.
- UICrit and UI-Bench (arXiv 2407.08850, 2508.20410): expert-critique and designer-pairwise datasets show LLM critics not yet matching human evaluators [search-result summary of UICrit; UI-Bench saved as arxiv-ui-bench, a pairwise TrueSkill benchmark with 4,000+ expert judgments across 10 tools].
- "LLM-as-a-Judge Is Not an Oracle" (arXiv 2609.02246): catalogues eleven failure modes in production optimisation loops (judge bias, metric failures, wrong ground truth, reward hacking), including agents scoring 100% by reading cached answer keys while true capability was 68%; recommends a deterministic gate the judge cannot override [arxiv-judge-not-oracle].
- Anthropic: agents "reliably skew positive" when grading their own design; evaluator still lenient towards LLM output; tuning a standalone evaluator is easier than making the generator self-critical [anthropic-harness-design].

### Failure modes seen in sources

- Judge leniency and self-preference: [anthropic-harness-design, tasteful-readme "AI models are terrible self-critics"].
- Drift across iterations: mitigated by few-shot calibration [anthropic-harness-design]; ui-preview-loop uses a hard 2 to 3 round cap [ui-preview-loop].
- Non-monotonic trajectories: last round not always best [anthropic-harness-design, arxiv-relook-html].
- Reward hacking and gaming the grader: [arxiv-judge-not-oracle, arxiv-relook-html].
- Sameness: criteria wording and defaults converge ("museum quality" in the Anthropic article; named default looks in the skill; "swaps one default for another" in the Opus 5.5 guide) [anthropic-harness-design, anthropic-opus55-prompting].
- Cost and burn: 3x tokens for three cycles [arxiv-vision-guided]; $200 for a 6-hour harness [anthropic-harness-design]; the video's $400 is unverified.
- Complexity creep: implementation complexity grew each round under evaluator feedback [anthropic-harness-design].

### How others pick judge models

No source gives a measured model-selection method. What is reported:
- Anthropic: same family for generator and evaluator, but separate agent, tuned skeptical, few-shot [anthropic-harness-design].
- ReLook: train with one critic, evaluate with a different model [arxiv-relook-html].
- tasteful-design and MadAppGang: Gemini as the second model for colour and layout/vision [tasteful-readme, madappgang-ui-review].
- oh-my-openagent visual-qa: two parallel oracle passes plus script evidence [omo-visual-qa].
- Impeccable: one LLM review plus a deterministic detector, run in isolated contexts [impeccable-critique].
- HN claim (anecdote): all current multimodal models are adequate at design vision except negative space and padding [hn-49867038].

## Reuse versus build

- Capture: reuse. Playwright MCP and Chrome DevTools MCP are active and huge; our own draft already says to reuse the agent-browser skill.
- Deterministic first pass: reuse Impeccable's detector (`npx impeccable detect <url>`, Apache-2.0, 62 rules, no LLM, SARIF and JSON output). It covers contrast, overflow, tiny text, and the known "AI tells" without model cost [impeccable-readme]. This beats anything we would write.
- Single-reviewer critique with isolation: Impeccable `critique` and oh-my-openagent `visual-qa` already do two-pass review; we would only add the cross-provider panel and references.
- Taste constraints file: DESIGN.md (Google Labs spec) and Impeccable's PRODUCT.md and DESIGN.md are existing formats we could read instead of inventing a constraints file.
- Not available elsewhere, so ours to build: reference screens rescored each round as a drift control; hidden target score; staged judge cost; per-category scoring with a repeated-finding check by change ID; the `references.json` / `changes.json` / `scores.md` contract that Galatea consumes. I found no other project with any of these.

## Implications for our draft

Keep:
- Separate judge from fixer, with judges seeing only screenshots (not code). Supported by Anthropic's article, ui-preview-loop, and Impeccable's isolation rule.
- Per-category scoring against fixed criteria rather than one overall number. The only quantified comparison found (arXiv 2604.05839) shows a multi-dimensional judge agreeing far better with humans than a single score.
- Unchanged references rescored each round as the drift control. Nobody else does this; the closest is few-shot calibration in Anthropic's article. Keep it, and treat it as our novel part to validate in the spike.
- Resolved-model-ID check and fail-on-substitution. Fits the "judge is not an oracle" lesson (silent fallbacks produced a wrongly promoted winner there).
- Hard round cap and early stop on gain under 0.3. Supported by diminishing returns (+3.6, +5.2, +5.7 over three cycles at triple the tokens) and by ui-preview-loop's cap of 2 to 3.
- Human taste veto and human-piloted mode. Evidence says judges are only "early narrowing" quality.

Change:
- Add a keep-best rule: the output is the best-scoring round, not the last, and a round that scores lower than its predecessor is reverted (ReLook's Forced Optimization; Anthropic saw middle iterations preferred). The draft says "fix, repeat" with no revert.
- Add a deterministic pre-pass before any model judge (Impeccable detector plus DOM facts such as contrast and overflow), and make it a gate the judges cannot override. Cheaper than the cheapest judge and not gameable by prose.
- Lower the default round cap from 5 to 3 for the first release, and raise it only if the spike shows gains past round 3. The two independent sources say most gain arrives in rounds 1 to 3.
- Add a negative-pattern list (named defaults to avoid) to the fixer's context and to the judges' "originality" category, and extend it from observed outputs, as the Opus 5.5 guide recommends. Do not use caps or "museum quality" style wording in criteria; the Anthropic article shows criteria wording steers the look.
- Add a sameness check: compare the final screens to the previous run or to the default-look list, since a loop that converges on the judges' taste will produce a house style.
- Treat the first judge pass as unbiased only if the judges did not write the code: never let a judge from the same provider as the fixer be the sole stopper. With only Kimi and Claude, note in Limits that Claude is both fixer and judge on one side.
- Add a reward-hacking guard: screenshots must come from a fresh capture after the last edit (stale-evidence rule from visual-qa), verify the image is valid before sending it to a judge, and require the fixer's diff to be shown to the human or gate, so a fix that only tweaks what the judge looks at is visible.
- Expect small effect sizes and noise: run each judge at least twice per screen on the baseline to estimate score variance before trusting a 0.3 delta threshold. No source gives judge variance for UI scores.

Drop or defer:
- Hidden target as a core rule: no source tests it; keep it only as a cheap, low-risk instruction. Don't spend spike budget on it.
- Local multimodal Ollama judge: the draft already marks it optional; there is no evidence on small local VLMs as design judges. Leave for later.
- Building our own capture, constraints format, or slop detector.

Reuse:
- `npx impeccable detect` for the deterministic pass; its `critique` flow as the model for isolated assessments; oh-my-openagent visual-qa rules on fresh evidence and reference-packet hygiene; DESIGN.md as the constraints-file format; agent-browser or Playwright MCP for capture.

Gate suggestions (new):
- A baseline experiment before trusting the loop: score the same 5 to 10 screens twice with each judge (variance), once with and once without a fix round, and have the named human blind-rank before and after. That is the missing evidence in the literature; the design's recall spike covers only the "does the judge notice" half.
- Check that whichever provider actually scores the screens gives higher scores to the human-preferred version of known pairs (the UI-Bench and WebDev Arena style agreement test). Without this the "target score" is not anchored to anything.

Open questions we could not answer here:
- Reddit and X reactions (reddit.com is blocked for the search tool; X not searched).
- What Theo's harness actually does, beyond a secondhand snippet; the video itself was not viewed.
- Whether Impeccable's critique has a measured effect; only vendor before/after images found.
- Kimi k3.1-pro or Claude image input from headless modes: answered by our own spike, `docs/research/2026-11-20-ui-hill-climb-image-spike/card.md` (Kimi sees with `ReadMediaFile`; Claude untested, credits empty).

## File map

- `progress.md`: milestone log.
- `scripts/save.sh`, `scripts/gh-save.sh`, `scripts/hn-save.sh`, `scripts/repo-meta.sh`: fetch-and-save helpers.
- `sources/`: cards (`*.card.json`: URL, date, HTTP status, sha256) and `fetch-log.tsv` (all fetches, incl. failures). This repository is public, so the raw copies (`*.raw`), clean text (`*.txt`) and API JSON stay local, in the gitignored `.superpowers/ui-skills-landscape-sources/`, verifiable against the cards' checksums.
