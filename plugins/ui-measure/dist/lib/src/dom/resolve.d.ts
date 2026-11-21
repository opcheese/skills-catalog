import type { DomTree, Proposal } from "../correspondence/types.js";
import type { OpenPage } from "./open.js";
/** Rewrites the selectors of a recorded proposal to the walker paths the verifier knows.
 *
 *  A walker path (`#root > :nth-child(2)`) passes through unchanged. Any other selector
 *  (a test id, an aria-label, a class) is looked up in the live page, and is rewritten only
 *  when it names exactly one element inside the root. Everything else stays as written and
 *  gets a note saying why, which the verifier reports as the `resolvable` rejection.
 *
 *  Two selectors that resolve to the same element are both kept: the verifier's
 *  injective rule reports that.
 *
 *  No named functions inside `page.evaluate` (the `__name` trap, see tree.ts). */
export declare function resolveProposal(p: OpenPage, dom: DomTree, proposal: Proposal): Promise<{
    proposal: Proposal;
    notes: Record<string, string>;
}>;
