---
title: Spike — can the headless judges see a screenshot
status: done
last_verified: 2026-11-20
owner: Kirill (opcheese)
---

# Spike: can the headless judges see a screenshot

Gate from `docs/superpowers/specs/2026-11-08-ui-hill-climb-design.md`, *Gates before any build*.
Two judges, so two spikes run side by side with one fixture.

- **Question (per judge):** given only a PNG on disk, does the judge describe its unguessable text and colours correctly?
- **Time-box:** 1 hour for both.
- **What each answer changes:**
  - *sees it* → the judge sits on the panel.
  - *refuses / says it cannot see* → off the panel; Limits says so.
  - *describes something wrong (hallucinates)* → off the panel, and the run must check every judge with a known-image probe before scoring.
  - *could not find out* (auth, quota, tool refuses) → judge off the panel for v1, recorded as unknown.
- **Could falsify:** the two-provider panel. If Kimi can't see, the panel is Claude only, and the build gets a single-provider Limits line.
- **Control:** the fixture text (`Okapi Ledger`, `ZEBRA 42`, `Three green tickets`) can't be guessed, and the prompt doesn't name it. The judge runs in a directory holding only the PNG, not the HTML. Negative control: the same prompt on a blank white PNG must not return that text.
- **Ground truth:** header "Okapi Ledger", blue; button "ZEBRA 42", red; box "Three green tickets", green.

## Result, 2026-11-20

| Judge | Run | Positive (known.png) | Negative (blank) | Answer |
| --- | --- | --- | --- | --- |
| Kimi `kimi-code/k3.1-pro`, kimi-delegation 1.3.1's pinned read-only agent | `runs/kimi-pos`, `runs/kimi-neg` | CANNOT SEE IMAGE | CANNOT SEE IMAGE | refuses: that agent has only Read, Grep and Glob |
| Kimi `kimi-code/k3.1-pro`, read-only agent plus `ReadMediaFile` (`agents/judge-readonly.md`) | `runs/kimi-media-pos`, `runs/kimi-media-neg` | all three texts and colours right | "entirely white", no invented text | **sees it** |
| Claude sonnet via `credits-delegate` 1.1.0 | `runs/claude-pos`, `runs/claude-neg` | "Credit balance is too low", cost 0 | same | **could not find out**: the linked Console org has no credit balance |

- **Resolved model ID:** Kimi doesn't self-report it ("not provided in my runtime context"). The session log (`wire.jsonl`) records only the requested `model: k3.1-pro` on `llm.request`; no response model. So the served model stays unconfirmed, as kimi-delegate's `served=unconfirmed` already says. What can be checked is that the requested ID is on the plan's declared list, which kimi-delegate does before the run.
- **What changes:**
  - Kimi sits on the panel, but only with an agent that has `ReadMediaFile`. kimi-delegation's pinned agent can't be used as is.
  - The spec's "fail if the resolved ID differs" can't be implemented for Kimi. It becomes "fail if the requested ID isn't on the declared list", and Limits says the served model is unconfirmed.
  - The Claude judge is unknown until the Console org has credits. It must be re-run then.
