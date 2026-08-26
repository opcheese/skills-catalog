---
title: A worked example — the spine and the vocabulary together
status: current
last_verified: 2026-08-26
audience: developers
---

# A worked example

The spine and the vocabulary answer different questions, so in practice they
interleave rather than take turns. This is one task from request to merged PR,
with a note at each point where the vocabulary skills change what happens.

The task: **we bill through Stripe, and now we need to invoice enterprise
customers instead.**

It is deliberately ordinary. The interesting part is not the feature — it is
that the spine will happily produce a working, tested, reviewed version of
this that you will regret in three months, and the vocabulary is what stops
that.

## Brainstorming — where the seam goes

You say "we need invoice billing alongside Stripe." `brainstorming` fires on
its own and starts asking about constraints and approaches. Somewhere in there
it asks you to break the work into units with clear interfaces.

That question is exactly where `codebase-design` earns its place, because the
spine poses it without supplying any way to answer it. The vocabulary turns a
vague "should this be its own module?" into three specific checks:

- **One adapter is a hypothetical seam; two adapters is a real one.** Before
  today, `StripeBilling` was the only implementation, so there was nothing to
  vary across and no reason to introduce a seam. Now there are two. The seam
  became real this morning — which is precisely why this is the moment to
  introduce it and not before.
- **The deletion test.** The design proposes a `BillingProviderFactory`.
  Imagine deleting it. Does complexity vanish, or reappear across callers? If
  every call site just wants "bill this customer", the factory is a
  pass-through and the call sites should not be choosing a provider at all.
  Cut it.
- **Depth.** `charge(customer, amount)` is a small interface with a lot behind
  it. `buildLineItems()`, `applyTax()`, `renderInvoice()`, `send()` is a large
  interface with a little behind each — shallow, and it forces every caller to
  learn the invoice flow in order to bill anyone.

Ask for it by name if it does not fire on its own — "use codebase-design here."
Skill selection is a judgment the model makes, not a guarantee.

**What comes out:** a `Billing` interface with `charge()` on it, two adapters
behind it, and no factory.

## Domain modeling — when a word turns out to mean three things

Partway through, "payment" stops behaving. Stripe *authorizes* then *captures*;
an invoice is *issued* and *settled* weeks later. Three concepts wearing one
word, and code that treats them as one will be wrong in a way tests do not
catch.

`domain-modeling` fires on that argument. It challenges the term, and — the
part people skip — writes the result into `CONTEXT.md` so the next session
starts from the settled meaning instead of relitigating it.

The seam shape also meets its three-part ADR test: hard to reverse (every
caller depends on it), surprising without context (why *isn't* there a
factory?), and a real trade-off (you gave up per-provider capabilities at the
interface). Three out of three, so it gets an ADR.

This is the skill with a real cost. In a repo that will not keep a `CONTEXT.md`
it produces a file nobody reads. Skip it there; it is why it lives in a
separate plugin.

## Writing plans and TDD — the seam decides the test

`writing-plans` lays out files and tasks. The vocabulary keeps the names stable
across a document long enough for drift: what was called an adapter in task 2
is still an adapter in task 9.

Then TDD, where the two skills genuinely combine into something neither says
alone. `test-driven-development` is emphatic that the failing test comes first
and silent on *what to write the test against*. `codebase-design` answers that
in one line: **the interface is the test surface.**

So the test goes through `charge()`, with a fake adapter passed in. It does not
reach past the interface into Stripe's client, because a test that has to do
that is telling you the module is the wrong shape — and now you know that
before you have written the implementation rather than after.

The fake is not test scaffolding, either. It is a third adapter at the same
seam, which is the cheapest evidence you will get that the seam is in a
sensible place.

Order that actually works:

```
agree the seam  →  write the failing test through it  →  implement
```

The middle step is the spine's. The first is the vocabulary's. Getting them
backwards is how you end up with tests that pin the wrong shape in place.

## Implementation — the conflict

You rebase onto `main` and hit a conflict in the billing module, because
somebody else touched retry handling while you were working.

`resolving-merge-conflicts` fires. What it is worth is mostly what it forbids:
do not invent behaviour that was in neither branch, and never `--abort`. Read
both intents first — commit messages, the PR, the issue — resolve preserving
both where possible, then run the project's own checks, because a merge that
compiles is not a merge that works.

A hundred and seventeen words that mainly stop an agent from doing something
confident and wrong at the one moment it is least recoverable.

## Finishing — the guardrails

The spine ends the branch: review, then a PR.

If you ran `/codebase-vocabulary-human:git-guardrails-claude-code` in this
repo, the hook is what makes
that safe to leave running. It blocks a push to `main` by any route — including
a bare `git push` while you happen to be standing on it — and allows the
feature-branch push that opening a PR requires.

Note the shape of that division. The guard is mechanical and absolute; the
review is procedural and uses judgment. Guardrails are for the class of mistake
where judgment arrives too late.

## What you would have got without the vocabulary

Same spine, same discipline, all tests passing:

- A `BillingProviderFactory` every call site has to know about, because nobody
  ran the deletion test on it.
- Tests reaching past the interface into the Stripe client, pinning the
  implementation in place, so the module is now expensive to reshape.
- "Payment" meaning three things, and a bug in six months where an issued
  invoice is treated as a captured charge.
- A rebase conflict resolved by inventing a third retry policy.

None of that is a process failure. The spine did its job. Those are structure
and vocabulary failures, which is a different layer and needs different skills.

## The short version

| The spine asks | The vocabulary answers |
|---|---|
| "What are the units and their interfaces?" | depth, seam, adapter — and the deletion test |
| "Write the failing test first" | write it through the interface; the interface is the test surface |
| "Agree the terms" | glossary in `CONTEXT.md`, ADR if it passes the three-part test |
| "Resolve the conflict and move on" | read both intents, invent nothing, never `--abort` |
| "Open the PR" | a hook that makes the destructive version unavailable |

Neither half is sufficient. The spine without the vocabulary produces correct
code with a shape you will pay for. The vocabulary without the spine is a
glossary nobody opens.
