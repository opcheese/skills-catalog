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
export async function resolveProposal(p, dom, proposal) {
    const known = new Set(dom.elements.map((e) => e.selector));
    const wanted = [...new Set(proposal.pairs.map((x) => x.selector).filter((s) => !known.has(s)))];
    const resolved = new Map();
    if (wanted.length > 0) {
        const results = (await p.page.evaluate(({ rootSelector, selectors }) => {
            const root = document.querySelector(rootSelector);
            return selectors.map((sel) => {
                let matches;
                try {
                    matches = Array.from(document.querySelectorAll(sel));
                }
                catch {
                    return { note: "invalid selector" };
                }
                if (matches.length === 0)
                    return { note: "no element" };
                const inside = matches.filter((el) => root !== null && (root === el || root.contains(el)));
                if (inside.length === 0)
                    return { note: "no element inside root" };
                if (inside.length > 1)
                    return { note: `ambiguous: ${inside.length} elements` };
                const steps = [];
                let node = inside[0];
                while (root !== null && node !== root && node.parentElement) {
                    steps.unshift(Array.from(node.parentElement.children).indexOf(node) + 1);
                    node = node.parentElement;
                }
                return { path: rootSelector + steps.map((i) => ` > :nth-child(${i})`).join("") };
            });
        }, { rootSelector: p.rootSelector, selectors: wanted }));
        wanted.forEach((sel, i) => resolved.set(sel, results[i]));
    }
    const notes = {};
    const pairs = proposal.pairs.map((pair) => {
        const r = resolved.get(pair.selector);
        if (r === undefined)
            return pair;
        if ("path" in r)
            return { ...pair, selector: r.path };
        notes[pair.selector] = r.note;
        return pair;
    });
    return { proposal: { ...proposal, pairs }, notes };
}
