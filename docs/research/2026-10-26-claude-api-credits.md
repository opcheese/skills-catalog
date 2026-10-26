---
status: draft
last_verified: 2026-10-26
owner: opcheese
---

# Claude API credits on Max and Team plans

Raw pages, with response headers, are in `sources/2026-10-26-claude-api-credits/` (all fetched 2026-10-26, HTTP 200):

- platform.claude.com/docs/en/about-claude/api-credits-for-subscribers.md
- support.claude.com/en/articles/17154008 (text extract beside it)
- support.claude.com/en/articles/9876003
- anthropic.com/legal/credit-terms (Supplemental Credit Terms)
- privacy.claude.com/en/articles/7996868 (training on commercial products)
- code.claude.com/docs/en/authentication.md and llm-gateway.md

## What the plan gives

- **Amount per month:** Max 5x $100, Max 20x $200, and Team up to $500 pooled. Unused credit expires at the end of each billing cycle, with no rollover.
- **Claiming:** link a Claude Console organization on claude.ai under Settings > Billing > API credits. You need 7 days on the plan first. No card is needed.
- **The link is one-to-one, and only support can change it.** Credits can't be transferred, and they're lost if the Console account closes.
- **What they cover:** the Messages and Batches APIs, Managed Agents, the Agent SDK, the Playground, and `claude -p` when it runs on an API key from the linked organization.
- **What they don't cover:**
  - interactive Claude Code;
  - `-p` runs started by the GitHub Action, an IDE extension or the desktop app;
  - `claude -p` while signed in with the plan, which draws on plan limits instead;
  - Bedrock, Vertex and Foundry.
- **When the credit runs out:** requests stop with "Your credit balance is too low", unless the organization has bought credits or turned on auto-reload. Usage is never charged to the Claude plan.
- **Rate-limit tier:** at least Start, or Build if the monthly credit is over $200. The credits don't count toward moving to a higher tier.

## Consequences of creating the Console organization

- **Terms:** it's a separate, commercial account. The Supplemental Credit Terms form part of the commercial agreement. By default, API inputs and outputs aren't used for training (privacy article 7996868). The consumer Max account keeps its own setting.
- **Billing risk:** the only path to a charge is adding a card or turning on auto-reload yourself.
- **Shared balance:** every key in the organization draws on the same balance. Use per-workspace spend limits to cap a project.
- **The environment variable trap:** an `ANTHROPIC_API_KEY` exported in the shell outranks the subscription login.
  - In `-p`, Claude Code uses the key whenever it is present.
  - Interactively, Claude Code asks once and remembers the answer.
  - If a credit-only organization's key ends up in an interactive session, it fails with "Credit balance too low". If the organization has bought credits, the session bills them.
  - So set the key only in the child process.

## Fit with the kimi-delegation pattern

Path B of kimi-delegation already runs `claude -p` with a credential the plugin chooses. An Anthropic-credits path would be the same shape: `claude -p` with the linked organization's key, set only in the child process.

Open questions, to be settled by spikes before any design:

- **Billing class of a child `claude -p`:** a `claude -p` started from inside an interactive Claude Code session may inherit variables such as `CLAUDE_CODE_ENTRYPOINT`. Would that make it count as Claude Code usage, which the credits don't cover? Does `--bare` change that?
- **Leaking into parent sessions:** where can the key be stored so that no interactive session picks it up? A file read by a key helper, never an exported variable.
- **Seeing the spend:** how does a run's cost show up? The `-p` JSON output reports cost, and the Console has the Cost page.

## The terms you accept by linking

- **The Supplemental Credit Terms add three things.** The text was read in full; it is effective 2024-03-04 and saved as `credit-terms.txt`.
  - The credits are non-refundable.
  - They are non-transferable: only the account holder may use them.
  - They are lost if the account closes.
  - The auto-reload clause matters only if you turn it on.
  - The terms' default one-year expiry for promotional credits is replaced by the per-cycle expiry stated at issue.
- **The credit terms attach to the Commercial Terms, effective 2025-06-17** (saved as `commercial-terms.txt`). The points that matter:
  - **Business use only, and no training:** "Services under these Terms are not for consumer use", and "Anthropic may not train models on Customer Content."
  - **Use restrictions (D.4):** the Usage Policy, the Supported Regions Policy, and no use to build a competing product or train competing models.
  - **Customer duties:** cooperate with identity and use verification requests. Indemnify Anthropic against third-party claims arising from your Inputs or from use that breaks the Usage Policy.
  - **Anthropic's IP indemnity covers "paid use" only.** Whether usage paid with promotional credits counts is not stated.
  - **Suspension:** Anthropic can suspend for a Usage Policy breach or a region problem. It can terminate on 30 days' notice, and the terms can change on 30 days' notice.
