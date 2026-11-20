// The spec comparison: accepted pairs against what Figma says, in CSS pixels.
//
// Everything runs on a mapping the verifier already accepted. A pair that could not be checked is
// never a pass: it is `not_comparable` with a reason. Nothing here asks a model for a quantity.
//
// UNITS. Design values are multiplied by `scale` (CSS px per design px) and compared with what the
// page renders. The tolerance floor is 2 design px (Figma draws a stroke inside the box, CSS draws a
// border outside the content), so 2 * scale CSS px. Font size and line height use a tighter 0.5 * scale:
// a 2px floor on a font size would let 14px pass for 16px, and nothing in text rendering needs it.
//
// SPACING. A gap is the distance along the layout axis between two consecutive design siblings that
// are both paired. Padding is the distance from the container's edge to its first and last paired
// child, plus the cross-axis start. The START sides are checked against the node's declared padding;
// the END side is checked against the distance the DESIGN itself measures, because a fixed-height
// frame's declared bottom padding is not where its last child ends, and comparing against it would
// fail a page that matches the design exactly. Spacing is measured from boxes, not read from CSS,
// so a spacing change that resizes its container is still reported as spacing.
import { normalise } from "../correspondence/verify"
import type {
  Box,
  DesignNode,
  DesignTree,
  DomElement,
  DomTree,
  PairVerdict,
  Verification,
} from "../correspondence/types"
import type { Finding, Report } from "../report/types"
import { tokenFor, type Token, type TokenProperty } from "../tokens"

/** Figma stroke vs CSS border: the smallest difference worth reporting, in design px. */
export const TOLERANCE_FLOOR_PX = 2
/** Font size and line height: sub-pixel rounding only, in design px. */
const TEXT_TOLERANCE_PX = 0.5
const COLOUR_CHANNEL_TOLERANCE = 1
const COLOUR_ALPHA_TOLERANCE = 0.01

type Rgba = [number, number, number, number]

const GRAPHIC_TYPES = new Set(["VECTOR", "ELLIPSE", "LINE", "STAR", "BOOLEAN_OPERATION"])

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places
const px = (n: number) => `${round(n)}px`
const dims = (w: number, h: number) => `${round(w)}x${round(h)}px`

function parseColour(input: string): Rgba | undefined {
  const s = input.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(s)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("")
    if (h.length !== 6 && h.length !== 8) return undefined
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(s)
  if (!fn) return undefined
  const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return undefined
  return [parts[0], parts[1], parts[2], parts[3] ?? 1]
}

/** `#rrggbb` when opaque, `rgba(r, g, b, a)` otherwise: the same text the design side prints. */
function formatColour(c: Rgba): string {
  const a = round(c[3], 3)
  if (a >= 1) return `#${c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`
  return `rgba(${c.slice(0, 3).map(Math.round).join(", ")}, ${a})`
}

const sameColour = (a: Rgba, b: Rgba) =>
  [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= COLOUR_CHANNEL_TOLERANCE) &&
  Math.abs(a[3] - b[3]) <= COLOUR_ALPHA_TOLERANCE

/** Splits on top-level commas, so `rgba(0, 0, 0, 0.1) 0px 4px 8px, ...` stays whole. */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of s) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

interface Shadow {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  colour: Rgba
}

/** One computed `box-shadow` entry: `rgba(0, 0, 0, 0.1) 0px 4px 8px 0px` (colour first) or
 *  `0px 4px 8px 0px rgb(...)`, optionally with `inset`. */
function parseCssShadow(s: string): Shadow | undefined {
  const inset = /\binset\b/.test(s)
  const colourText = /(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(s)?.[1]
  const colour = colourText ? parseColour(colourText) : undefined
  const nums = (s.replace(/\binset\b/g, "").replace(/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/gi, "").match(/-?[\d.]+(?=px|\s|$)/g) ?? []).map(Number)
  if (!colour || nums.length < 2) return undefined
  return { inset, x: nums[0], y: nums[1], blur: nums[2] ?? 0, spread: nums[3] ?? 0, colour }
}

type DesignEffect =
  | { kind: "shadow"; shadow: Shadow }
  | { kind: "blur"; of: "filter" | "backdropFilter"; radius: number }
  | { kind: "unknown"; type: string }

/** The inverse of figma/read.ts effectStrings: `TYPE x y radius [spread] colour` or `TYPE radius`. */
function parseDesignEffect(s: string): DesignEffect {
  const type = s.split(" ")[0]
  const rest = s.slice(type.length).trim()
  if (type === "LAYER_BLUR" || type === "BACKGROUND_BLUR") {
    const r = Number(rest)
    return Number.isNaN(r) ? { kind: "unknown", type } : { kind: "blur", of: type === "LAYER_BLUR" ? "filter" : "backdropFilter", radius: r }
  }
  if (type === "DROP_SHADOW" || type === "INNER_SHADOW") {
    const colourAt = rest.search(/(rgba?\(|#)/i)
    const colour = colourAt >= 0 ? parseColour(rest.slice(colourAt)) : undefined
    const nums = (colourAt >= 0 ? rest.slice(0, colourAt) : rest).trim().split(/\s+/).map(Number)
    if (!colour || nums.length < 3 || nums.some(Number.isNaN)) return { kind: "unknown", type }
    return {
      kind: "shadow",
      shadow: { inset: type === "INNER_SHADOW", x: nums[0], y: nums[1], blur: nums[2], spread: nums[3] ?? 0, colour },
    }
  }
  return { kind: "unknown", type }
}

const length = (s: string): number | undefined => {
  const m = /^(-?[\d.]+)px$/.exec(s.trim())
  return m ? Number(m[1]) : undefined
}

/** The element's box as a spec comparison reads it: a hugging text node is measured by its glyph run
 *  horizontally (the element is usually a block that fills its parent) and by its element box
 *  vertically (its design height is a line height, not the glyphs' height). */
function geomBox(node: DesignNode, el: DomElement): Box {
  const box = el.box as Box
  if (node.hugsWidth !== true || !el.ink) return box
  return { x: el.ink.x, y: box.y, width: el.ink.width, height: box.height }
}

const fmtBox = (b: Box) => `${round(b.x, 1)},${round(b.y, 1)} ${round(b.width, 1)}x${round(b.height, 1)}`

export function compareSpec(
  design: DesignTree,
  dom: DomTree,
  v: Verification,
  opts: { scale: number; tokens?: Token[]; unthemed?: string[] },
): { findings: Finding[]; coverage: Report["coverage"] } {
  const { scale } = opts
  const tol = TOLERANCE_FLOOR_PX * scale
  const textTol = TEXT_TOLERANCE_PX * scale
  const tokens = opts.tokens ?? []
  const unthemed = new Set(
    (opts.unthemed ?? []).map((c) => parseColour(c)).filter((c): c is Rgba => c !== undefined).map(formatColour),
  )

  const nodesById = new Map(design.nodes.map((n) => [n.id, n]))
  const elements = new Map(dom.elements.map((e) => [e.selector, e]))
  const kept: PairVerdict[] = [...v.accepted, ...v.sizeDiffers]
  const sizeDiffering = new Set(v.sizeDiffers.map((p) => p.nodeId))
  const pairOf = new Map<string, { node: DesignNode; el: DomElement }>()
  for (const p of kept) {
    const node = nodesById.get(p.nodeId)
    const el = elements.get(p.selector)
    if (node && el) pairOf.set(node.id, { node, el })
  }
  const rootBox = design.root.box
  const domRootBox = dom.root.box

  const findings: Finding[] = []
  const targetOf = (node: DesignNode, el: DomElement): Finding["target"] => ({
    selector: el.selector,
    designNode: node.id,
    ...(node.text ? { text: node.text } : {}),
  })
  /** `expected` text, with the name of a token that carries the same value. */
  const named = (property: TokenProperty, designValue: string, shown: string): string => {
    const t = tokenFor(tokens, property, designValue)
    return t ? `${shown} (${t.name})` : shown
  }
  const measure = (
    kindName: string,
    node: DesignNode,
    el: DomElement,
    expected: number,
    actual: number,
    allowed: number,
    property?: { name: TokenProperty; designValue: string },
    label = "",
  ) => {
    const delta = Math.abs(expected - actual)
    const shown = `${label}${px(expected)}`
    findings.push({
      check: "spec",
      kind: kindName,
      status: delta > allowed ? "fail" : "pass",
      target: targetOf(node, el),
      expected: property ? named(property.name, property.designValue, shown) : shown,
      actual: `${label}${px(actual)}`,
      deltaPx: round(delta),
    })
  }
  const skip = (kindName: string, node: DesignNode, el: DomElement, reason: string) =>
    findings.push({ check: "spec", kind: kindName, status: "not_comparable", target: targetOf(node, el), reason })

  // Root size: the root's own finding, so a wrong-sized root is never normalised away.
  if (rootBox && domRootBox) {
    const dw = Math.abs(rootBox.width * scale - domRootBox.width)
    const dh = Math.abs(rootBox.height * scale - domRootBox.height)
    findings.push({
      check: "spec",
      kind: "root-size",
      status: Math.max(dw, dh) > tol ? "fail" : "pass",
      target: { selector: dom.root.selector, designNode: design.root.id },
      expected: dims(rootBox.width * scale, rootBox.height * scale),
      actual: dims(domRootBox.width, domRootBox.height),
      deltaPx: round(Math.max(dw, dh)),
    })
  } else {
    findings.push({
      check: "spec",
      kind: "root-size",
      status: "not_comparable",
      target: { selector: dom.root.selector, designNode: design.root.id },
      reason: "the design root or the page root has no box",
    })
  }

  for (const node of design.nodes) {
    const pair = pairOf.get(node.id)
    if (!pair) continue
    const { el } = pair
    const style = el.style
    const isRoot = node.id === design.root.id

    // Box geometry. The root's size is its own finding above and its origin is the origin by definition.
    if (!isRoot) {
      if (!node.box || !el.box || !rootBox || !domRootBox) {
        skip(sizeDiffering.has(node.id) ? "size" : "box", node, el, "no box on one side")
      } else {
        const want = normalise(node.box, rootBox, domRootBox, scale)
        const got = geomBox(node, el)
        if (sizeDiffering.has(node.id)) {
          const worst = Math.max(Math.abs(want.width - got.width), Math.abs(want.height - got.height))
          findings.push({
            check: "spec",
            kind: "size",
            status: "fail",
            target: targetOf(node, el),
            expected: dims(want.width, want.height),
            actual: dims(got.width, got.height),
            deltaPx: round(worst),
          })
        } else {
          const worst = Math.max(
            Math.abs(want.x - got.x),
            Math.abs(want.y - got.y),
            Math.abs(want.width - got.width),
            Math.abs(want.height - got.height),
          )
          findings.push({
            check: "spec",
            kind: "box",
            status: worst > tol ? "fail" : "pass",
            target: targetOf(node, el),
            expected: fmtBox(want),
            actual: fmtBox(got),
            deltaPx: round(worst),
          })
        }
      }
    }
    if (!style) {
      skip("style", node, el, "the page walk recorded no computed style for this element")
      continue
    }

    // Radius: clamped to half the shorter side on both sides, as CSS clamps it.
    if (node.radius !== undefined && el.box) {
      const cap = Math.min(el.box.width, el.box.height) / 2
      const expected = Math.min(node.radius * scale, cap)
      const raw = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
      const corners = raw.map((r) => {
        const first = r.trim().split(/\s+/)[0]
        const pct = /^([\d.]+)%$/.exec(first)
        const n = pct ? (Number(pct[1]) / 100) * Math.min(el.box?.width ?? 0, el.box?.height ?? 0) : length(first)
        return n === undefined ? undefined : Math.min(n, cap)
      })
      if (corners.some((c) => c === undefined)) {
        skip("radius", node, el, `radius ${raw.join(" ")} is not a length or percentage`)
      } else {
        const got = corners as number[]
        const worst = Math.max(...got.map((c) => Math.abs(c - expected)))
        const far = got.reduce((a, b) => (Math.abs(b - expected) > Math.abs(a - expected) ? b : a))
        findings.push({
          check: "spec",
          kind: "radius",
          status: worst > tol ? "fail" : "pass",
          target: targetOf(node, el),
          expected: named("radius", String(node.radius), px(expected)),
          actual: px(far),
          deltaPx: round(worst),
        })
      }
    }

    // Border width: Figma's stroke weight against the computed border.
    if (node.strokeWeight !== undefined && node.type !== "TEXT") {
      const w = length(style.borderTopWidth)
      if (w === undefined) skip("border-width", node, el, `border width ${style.borderTopWidth} is not a length`)
      else measure("border-width", node, el, node.strokeWeight * scale, w, tol, { name: "borderWidth", designValue: String(node.strokeWeight) })
    }

    // Fill colour: a text node's fill is the text colour, anything else paints a background.
    if (node.fill !== undefined && !GRAPHIC_TYPES.has(node.type)) {
      const want = parseColour(node.fill)
      const got = parseColour(node.type === "TEXT" ? style.color : style.backgroundColor)
      if (!want || !got) {
        skip("colour", node, el, `colour ${want ? (node.type === "TEXT" ? style.color : style.backgroundColor) : node.fill} is not parseable`)
      } else {
        const intentional = unthemed.has(formatColour(got)) || unthemed.has(formatColour(want))
        findings.push({
          check: "spec",
          kind: "colour",
          status: intentional || sameColour(want, got) ? "pass" : "fail",
          target: targetOf(node, el),
          expected: named("color", formatColour(want), formatColour(want)),
          actual: formatColour(got),
        })
      }
    }

    // Type style.
    if (node.font) {
      const family = style.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "")
      findings.push({
        check: "spec",
        kind: "font-family",
        status: family.toLowerCase() === node.font.family.toLowerCase() ? "pass" : "fail",
        target: targetOf(node, el),
        expected: named("fontFamily", node.font.family, node.font.family),
        actual: family,
      })
      const size = length(style.fontSize)
      if (size === undefined) skip("font-size", node, el, `font size ${style.fontSize} is not a length`)
      else measure("font-size", node, el, node.font.size * scale, size, textTol, { name: "fontSize", designValue: String(node.font.size) })
      const weight = Number(style.fontWeight)
      findings.push({
        check: "spec",
        kind: "font-weight",
        status: weight === node.font.weight ? "pass" : "fail",
        target: targetOf(node, el),
        expected: named("fontWeight", String(node.font.weight), String(node.font.weight)),
        actual: String(weight),
      })
      if (node.font.lineHeight !== undefined) {
        const lh = length(style.lineHeight)
        if (lh === undefined) skip("line-height", node, el, `line height is ${style.lineHeight}, which has no pixel value to compare`)
        else measure("line-height", node, el, node.font.lineHeight * scale, lh, textTol, { name: "lineHeight", designValue: String(node.font.lineHeight) })
      }
    }

    // Effects: shadows and blurs. An effect type this does not understand is not a pass.
    if (node.effects?.length) {
      const wanted = node.effects.map(parseDesignEffect)
      const unknown = wanted.find((e) => e.kind === "unknown")
      if (unknown && unknown.kind === "unknown") {
        skip("effects", node, el, `effect type ${unknown.type} is not compared`)
      } else {
        const actualShadows = (style.boxShadow === "none" ? [] : splitTopLevel(style.boxShadow)).map(parseCssShadow)
        const wantShadows = wanted.flatMap((e) => (e.kind === "shadow" ? [e.shadow] : []))
        let ok = actualShadows.length === wantShadows.length && actualShadows.every((s) => s !== undefined)
        const free = actualShadows.filter((s): s is Shadow => s !== undefined)
        for (const w of wantShadows) {
          const i = free.findIndex(
            (s) =>
              s.inset === w.inset &&
              Math.abs(s.x - w.x * scale) <= tol &&
              Math.abs(s.y - w.y * scale) <= tol &&
              Math.abs(s.blur - w.blur * scale) <= tol &&
              Math.abs(s.spread - w.spread * scale) <= tol &&
              sameColour(s.colour, w.colour),
          )
          if (i < 0) ok = false
          else free.splice(i, 1)
        }
        for (const e of wanted) {
          if (e.kind !== "blur") continue
          const m = /blur\(([\d.]+)px\)/.exec(style[e.of])
          if (!m || Math.abs(Number(m[1]) - e.radius * scale) > tol) ok = false
        }
        findings.push({
          check: "spec",
          kind: "effects",
          status: ok ? "pass" : "fail",
          target: targetOf(node, el),
          expected: named("effect", node.effects.join("; "), node.effects.join("; ")),
          actual: [style.boxShadow, style.filter, style.backdropFilter].filter((s) => s && s !== "none").join("; ") || "none",
        })
      }
    }
  }

  // Spacing, from auto-layout containers.
  for (const node of design.nodes) {
    if (!node.layout) continue
    const kids = design.nodes.filter((n) => n.parentId === node.id)
    const horizontal = node.layout.mode === "HORIZONTAL"
    const start = (b: Box) => (horizontal ? b.x : b.y)
    const end = (b: Box) => (horizontal ? b.x + b.width : b.y + b.height)

    for (let i = 0; i + 1 < kids.length; i++) {
      const a = pairOf.get(kids[i].id)
      const b = pairOf.get(kids[i + 1].id)
      if (!a || !b) {
        const missing = a ? kids[i + 1].id : kids[i].id
        const holder = a ?? b
        if (holder) skip("gap", holder.node, holder.el, `the sibling ${missing} has no accepted pair, so the gap between ${kids[i].id} and ${kids[i + 1].id} cannot be measured`)
        continue
      }
      if (!a.el.box || !b.el.box) {
        skip("gap", b.node, b.el, "no box on one side")
        continue
      }
      const actual = start(geomBox(b.node, b.el)) - end(geomBox(a.node, a.el))
      measure("gap", b.node, b.el, node.layout.gap * scale, actual, tol, { name: "spacing", designValue: String(node.layout.gap) })
    }

    const own = pairOf.get(node.id)
    if (!own || kids.length === 0 || !own.el.box) continue
    const first = pairOf.get(kids[0].id)
    const last = pairOf.get(kids[kids.length - 1].id)
    const [top, right, bottom, left] = node.layout.padding
    const crossStart = horizontal ? top : left
    const nominalStart = horizontal ? left : top
    const parent = own.el.box
    const sides: { label: string; nominal: number; child: DesignNode; el?: DomElement; actual?: (c: Box) => number; atEnd: boolean }[] = [
      { label: horizontal ? "left" : "top", nominal: nominalStart, child: kids[0], el: first?.el, actual: (c) => start(c) - start(parent), atEnd: false },
      { label: horizontal ? "top" : "left", nominal: crossStart, child: kids[0], el: first?.el, actual: (c) => (horizontal ? c.y - parent.y : c.x - parent.x), atEnd: false },
      { label: horizontal ? "right" : "bottom", nominal: horizontal ? right : bottom, child: kids[kids.length - 1], el: last?.el, actual: (c) => end(parent) - end(c), atEnd: true },
    ]
    for (const s of sides) {
      const childPair = pairOf.get(s.child.id)
      if (!childPair || !s.el?.box || !s.actual) {
        skip("padding", own.node, own.el, `the ${s.label} padding is measured to ${s.child.id}, which has no accepted pair`)
        continue
      }
      let expected = s.nominal * scale
      if (s.atEnd && node.box && s.child.box) {
        // See SPACING above: the end side is what the design's own geometry shows.
        expected = (end(node.box) - end(s.child.box)) * scale
      }
      const actual = s.actual(geomBox(childPair.node, childPair.el))
      measure("padding", own.node, own.el, expected, actual, tol, s.atEnd ? undefined : { name: "spacing", designValue: String(s.nominal) }, `${s.label} `)
    }
  }

  const proposed = v.pairs.length
  return {
    findings,
    coverage: { pairsProposed: proposed, pairsAccepted: kept.length, dropped: proposed - kept.length },
  }
}
