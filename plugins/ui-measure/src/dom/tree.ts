import type { DomElement, DomTree } from "../correspondence/types"
import type { OpenPage } from "./open"

/** Walk the live DOM under the page's root element.
 *
 *  NOTE the `__name` trap: `tsx` compiles with esbuild's keepNames, which
 *  rewrites named functions into `__name(fn, "...")` — a helper that does not
 *  exist inside the page, so a named function declared in `page.evaluate`
 *  throws `ReferenceError: __name is not defined`. The walk below is therefore
 *  an explicit stack with no declared functions of any kind.
 *
 *  Elements hidden by `display`, `visibility` or zero opacity are left out: a box that is
 *  not drawn is not something to compare. The root is always kept. */
export async function domTree(p: OpenPage): Promise<DomTree> {
  const elements = (await p.page.evaluate((rootSelector) => {
    const first = document.querySelector(rootSelector)
    if (!first) throw new Error(`root ${rootSelector} not found`)
    const out: {
      selector: string
      tag: string
      testid?: string
      text?: string
      ink?: { x: number; y: number; width: number; height: number }
      box: { x: number; y: number; width: number; height: number }
    }[] = []
    const stack: { el: Element; selector: string }[] = [{ el: first, selector: rootSelector }]
    while (stack.length > 0) {
      const item = stack.pop()
      if (!item) break
      const style = getComputedStyle(item.el)
      const isRoot = item.el === first
      // display:none and zero opacity hide the whole subtree. visibility:hidden hides only this
      // element: a descendant may set visibility:visible again, and its own style says so.
      if (!isRoot && (style.display === "none" || style.opacity === "0")) continue
      const hidden = !isRoot && style.visibility === "hidden"
      const kids = Array.from(item.el.children)
      if (!hidden) {
        const rect = item.el.getBoundingClientRect()
        let own = ""
        for (const child of Array.from(item.el.childNodes)) {
          if (child.nodeType === 3) own += child.nodeValue ?? ""
        }
        own = own.trim()
        const testid = item.el.getAttribute("data-testid")
        let ink: { x: number; y: number; width: number; height: number } | null = null
        if (item.el.children.length === 0 && own) {
          const range = document.createRange()
          range.selectNodeContents(item.el)
          const r = range.getBoundingClientRect()
          // Strictly smaller only. A range that reports the element's own box
          // carries no information, and one that reports something LARGER is
          // a measurement we do not understand, so neither is recorded.
          if (r.width > 0 && r.height > 0 && r.width <= rect.width + 0.5) {
            ink = { x: r.x, y: r.y, width: r.width, height: r.height }
          }
        }
        if (ink === null && item.el instanceof SVGGraphicsElement) {
          // getBBox is in user units. Scale by the ratio the element's own
          // rect bears to its viewBox extent, which is what the two rects
          // below give without having to parse the viewBox at all.
          const b = item.el.getBBox()
          const own2 = item.el.getBoundingClientRect()
          if (b.width > 0 && b.height > 0 && own2.width > 0) {
            const root = item.el.ownerSVGElement ?? item.el
            const rootRect = root.getBoundingClientRect()
            const vb = (root as SVGSVGElement).viewBox?.baseVal
            const k = vb && vb.width > 0 ? rootRect.width / vb.width : 1
            ink = {
              x: rootRect.x + (b.x - (vb?.x ?? 0)) * k,
              y: rootRect.y + (b.y - (vb?.y ?? 0)) * k,
              width: b.width * k,
              height: b.height * k,
            }
          }
        }
        out.push({
          selector: item.selector,
          tag: item.el.tagName.toLowerCase(),
          ...(testid ? { testid } : {}),
          ...(own ? { text: own } : {}),
          ...(ink ? { ink } : {}),
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        })
      }
      // Pushed in reverse so the stack pops them left to right: the emitted
      // list is preorder, matching the design side.
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({ el: kids[i], selector: `${item.selector} > :nth-child(${i + 1})` })
      }
    }
    return out
  }, p.rootSelector)) as DomElement[]
  return { root: elements[0], elements }
}
