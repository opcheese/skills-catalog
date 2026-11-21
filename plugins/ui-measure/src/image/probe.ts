import type { RgbaImage } from "./png.js"

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Line {
  top: number
  bottom: number
  height: number
}

export interface ProbeOptions {
  /** Image pixels per CSS pixel. Default 1. */
  scale?: number
  /** Sum of absolute RGB differences above which a pixel differs from a colour. Default 12. */
  tolerance?: number
}

export type Side = "top" | "right" | "bottom" | "left"

export interface Rim {
  /** CSS pixels. */
  width: number
  kind: "none" | "border" | "shadow"
  /** The border colour, for a border. */
  hex?: string
}

export interface ProbeResult {
  status: "measured" | "nothing"
  reason?: string
  /** The box as given, image pixels. */
  box: Box
  /** Dominant colour of a ring outside the box. */
  background?: string
  /** Snapped element box, CSS pixels. */
  bounds?: Box
  /** Snapped element box, image pixels. */
  boundsPx?: Box
  /** Everything that differs from the background, shadow and border included, CSS pixels. */
  outer?: Box
  outerPx?: Box
  /**
   * Per side, what lies between the outer edge and the fill: a one-colour band is a border and stays in
   * the box; anything else (a gradient) is a shadow and is left out of the box. null without a fill.
   */
  rim: Record<Side, Rim> | null
  /** Sides where the element reaches the edge of the search area: the given box was too small. */
  clipped: Side[]
  /** The element's own fill; null when it has none (bare text or an icon on the background). */
  fill: { hex: string; coverage: number } | null
  /** Dominant content colour inside the element (text, icon, border); null when there is none. */
  /** exact: one colour holds a real share of the strokes; false on resampled images, where it is approximate. */
  ink: { hex: string; coverage: number; exact: boolean } | null
  inkBounds: Box | null
  /** From the element's edges to its ink: the padding to content. CSS pixels. */
  insets: Insets | null
  /** Horizontal ink bands, CSS pixels from the image top. */
  lines: Line[]
  /** Median distance between line tops, CSS pixels; null with fewer than two lines. */
  linePitch: number | null
  /** Reasons to distrust this measurement. */
  warnings: string[]
}

/** Area share of non-background pixels above which an element counts as having its own fill. */
const FILLED_SHARE = 0.75
/** A row or column is inside the fill when it holds at least this share of the widest fill run. */
const FILL_RUN_SHARE = 0.25
/** A rim side is a border when this share of it is one colour (and all sides agree, see below). */
const BORDER_SAME_SHARE = 0.8
/** Non-fill pixels this close to the element's edge, or in its corners, are edge rather than ink... */
const EDGE_ZONE = 2
/** ...corners being squares of this share of the shorter side, at most 32 image pixels. */
const CORNER_SHARE = 0.25
/** Ink at least this share of the way to the farthest ink pixel sets extent and lines... */
const STRONG_SHARE = 0.25
/** ...and at least this share sets the ink colour. */
const CORE_SHARE = 0.5
/** The dominant ink colour is exact when it holds this share of the core stroke pixels. */
const EXACT_SHARE = 0.2
/** The ring around the box is one background when this share of it matches the dominant colour. */
const RING_SAME_SHARE = 0.7
/** An enclosed region joins the element (a card inside its shadow ring) only above this share of it. */
const HOLE_SHARE = 0.25

/** Fewest ring pixels to trust for the background before falling back to the image edge. */
const MIN_RING = 64

function* edgePixels(image: RgbaImage): Generator<number> {
  for (let x = 0; x < image.width; x++) {
    yield x * 4
    yield ((image.height - 1) * image.width + x) * 4
  }
  for (let y = 1; y < image.height - 1; y++) {
    yield y * image.width * 4
    yield (y * image.width + image.width - 1) * 4
  }
}

/** 4-connected flood from the perimeter of a w x h grid over cells where passable(i) holds. */
function flood(w: number, h: number, passable: (i: number) => boolean): Uint8Array {
  const seen = new Uint8Array(w * h)
  const queue: number[] = []
  const seed = (x: number, y: number) => {
    const i = y * w + x
    if (!seen[i] && passable(i)) {
      seen[i] = 1
      queue.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    seed(x, 0)
    seed(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    seed(0, y)
    seed(w - 1, y)
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!
    const x = i % w
    const y = (i - x) / w
    if (x + 1 < w) seed(x + 1, y)
    if (x > 0) seed(x - 1, y)
    if (y + 1 < h) seed(x, y + 1)
    if (y > 0) seed(x, y - 1)
  }
  return seen
}

function distance(d: Uint8Array, o: number, c: readonly number[]): number {
  return Math.abs(d[o]! - c[0]!) + Math.abs(d[o + 1]! - c[1]!) + Math.abs(d[o + 2]! - c[2]!)
}

/**
 * Most frequent exact colour. Exact, not binned: 4-bit-per-channel bins (one-shot-ui's approach) put
 * white and #f2f4f7 in one bin, and light UI surfaces are exactly the colours that must stay apart.
 * PNG is lossless, so a solid surface is one exact colour and anti-aliasing scatters around it.
 */
function dominant(d: Uint8Array, offsets: Iterable<number>): number[] | undefined {
  const counts = new Map<number, number>()
  let best = -1
  let bestCount = 0
  for (const o of offsets) {
    const key = (d[o]! << 16) | (d[o + 1]! << 8) | d[o + 2]!
    const n = (counts.get(key) ?? 0) + 1
    counts.set(key, n)
    if (n > bestCount) {
      bestCount = n
      best = key
    }
  }
  return best < 0 ? undefined : [(best >> 16) & 255, (best >> 8) & 255, best & 255]
}

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const colourDistance = (a: number[], b: number[]) => Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!)

const hex = (c: readonly number[]) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("")
const round = (v: number) => Math.round(v * 100) / 100
const share = (v: number) => Math.round(v * 1000) / 1000

function clip(box: Box, image: RgbaImage): Box | undefined {
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(image.width, Math.ceil(box.x + box.width))
  const y1 = Math.min(image.height, Math.ceil(box.y + box.height))
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : undefined
}

const grow = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m })
const inside = (b: Box, x: number, y: number) => x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height

function* pixels(image: RgbaImage, b: Box, skip?: Box): Generator<number> {
  for (let y = b.y; y < b.y + b.height; y++) {
    for (let x = b.x; x < b.x + b.width; x++) if (!skip || !inside(skip, x, y)) yield (y * image.width + x) * 4
  }
}

/**
 * Measure one element in a screenshot from a rough box around it. Every number comes from pixels:
 * the edges are snapped to the element, colours are the dominant ones, lines are ink row bands.
 */
export function probe(image: RgbaImage, box: Box, options: ProbeOptions = {}): ProbeResult {
  const scale = options.scale ?? 1
  const tol = options.tolerance ?? 12
  const empty = { box, warnings: [] as string[], rim: null, clipped: [] as Side[], fill: null, ink: null, inkBounds: null, insets: null, lines: [], linePitch: null }
  const given = clip(box, image)
  if (!given) return { ...empty, status: "nothing", reason: "the box is outside the image" }

  const d = image.data
  const m = Math.min(24, Math.max(4, Math.round(0.05 * Math.min(given.width, given.height))))
  const search = clip(grow(given, m), image)!
  const ringOuter = clip(grow(given, 2 * m), image)!
  // The background is what surrounds the box; with no room around it (the box reaches the image's
  // edges), the image's own outermost pixels, which a frame export draws in its background.
  let ring = [...pixels(image, ringOuter, search)]
  if (ring.length < MIN_RING) ring = [...edgePixels(image)]
  const bg = dominant(d, ring)!
  const warnings: string[] = []
  if (ring.length && ring.filter((o) => distance(d, o, bg) <= tol).length / ring.length < RING_SAME_SHARE) {
    warnings.push("the surrounding colour is mixed (the box sits across a boundary); the background guess may be wrong, move or resize the box")
  }
  const css = (v: number) => round(v / scale)
  const cssBox = (b: Box): Box => ({ x: css(b.x), y: css(b.y), width: css(b.width), height: css(b.height) })

  // Non-background mask over the search area; keep the 8-connected components that touch the box.
  const sw = search.width
  const mask = new Uint8Array(sw * search.height)
  for (let y = 0; y < search.height; y++) {
    for (let x = 0; x < sw; x++) {
      if (distance(d, ((search.y + y) * image.width + search.x + x) * 4, bg) > tol) mask[y * sw + x] = 1
    }
  }
  const kept = new Uint8Array(mask.length)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || kept[start]) continue
    const component: number[] = [start]
    kept[start] = 2
    let touches = false
    for (let k = 0; k < component.length; k++) {
      const p = component[k]!
      const px = p % sw
      const py = (p - px) / sw
      if (inside(given, search.x + px, search.y + py)) touches = true
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx
          const ny = py + dy
          if (nx < 0 || ny < 0 || nx >= sw || ny >= search.height) continue
          const q = ny * sw + nx
          if (mask[q] && !kept[q]) {
            kept[q] = 2
            component.push(q)
          }
        }
      }
    }
    for (const p of component) {
      kept[p] = touches ? 1 : 3
      if (!touches) continue
      const px = p % sw
      const py = (p - px) / sw
      x0 = Math.min(x0, px)
      y0 = Math.min(y0, py)
      x1 = Math.max(x1, px)
      y1 = Math.max(y1, py)
    }
  }
  if (x1 < 0) {
    return { ...empty, warnings, status: "nothing", background: hex(bg), reason: "nothing in the box differs from the surrounding colour" }
  }
  const clipped: Side[] = []
  // A side reaching the search edge means the box was too small, unless that edge is the image's own.
  const imageEdge: Side[] = []
  const reach = (side: Side, atSearchEdge: boolean, atImageEdge: boolean) => {
    if (!atSearchEdge) return
    if (atImageEdge) imageEdge.push(side)
    else clipped.push(side)
  }
  reach("top", y0 === 0, search.y === 0)
  reach("right", x1 === sw - 1, search.x + sw === image.width)
  reach("bottom", y1 === search.height - 1, search.y + search.height === image.height)
  reach("left", x0 === 0, search.x === 0)
  if (imageEdge.length) warnings.push(`the element touches the image edge: ${imageEdge.join(", ")}; it may continue beyond the image`)
  const outer: Box = { x: search.x + x0, y: search.y + y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
  const at = (x: number, y: number) => (y - search.y) * sw + (x - search.x)
  const off = (x: number, y: number) => (y * image.width + x) * 4

  // What the element encloses belongs to it: a white card inside its grey shadow ring is the card.
  // Only a large enclosed region counts: letter counters are small holes and stay outside.
  const exterior = flood(sw, search.height, (i) => kept[i] !== 1)
  const enclosed = new Uint8Array(mask.length)
  const outerAreaPx = outer.width * outer.height
  for (let start = 0; start < mask.length; start++) {
    if (kept[start] === 1 || exterior[start] || enclosed[start]) continue
    const region = [start]
    enclosed[start] = 2
    for (let k = 0; k < region.length; k++) {
      const i = region[k]!
      const x = i % sw
      for (const j of [i - sw, i + sw, x > 0 ? i - 1 : -1, x + 1 < sw ? i + 1 : -1]) {
        if (j >= 0 && j < mask.length && kept[j] !== 1 && !exterior[j] && !enclosed[j]) {
          enclosed[j] = 2
          region.push(j)
        }
      }
    }
    const big = region.length >= HOLE_SHARE * outerAreaPx
    for (const i of region) enclosed[i] = big ? 1 : 3
  }
  const isElement = (x: number, y: number) => kept[at(x, y)] === 1 || enclosed[at(x, y)] === 1

  const outerArea = outer.width * outer.height
  let solid = 0
  for (let y = outer.y; y < outer.y + outer.height; y++) {
    for (let x = outer.x; x < outer.x + outer.width; x++) if (isElement(x, y)) solid++
  }

  let bounds = outer
  let borderBand: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  let fill: ProbeResult["fill"] = null
  let rim: ProbeResult["rim"] = null
  let ref = bg
  if (solid / outerArea >= FILLED_SHARE) {
    const own: number[] = []
    for (let y = outer.y; y < outer.y + outer.height; y++) {
      for (let x = outer.x; x < outer.x + outer.width; x++) if (isElement(x, y)) own.push(off(x, y))
    }
    ref = dominant(d, own)!
    // Fill extent: rows and columns where the fill colour is a real share of the widest run.
    const rowFill = new Array<number>(outer.height).fill(0)
    const colFill = new Array<number>(outer.width).fill(0)
    for (let y = outer.y; y < outer.y + outer.height; y++) {
      for (let x = outer.x; x < outer.x + outer.width; x++) {
        if (distance(d, off(x, y), ref) <= tol) {
          rowFill[y - outer.y]!++
          colFill[x - outer.x]!++
        }
      }
    }
    const span = (counts: number[]) => {
      const max = Math.max(...counts)
      const first = counts.findIndex((c) => c >= FILL_RUN_SHARE * max)
      let last = counts.length - 1
      while (last > first && counts[last]! < FILL_RUN_SHARE * max) last--
      return [first, last] as const
    }
    const [fy0, fy1] = span(rowFill)
    const [fx0, fx1] = span(colFill)
    const fillBox: Box = { x: outer.x + fx0, y: outer.y + fy0, width: fx1 - fx0 + 1, height: fy1 - fy0 + 1 }
    const band: Record<Side, Box> = {
      top: { x: fillBox.x, y: outer.y, width: fillBox.width, height: fillBox.y - outer.y },
      bottom: { x: fillBox.x, y: fillBox.y + fillBox.height, width: fillBox.width, height: outer.y + outer.height - fillBox.y - fillBox.height },
      left: { x: outer.x, y: fillBox.y, width: fillBox.x - outer.x, height: fillBox.height },
      right: { x: fillBox.x + fillBox.width, y: fillBox.y, width: outer.x + outer.width - fillBox.x - fillBox.width, height: fillBox.height },
    }
    rim = {} as Record<Side, Rim>
    const keep = {} as Record<Side, boolean>
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const b = band[side]
      const width = side === "top" || side === "bottom" ? b.height : b.width
      if (width <= 0 || b.width <= 0 || b.height <= 0) {
        rim[side] = { width: 0, kind: "none" }
        continue
      }
      const offsets = [...pixels(image, b)]
      const colour = dominant(d, offsets)!
      const same = offsets.filter((o) => distance(d, o, colour) <= tol).length / offsets.length
      const border = same >= BORDER_SAME_SHARE
      keep[side] = border
      rim[side] = border ? { width: css(width), kind: "border", hex: hex(colour) } : { width: css(width), kind: "shadow" }
    }
    // A border is the same colour and width all round; a shadow differs by side (offset, falloff).
    const borders = (["top", "right", "bottom", "left"] as const).filter((side) => rim![side].kind === "border")
    const nonEmpty = (["top", "right", "bottom", "left"] as const).filter((side) => rim![side].kind !== "none")
    const first = borders[0] && hexRgb(rim[borders[0]].hex!)
    const consistent = borders.length === nonEmpty.length &&
      borders.every((side) => colourDistance(hexRgb(rim![side].hex!), first!) <= tol && rim![side].width === rim![borders[0]!].width)
    if (!consistent && borders.length === nonEmpty.length) {
      warnings.push("the rim is one colour per side but uneven: an uneven border or an offset shadow; it is left out of the box, check it")
    }
    if (!consistent) {
      for (const side of borders) {
        rim[side] = { width: rim[side].width, kind: "shadow" }
        keep[side] = false
      }
    }
    const left = keep.left ? outer.x : fillBox.x
    const top = keep.top ? outer.y : fillBox.y
    const right = keep.right ? outer.x + outer.width : fillBox.x + fillBox.width
    const bottom = keep.bottom ? outer.y + outer.height : fillBox.y + fillBox.height
    bounds = { x: left, y: top, width: right - left, height: bottom - top }
    borderBand = {
      top: keep.top ? fillBox.y - outer.y : 0,
      right: keep.right ? outer.x + outer.width - fillBox.x - fillBox.width : 0,
      bottom: keep.bottom ? outer.y + outer.height - fillBox.y - fillBox.height : 0,
      left: keep.left ? fillBox.x - outer.x : 0,
    }
    let near = 0
    for (const o of pixels(image, bounds)) if (distance(d, o, ref) <= tol) near++
    fill = { hex: hex(ref), coverage: share(near / (bounds.width * bounds.height)) }
  }
  let area = bounds.width * bounds.height

  // Inside a filled element, non-fill pixels connected to its edge are edge (rounded corners,
  // anti-aliasing, a border) where they lie in the edge zone: the outermost EDGE_ZONE pixels, the corner
  // squares and the border band. Deeper, or as strong as the content's core, they are content that runs to
  // the edge (zero padding, a full-bleed image). Text enclosed by fill is never edge-connected, so even
  // white text on a white page is ink.
  const bw = bounds.width
  const bh = bounds.height
  const edgeConnected = fill
    ? flood(bw, bh, (i) => {
        const lx = i % bw
        return distance(d, off(bounds.x + lx, bounds.y + (i - lx) / bw), ref) > tol
      })
    : new Uint8Array(bw * bh)
  const corner = Math.min(32, Math.round(CORNER_SHARE * Math.min(bw, bh)))
  const inBorder = (lx: number, ly: number) =>
    ly < borderBand.top || lx >= bw - borderBand.right || ly >= bh - borderBand.bottom || lx < borderBand.left
  const inZone = (lx: number, ly: number) => {
    const dx = Math.min(lx, bw - 1 - lx)
    const dy = Math.min(ly, bh - 1 - ly)
    return inBorder(lx, ly) || Math.min(dx, dy) < EDGE_ZONE || (dx < corner && dy < corner)
  }
  const candidates: number[] = []
  const edgeCore: number[] = []
  let farthest = 0
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const o = off(x, y)
      const lx = x - bounds.x
      const ly = y - bounds.y
      if (!fill) {
        if (kept[at(x, y)] !== 1 || !inside(search, x, y)) continue
      } else {
        if (distance(d, o, ref) <= tol || inBorder(lx, ly)) continue
        if (edgeConnected[ly * bw + lx] && inZone(lx, ly)) {
          edgeCore.push(o)
          continue
        }
      }
      candidates.push(o)
      farthest = Math.max(farthest, distance(d, o, ref))
    }
  }
  // Edge-zone pixels as strong as the content's core and connected to interior content belong to content
  // touching the edge; corner anti-aliasing is never connected to the interior.
  if (farthest > 0 && edgeCore.length) {
    const core = Math.max(tol, CORE_SHARE * farthest)
    const pending = new Set(edgeCore.filter((o) => distance(d, o, ref) >= core))
    const queue = [...candidates]
    for (let k = 0; k < queue.length && pending.size; k++) {
      const o = queue[k]!
      for (const n of [o - 4, o + 4, o - image.width * 4, o + image.width * 4]) {
        if (pending.delete(n)) {
          candidates.push(n)
          queue.push(n)
        }
      }
    }
  }
  const strongMin = Math.max(tol, STRONG_SHARE * farthest)
  const strong = candidates.filter((o) => distance(d, o, ref) >= strongMin)
  const coreMin = Math.max(tol, CORE_SHARE * farthest)
  const inkOffsets = strong
  let ix0 = Infinity, iy0 = Infinity, ix1 = -Infinity, iy1 = -Infinity
  for (const o of strong) {
    const p = o / 4
    const x = p % image.width
    const y = (p - x) / image.width
    ix0 = Math.min(ix0, x)
    iy0 = Math.min(iy0, y)
    ix1 = Math.max(ix1, x)
    iy1 = Math.max(iy1, y)
  }
  // Bare content (no fill) is its own box: snap to the strong ink.
  if (!fill && strong.length >= 4) {
    bounds = { x: ix0, y: iy0, width: ix1 - ix0 + 1, height: iy1 - iy0 + 1 }
  }
  const rows = new Uint8Array(bounds.height)
  for (const o of strong) {
    const p = o / 4
    const y = (p - (p % image.width)) / image.width
    if (y >= bounds.y && y < bounds.y + bounds.height) rows[y - bounds.y] = 1
  }
  area = bounds.width * bounds.height
  let ink: ProbeResult["ink"] = null
  let inkBounds: Box | null = null
  let insets: Insets | null = null
  const lines: Line[] = []
  if (inkOffsets.length >= 4) {
    const core = inkOffsets.filter((o) => distance(d, o, ref) >= coreMin)
    const colour = dominant(d, core)!
    const exactShare = core.filter((o) => distance(d, o, colour) === 0).length / core.length
    const within = candidates.filter((o) => {
      const p = o / 4
      const x = p % image.width
      return inside(bounds, x, (p - x) / image.width)
    }).length
    ink = { hex: hex(colour), coverage: share(within / area), exact: exactShare >= EXACT_SHARE }
    if (!ink.exact) warnings.push("the ink colour is approximate: no single colour dominates the strokes (a resampled image?)")
    const inkPx: Box = { x: ix0, y: iy0, width: ix1 - ix0 + 1, height: iy1 - iy0 + 1 }
    inkBounds = cssBox(inkPx)
    insets = {
      top: css(inkPx.y - bounds.y),
      right: css(bounds.x + bounds.width - (inkPx.x + inkPx.width)),
      bottom: css(bounds.y + bounds.height - (inkPx.y + inkPx.height)),
      left: css(inkPx.x - bounds.x),
    }
    for (let r = 0; r < rows.length; r++) {
      if (!rows[r] || (r > 0 && rows[r - 1])) continue
      let end = r
      while (end < rows.length && rows[end]) end++
      lines.push({ top: css(bounds.y + r), bottom: css(bounds.y + end), height: css(end - r) })
    }
  }
  const tops = lines.map((l) => l.top)
  const steps = tops.slice(1).map((t, i) => t - tops[i]!).sort((a, b) => a - b)
  const linePitch = steps.length ? round(steps[Math.floor((steps.length - 1) / 2)]!) : null

  return {
    status: "measured",
    box,
    background: hex(bg),
    bounds: cssBox(bounds),
    boundsPx: bounds,
    outer: cssBox(outer),
    outerPx: outer,
    rim,
    clipped,
    fill,
    ink,
    inkBounds,
    insets,
    lines,
    linePitch,
    warnings,
  }
}
