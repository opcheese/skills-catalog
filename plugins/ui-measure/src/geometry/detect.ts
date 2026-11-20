import type { OpenPage } from "../dom/open"
import type { Finding } from "../report/types"

export interface GeometryConfig {
  /** A text box nearer than this to its container's padding edge is flush. CSS px, not scaled. */
  insetPx: number
  /** Selectors of elements that must never scroll (a scrollbar there is a defect). */
  nonScrolling: string[]
}

type Raw = { selector: string; kind: string; text?: string; expected?: string; actual?: string; deltaPx?: number }

/** Layout defects that need no design to judge: text cut off, collapsed, off the page, jammed
 *  against its container's edge, or a scrollbar where none belongs. Detectors run in the page,
 *  scoped to the subtree under the root, and skip elements that are not drawn. Returns only
 *  failures; a clean page yields [].
 *
 *  Same `__name` trap as src/dom/tree.ts: the code inside `page.evaluate` declares no functions.
 *  An element has "text" when it owns a non-whitespace text node. One element yields at most one
 *  finding (the first defect found, in the order zero-size, clipped, off-canvas, flush-edge). */
export async function detectGeometry(p: OpenPage, cfg: GeometryConfig): Promise<Finding[]> {
  const raw = (await p.page.evaluate(
    ({ rootSelector, insetPx, nonScrolling, scale }) => {
      const first = document.querySelector(rootSelector)
      if (!first) throw new Error(`root ${rootSelector} not found`)
      const htmlStyle = getComputedStyle(document.documentElement)
      const TOL = 2 * scale // the geometry tolerance floor (2 design px), in CSS px
      const out: Raw[] = []
      const drawn = new Map<Element, string>()
      const stack: { el: Element; selector: string }[] = [{ el: first, selector: rootSelector }]
      while (stack.length > 0) {
        const item = stack.pop()
        if (!item) break
        const el = item.el
        const style = getComputedStyle(el)
        const isRoot = el === first
        // display:none and zero opacity hide the whole subtree; visibility:hidden only this element.
        if (!isRoot && (style.display === "none" || style.opacity === "0")) continue
        const kids = Array.from(el.children)
        for (let i = kids.length - 1; i >= 0; i--) {
          stack.push({ el: kids[i], selector: `${item.selector} > :nth-child(${i + 1})` })
        }
        if (!isRoot && style.visibility === "hidden") continue
        if (style.display === "contents") continue
        drawn.set(el, item.selector)

        const ownNodes: Text[] = []
        let own = ""
        for (const child of Array.from(el.childNodes)) {
          if (child.nodeType === 3) {
            ownNodes.push(child as Text)
            own += child.nodeValue ?? ""
          }
        }
        own = own.trim()
        if (!own) continue
        const rect = el.getBoundingClientRect()
        const base = { selector: item.selector, text: own.slice(0, 80) }

        // zero-size
        if (rect.width === 0 || rect.height === 0) {
          out.push({
            ...base,
            kind: "zero-size",
            expected: "non-zero box",
            actual: `${rect.width}x${rect.height}px`,
            deltaPx: 0,
          })
          continue
        }

        // clipped: the element itself cuts its own text off, or an ancestor that clips (overflow
        // other than visible, not scrollable) ends before the element does. An ellipsis is a
        // deliberate truncation, so ellipsis-truncated text is intentionally not reported.
        let clipped: Raw | null = null
        let n: Element | null = el
        while (n && n !== document.body && n !== document.documentElement) {
          const ns = getComputedStyle(n)
          const clipX = ns.overflowX === "hidden" || ns.overflowX === "clip"
          const clipY = ns.overflowY === "hidden" || ns.overflowY === "clip"
          if ((clipX || clipY) && ns.textOverflow !== "ellipsis") {
            if (n === el) {
              const overX = clipX ? el.scrollWidth - el.clientWidth : 0
              const overY = clipY ? el.scrollHeight - el.clientHeight : 0
              const over = Math.max(overX, overY)
              if (over > TOL) {
                clipped = { ...base, kind: "clipped", expected: "all text inside its own box", actual: `${over}px cut off`, deltaPx: over }
              }
            } else {
              const r = n.getBoundingClientRect()
              const left = r.left + n.clientLeft
              const top = r.top + n.clientTop
              const right = left + n.clientWidth
              const bottom = top + n.clientHeight
              const overX = clipX ? Math.max(left - rect.left, rect.right - right) : 0
              const overY = clipY ? Math.max(top - rect.top, rect.bottom - bottom) : 0
              const over = Math.max(overX, overY)
              if (over > TOL) {
                clipped = { ...base, kind: "clipped", expected: "inside the clipping ancestor", actual: `${Math.round(over * 10) / 10}px past it`, deltaPx: over }
              }
            }
            if (clipped) break
          }
          n = n.parentElement
        }
        if (clipped) {
          out.push(clipped)
          continue
        }

        // off-canvas, in document coordinates (rect plus scroll offset, so a step that scrolled the
        // page does not matter). Left and top: anything at a negative coordinate is unreachable.
        // Right: always the viewport width, because horizontal page scroll is itself a defect.
        // Bottom: the viewport height when the document cannot scroll vertically (html or body
        // clips it, or nothing overflows); otherwise scrolling reaches it and it is not off-canvas.
        // Exempt only inside a real scroll container (overflow auto/scroll with content to scroll);
        // a clipping ancestor is not an exemption, and `clipped` has already had its say.
        let scrolls = false
        for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
          const as = getComputedStyle(a)
          const sx = (as.overflowX === "auto" || as.overflowX === "scroll") && a.scrollWidth > a.clientWidth
          const sy = (as.overflowY === "auto" || as.overflowY === "scroll") && a.scrollHeight > a.clientHeight
          if (sx || sy) {
            scrolls = true
            break
          }
        }
        if (!scrolls) {
          const de = document.documentElement
          const bodyStyle = getComputedStyle(document.body)
          const clipsY = [htmlStyle.overflowY, bodyStyle.overflowY].some((v) => v === "hidden" || v === "clip")
          const bottomChecked = clipsY || de.scrollHeight <= de.clientHeight
          const docBottom = rect.bottom + window.scrollY
          const past = Math.max(
            -(rect.left + window.scrollX),
            -(rect.top + window.scrollY),
            rect.right + window.scrollX - de.clientWidth,
            bottomChecked ? docBottom - de.clientHeight : 0,
          )
          if (past > TOL) {
            out.push({
              ...base,
              kind: "off-canvas",
              expected: "inside the viewport",
              actual: `${Math.round(past * 10) / 10}px outside`,
              deltaPx: past,
            })
            continue
          }
        }

        // flush-edge: the glyph runs (own text only) against the padding edge of the nearest
        // bordered or backgrounded container, the element itself included. html and body are
        // not containers: the page edge is the off-canvas check's business. A text box that is
        // outside the container (negative distance) is overflow, not flushness.
        let box: Element | null = el
        while (box && box !== document.body && box !== document.documentElement) {
          const bs = getComputedStyle(box)
          const bordered =
            parseFloat(bs.borderTopWidth) > 0 ||
            parseFloat(bs.borderRightWidth) > 0 ||
            parseFloat(bs.borderBottomWidth) > 0 ||
            parseFloat(bs.borderLeftWidth) > 0
          const bg = bs.backgroundColor
          const filled = bg !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(bg) && bg !== "rgba(0, 0, 0, 0)"
          if (bordered || filled || bs.backgroundImage !== "none") break
          box = box.parentElement
        }
        if (box && box !== document.body && box !== document.documentElement) {
          let l = Infinity
          let t = Infinity
          let r = -Infinity
          let b = -Infinity
          for (const node of ownNodes) {
            if (!node.nodeValue || !node.nodeValue.trim()) continue
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const q of Array.from(range.getClientRects())) {
              if (q.width === 0 || q.height === 0) continue
              l = Math.min(l, q.left)
              t = Math.min(t, q.top)
              r = Math.max(r, q.right)
              b = Math.max(b, q.bottom)
            }
          }
          if (l !== Infinity) {
            const br = box.getBoundingClientRect()
            const pl = br.left + box.clientLeft
            const pt = br.top + box.clientTop
            const sides: [string, number][] = [
              ["left", l - pl],
              ["top", t - pt],
              ["right", pl + box.clientWidth - r],
              ["bottom", pt + box.clientHeight - b],
            ]
            let worst: [string, number] | null = null
            for (const s of sides) {
              if (s[1] >= 0 && s[1] < insetPx && (worst === null || s[1] < worst[1])) worst = s
            }
            if (worst) {
              out.push({
                ...base,
                kind: "flush-edge",
                expected: `at least ${insetPx}px from the container edge`,
                actual: `${worst[0]} ${Math.round(worst[1] * 10) / 10}px`,
                deltaPx: Math.round((insetPx - worst[1]) * 10) / 10,
              })
            }
          }
        }
      }

      // scrollbar: only elements the caller says must never scroll, and only those that are drawn.
      for (const sel of nonScrolling) {
        const hits = Array.from(document.querySelectorAll(sel))
        for (const el of hits) {
          const selector = drawn.get(el)
          if (selector === undefined) continue
          const overY = el.scrollHeight - el.clientHeight
          const overX = el.scrollWidth - el.clientWidth
          if (overY > 0 || overX > 0) {
            out.push({
              selector,
              kind: "scrollbar",
              expected: "content fits without scrolling",
              actual: `${overX > 0 ? `${overX}px wider` : ""}${overX > 0 && overY > 0 ? ", " : ""}${overY > 0 ? `${overY}px taller` : ""} than the box`,
              deltaPx: Math.max(overX, overY),
            })
          }
        }
      }
      return out
    },
    { rootSelector: p.rootSelector, insetPx: cfg.insetPx, nonScrolling: cfg.nonScrolling, scale: p.scale },
  )) as Raw[]
  return raw.map((r) => ({
    check: "geometry" as const,
    kind: r.kind,
    status: "fail" as const,
    target: { selector: r.selector, ...(r.text ? { text: r.text } : {}) },
    ...(r.expected ? { expected: r.expected } : {}),
    ...(r.actual ? { actual: r.actual } : {}),
    ...(r.deltaPx !== undefined ? { deltaPx: r.deltaPx } : {}),
  }))
}
