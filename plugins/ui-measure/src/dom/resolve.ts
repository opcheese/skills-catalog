import type { DomTree, Proposal } from "../correspondence/types.js"
import type { OpenPage } from "./open.js"

type Resolution = { path: string } | { note: string }

/** Browsers recover from an unclosed bracket, parenthesis or quote at the end of a selector
 *  and match as if it were closed, so a typo would resolve to a real element. This is stricter:
 *  an unbalanced `[ ]` or `( )`, or a quote left open, is invalid. Brackets inside quotes and
 *  backslash-escaped characters do not count. */
function isUnbalanced(selector: string): boolean {
  const open: string[] = []
  let quote: string | null = null
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]
    if (c === "\\") {
      i++
    } else if (quote !== null) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === "[" || c === "(") {
      open.push(c === "[" ? "]" : ")")
    } else if (c === "]" || c === ")") {
      if (open.pop() !== c) return true
    }
  }
  return quote !== null || open.length > 0
}

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
export async function resolveProposal(
  p: OpenPage,
  dom: DomTree,
  proposal: Proposal,
): Promise<{ proposal: Proposal; notes: Record<string, string> }> {
  const known = new Set(dom.elements.map((e) => e.selector))
  const unknown = [...new Set(proposal.pairs.map((x) => x.selector).filter((s) => !known.has(s)))]
  const resolved = new Map<string, Resolution>()
  const wanted: string[] = []
  for (const sel of unknown) {
    if (isUnbalanced(sel)) resolved.set(sel, { note: "invalid selector" })
    else wanted.push(sel)
  }
  if (wanted.length > 0) {
    const results = (await p.page.evaluate(
      ({ rootSelector, selectors }) => {
        const root = document.querySelector(rootSelector)
        return selectors.map((sel) => {
          let matches: Element[]
          try {
            matches = Array.from(document.querySelectorAll(sel))
          } catch {
            return { note: "invalid selector" }
          }
          if (matches.length === 0) return { note: "no element" }
          const inside = matches.filter((el) => root !== null && (root === el || root.contains(el)))
          if (inside.length === 0) return { note: "no element inside root" }
          if (inside.length > 1) return { note: `ambiguous: ${inside.length} elements` }
          const steps: number[] = []
          let node: Element = inside[0]
          while (root !== null && node !== root && node.parentElement) {
            steps.unshift(Array.from(node.parentElement.children).indexOf(node) + 1)
            node = node.parentElement
          }
          return { path: rootSelector + steps.map((i) => ` > :nth-child(${i})`).join("") }
        })
      },
      { rootSelector: p.rootSelector, selectors: wanted },
    )) as Resolution[]
    wanted.forEach((sel, i) => resolved.set(sel, results[i]))
  }
  const notes: Record<string, string> = {}
  const pairs = proposal.pairs.map((pair) => {
    const r = resolved.get(pair.selector)
    if (r === undefined) return pair
    if ("path" in r) return { ...pair, selector: r.path, ...(r.path !== pair.selector ? { proposed: pair.selector } : {}) }
    notes[pair.selector] = r.note
    return pair
  })
  return { proposal: { ...proposal, pairs }, notes }
}
