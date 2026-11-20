// The correspondence verifier: code that checks a node↔element MAPPING before
// any arithmetic runs on it.
//
// A model proposes the mapping (that is the next task). Nothing here consults a
// model, and nothing downstream may measure a pair this file did not accept: a
// per-element geometry comparison over a WRONG mapping produces confident,
// wrong numbers — worse than no comparison at all, because it reads as a
// measurement.
//
// A pair that fails a rule becomes `not_comparable` — the PAIR, not the run,
// borrowing the vocabulary of conformance.ts, where `not_comparable` is
// recorded and never counted as agreement. If more than half the proposed pairs
// fail, the whole proposal is rejected and the caller falls back to the
// root-and-counts comparison that needs no mapping at all.
//
// IDENTITY IS NOT POSITION. Every rule here answers "could these two be the
// same thing" from type, injectivity, ordinal reading order, TEXT and SIZE.
// None of
// them consults where the two boxes sit, because that is precisely what the
// caller measures once a pair is accepted, and a rule that discarded a pair for
// being in the wrong place would answer the question with itself — the failure
// measured on 2026-08-18, where a real 15px deviation was thrown away as an
// implausible pair instead of reported as the mismatch it was.

import type {
  Box,
  DesignNode,
  DesignTree,
  DomElement,
  DomTree,
  PairVerdict,
  Proposal,
  RejectionRule,
  Verification,
} from "./types"

/** How far a normalised design box's SIZE may differ from its element's and
 *  still be a plausible correspondence.
 *
 *  IDENTITY IS DECIDED WITHOUT POSITION, AND THAT IS THE WHOLE POINT. The rule
 *  this replaces compared whole boxes, which answered two different questions
 *  with one number: *could these be the same thing* and *are these in the same
 *  place*. Position is the thing downstream arithmetic exists to measure, so
 *  using it to decide comparability made the mechanism blind to exactly the
 *  defect class it was built for — the bigger the shift, the more certain the
 *  verifier was that it was not a real pair. Measured 2026-08-18: the seeded
 *  45px illustration shift and the card's own 15px deviation were BOTH
 *  discarded as implausible rather than reported as mismatches.
 *
 *  Size is not position: a translated element keeps its width and height, so a
 *  positional defect cannot hide from a size rule, and a size rule still
 *  separates candidates a translation would not.
 *
 *  The number, from the same measurement over the real card: correct pairs
 *  differ by 0-5px in width and height (5px on the TEXT nodes, where the font
 *  metric resolves differently), and the one genuinely WRONG pair the model
 *  proposed — the title TEXT claimed by a full-width wrapper — differs by
 *  156px. 8px is above every correct pair and far below the wrong one.
 *
 *  This is NOT the conformance tolerance. conformance.ts uses EPSILON = 0.5
 *  because it is measuring; here the question is only whether two things could
 *  be the same thing. */
export const SIZE_TOLERANCE_PX = 8

/** Design types that are leaf graphics, and the tags that can render them. */
const GRAPHIC_TYPES = new Set([
  "VECTOR",
  "ELLIPSE",
  "RECTANGLE",
  "LINE",
  "STAR",
])
const GRAPHIC_TAGS = new Set(["svg", "path", "img", "circle", "rect", "canvas"])

function hasText(el: DomElement): boolean {
  return (el.text ?? "").trim().length > 0
}

/** Is this design type capable of being this element?
 *
 *  Deliberately coarse. The rule exists to catch a mapping that crosses
 *  categories — a title TEXT node claimed by an image — not to encode Figma's
 *  taxonomy, which does not correspond to the DOM's (that mismatch is exactly
 *  why per-kind counts are `not_comparable` today). */
function typeCompatible(
  node: DesignNode,
  el: DomElement,
): { ok: boolean; note?: string } {
  if (node.type === "TEXT") {
    return hasText(el)
      ? { ok: true }
      : { ok: false, note: `TEXT node mapped to <${el.tag}> carrying no text` }
  }
  if (GRAPHIC_TYPES.has(node.type)) {
    if (hasText(el)) {
      return {
        ok: false,
        note: `${node.type} mapped to a text-bearing element`,
      }
    }
    return GRAPHIC_TAGS.has(el.tag)
      ? { ok: true }
      : { ok: false, note: `${node.type} mapped to <${el.tag}>` }
  }
  // Containers: FRAME, SLOT, GROUP, COMPONENT, INSTANCE. An icon-only button is
  // an INSTANCE with no own text, which is why the test is on OWN text.
  //
  // The one exception, and it is not a loosening: a container holding exactly
  // one TEXT and nothing else IS a text leaf, drawn by a tool that names the
  // label separately. Without this the rule read "a Figma container may never
  // map to a text-carrying element", which rejected every Badge and every
  // Button in every component -- Figma always keeps an instance's TEXT child,
  // and shadcn always renders the label as the element's own text. Measured on
  // a real component 2026-08-19: it was the only pair standing between this
  // programme and its first recorded baseline. A multi-child Button is still
  // rejected, which is what keeps this from being a hole.
  if (!hasText(el)) return { ok: true }
  return node.labelOnly
    ? { ok: true }
    : { ok: false, note: `${node.type} container mapped to a text leaf` }
}

/** The design's origin is the Figma canvas (e.g. {x: 429, y: 214}); the DOM's
 *  is the viewport. Raw coordinates are not comparable, so a design box is
 *  expressed in the element coordinate space of the DOM root: translated by the
 *  two roots' origins and divided by `scale`, the design pixels per CSS pixel
 *  (a frame exported at 2x has scale 2).
 *
 *  The roots' WIDTH RATIO is deliberately not used. A ratio inferred from the
 *  two roots silently absorbs a real width deviation of the root into every
 *  child's box, so the one defect the root comparison exists to report would
 *  be divided out before any pair was measured. The scale is a stated input,
 *  never an inference. */
export function normalise(
  box: Box,
  designRoot: Box,
  domRoot: Box,
  scale: number,
): Box {
  return {
    x: domRoot.x + (box.x - designRoot.x) / scale,
    y: domRoot.y + (box.y - designRoot.y) / scale,
    width: box.width / scale,
    height: box.height / scale,
  }
}

/** Reading order: top to bottom, then left to right within a row. Applied to
 *  BOTH sides in the same coordinate space, so a correct mapping produces the
 *  same sequence on both and needs no cross-taxonomy assumption.
 *
 *  A box is on a row when its CENTRE sits within half the shorter height of the
 *  row's first member's centre. A line is where things are centred on, not
 *  where their tops happen to fall: a top-edge proxy answers "same line"
 *  wrongly precisely when two boxes on one line have different heights, which
 *  is the bullet — a 9px dot beside a 22px tag has its top further down not
 *  because it is on another line but because it is smaller and centred.
 *
 *  Rows are ASSIGNED first, then sorted. Comparing y inside the comparator is
 *  not transitive — with three boxes 6px apart, a and b are the
 *  same row, b and c are the same row, and a and c are not, so the result
 *  depends on the order the sort happens to compare them in. Two sides that
 *  agree would then rank differently for no reason but input order, and rule 3
 *  would reject correct pairs. */
export function readingOrder(boxes: Box[]): number[] {
  const byY = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  const row = new Map<number, number>()
  let current = 0
  let first: Box | null = byY.length > 0 ? byY[0].box : null
  for (const entry of byY) {
    if (first === null) first = entry.box
    // Centres, not top edges. Measured on the real card: the 9px bullet sits
    // 7.5px below its row top on the design side and 8.1px below on the DOM
    // side, so an 8px band put the same element on two different rows — the
    // design side ranked it 5th and the DOM side 13th, and the LIS in rule 3
    // dropped exactly it. The two centres are 1.0px and 0.95px apart.
    //
    // Shared vertical EXTENT is the other obvious reading of "same line" and
    // it is wrong here: these trees are nested, so an ancestor contains every
    // descendant's extent entirely and the whole card collapses into one row.
    // Measured 2026-08-20 over the same 23 pairs: extent overlap kept 20, the
    // band kept 22, centres keep 23.
    const centre = entry.box.y + entry.box.height / 2
    const rowCentre = first.y + first.height / 2
    const apart = Math.abs(centre - rowCentre)
    const shorter = Math.min(entry.box.height, first.height)
    // Measured against the row's FIRST member and never against the row as it
    // grows: a row that re-measures itself creeps down the page one step at a
    // time, and the comparator stops being transitive.
    //
    // `shorter <= 0` is a zero-height box, which sits on no line and would be
    // compared against half of nothing; it starts its own row.
    if (!(shorter > 0 && apart <= shorter / 2)) {
      current += 1
      first = entry.box
    }
    row.set(entry.index, current)
  }
  return boxes
    .map((box, index) => ({ box, index }))
    .sort(
      (a, b) =>
        (row.get(a.index) ?? 0) - (row.get(b.index) ?? 0) ||
        a.box.x - b.box.x ||
        a.index - b.index,
    )
    .map((entry) => entry.index)
}

/** Indices of the longest strictly increasing subsequence. O(n^2), on a list
 *  the size of one component's elements. */
function longestIncreasing(values: number[]): number[] {
  const best: number[] = values.map(() => 1)
  const from: number[] = values.map(() => -1)
  let endAt = 0
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < i; j++) {
      if (values[j] < values[i] && best[j] + 1 > best[i]) {
        best[i] = best[j] + 1
        from[i] = j
      }
    }
    if (best[i] > best[endAt]) endAt = i
  }
  const keep: number[] = []
  for (let i = values.length ? endAt : -1; i >= 0; i = from[i]) keep.push(i)
  return keep.reverse()
}

/** The box on the implementation side that is comparable to `node`'s.
 *
 *  For a node Figma sized to its own content, that is the element's ink: the
 *  design box IS the glyph run or the drawn path, so the element's border box
 *  is the wrong end of the comparison and differs by however much empty space
 *  the parent gave it.
 *
 *  Falls back to the border box whenever ink was not measured. Absent ink
 *  means "not measured", never "zero" — an element whose range could not be
 *  read is not thereby smaller than it is, and a rule that treated it as such
 *  would reject correct pairs on a browser quirk. */
export function comparableBox(node: DesignNode, el: DomElement): Box {
  if (node.hugsWidth !== true) return el.box as Box
  return el.ink ?? (el.box as Box)
}

export function verifyMapping(
  proposal: Proposal,
  design: DesignTree,
  dom: DomTree,
  opts: { scale: number },
): Verification {
  const nodesById = new Map(design.nodes.map((n) => [n.id, n]))
  const elementsBySelector = new Map(dom.elements.map((e) => [e.selector, e]))

  const verdicts: PairVerdict[] = proposal.pairs.map((p) => ({
    nodeId: p.nodeId,
    selector: p.selector,
    outcome: "accepted",
  }))

  const reject = (v: PairVerdict, rule: RejectionRule, note: string) => {
    if (v.outcome === "not_comparable") return
    v.outcome = "not_comparable"
    v.rule = rule
    v.note = note
  }

  // Rule 0: both ends exist. A pair naming something that is not in either tree
  // cannot be checked by any later rule, and must not reach arithmetic.
  for (const v of verdicts) {
    if (!nodesById.has(v.nodeId)) {
      reject(v, "resolvable", `no design node ${v.nodeId}`)
    } else if (!elementsBySelector.has(v.selector)) {
      reject(v, "resolvable", `no element matching ${v.selector}`)
    }
  }

  // Rule 1: injective, in both directions. When two pairs claim the same end,
  // BOTH are rejected: nothing here can tell which of them was meant.
  const nodeUses = new Map<string, number>()
  const selectorUses = new Map<string, number>()
  for (const v of verdicts) {
    nodeUses.set(v.nodeId, (nodeUses.get(v.nodeId) ?? 0) + 1)
    selectorUses.set(v.selector, (selectorUses.get(v.selector) ?? 0) + 1)
  }
  for (const v of verdicts) {
    if ((selectorUses.get(v.selector) ?? 0) > 1) {
      reject(
        v,
        "injective",
        `element ${v.selector} is claimed by more than one node`,
      )
    } else if ((nodeUses.get(v.nodeId) ?? 0) > 1) {
      reject(
        v,
        "injective",
        `node ${v.nodeId} is mapped to more than one element`,
      )
    }
  }

  // Rule 2: type-compatible.
  for (const v of verdicts) {
    if (v.outcome === "not_comparable") continue
    const node = nodesById.get(v.nodeId)
    const el = elementsBySelector.get(v.selector)
    if (!node || !el) continue
    const check = typeCompatible(node, el)
    if (!check.ok)
      reject(v, "type_compatible", check.note ?? "incompatible types")
  }

  // Rule 2b: text-consistent, and ONLY as a refutation.
  //
  // A design TEXT node carries the exact string the component renders — on the
  // real card all four match verbatim. But a design placeholder against live
  // data legitimately differs, so mere inequality proves nothing and must not
  // reject anything.
  //
  // What DOES prove something: this node's string is the text of a DIFFERENT
  // element the same proposal claims. Then the two are swapped, and nothing
  // about a placeholder can produce that. This is the discriminator that
  // replaces what position used to supply for two same-size siblings on one
  // row, where order alone drops the minimum set and can leave one liar
  // standing.
  const textOwners = new Map<string, string[]>()
  for (const v of verdicts) {
    const el = elementsBySelector.get(v.selector)
    const t = (el?.text ?? "").trim()
    if (!t) continue
    textOwners.set(t, [...(textOwners.get(t) ?? []), v.selector])
  }
  for (const v of verdicts) {
    if (v.outcome === "not_comparable") continue
    const node = nodesById.get(v.nodeId)
    const el = elementsBySelector.get(v.selector)
    const wanted = (node?.text ?? "").trim()
    if (!node || !el || !wanted) continue
    if ((el.text ?? "").trim() === wanted) continue
    const elsewhere = (textOwners.get(wanted) ?? []).filter(
      (sel) => sel !== v.selector,
    )
    if (elsewhere.length > 0) {
      reject(
        v,
        "text_consistent",
        `node text ${JSON.stringify(wanted)} belongs to ` +
          `${elsewhere.join(", ")}, not to ${v.selector}`,
      )
    }
  }

  // A box is needed by both remaining rules. Missing on either side is not a
  // wrong mapping, but it is not a checkable one either.
  const geometric: { v: PairVerdict; design: Box; dom: Box }[] = []
  for (const v of verdicts) {
    if (v.outcome === "not_comparable") continue
    const node = nodesById.get(v.nodeId)
    const el = elementsBySelector.get(v.selector)
    if (!node || !el) continue
    if (!node.box || !el.box || !design.root.box || !dom.root.box) {
      reject(v, "measurable", "no box on one side; correspondence unverifiable")
      continue
    }
    const normalised = normalise(
      node.box,
      design.root.box,
      dom.root.box,
      opts.scale,
    )
    // A zero or non-finite scale (or a root box carrying NaN) makes every
    // normalised coordinate Infinity or NaN. `NaN > tolerance` is FALSE, so rule 4 would
    // have ACCEPTED every pair — the failure mode this file exists to prevent,
    // arriving through arithmetic rather than through a bad proposal.
    if (!Object.values(normalised).every(Number.isFinite)) {
      reject(
        v,
        "measurable",
        "boxes could not be normalised (degenerate root box)",
      )
      continue
    }
    geometric.push({ v, design: normalised, dom: comparableBox(node, el) })
  }

  // Rule 3: order-consistent. Both sides are ranked in reading order and the
  // ranks must agree; pairs outside the longest agreeing run are rejected.
  if (geometric.length > 1) {
    const rank = (boxes: Box[]) => {
      const out = new Map<number, number>()
      const order = readingOrder(boxes)
      for (let r = 0; r < order.length; r++) out.set(order[r], r)
      return out
    }
    const designRank = rank(geometric.map((g) => g.design))
    const domRank = rank(geometric.map((g) => g.dom))
    const byDesign = geometric
      .map((_, idx) => idx)
      .sort((a, b) => (designRank.get(a) ?? 0) - (designRank.get(b) ?? 0))
    const keep = new Set(
      longestIncreasing(byDesign.map((idx) => domRank.get(idx) ?? 0)).map(
        (pos) => byDesign[pos],
      ),
    )
    for (let idx = 0; idx < geometric.length; idx++) {
      if (keep.has(idx)) continue
      reject(
        geometric[idx].v,
        "order_consistent",
        "reading order on the two sides disagrees about this pair",
      )
    }
  }

  // Rule 4: size-plausible, once both sides are in the same coordinate space.
  //
  // SIZE ONLY. Position is deliberately not consulted here — see
  // SIZE_TOLERANCE_PX. Whatever distance separates these two boxes is the
  // measurement the caller is about to take, and a rule that discarded the
  // pair for it would be answering the question with itself.
  for (const g of geometric) {
    if (g.v.outcome === "not_comparable") continue
    const dw = Math.abs(g.design.width - g.dom.width)
    const dh = Math.abs(g.design.height - g.dom.height)
    const worst = Math.max(dw, dh)
    if (!Number.isFinite(worst)) {
      reject(g.v, "measurable", "a box carries a non-finite coordinate")
      continue
    }
    if (worst > SIZE_TOLERANCE_PX) {
      reject(
        g.v,
        "size_plausible",
        `sizes differ by ${worst.toFixed(1)}px after normalisation, over the ` +
          `${SIZE_TOLERANCE_PX}px plausibility tolerance`,
      )
    }
  }

  // Rule 5: a container whose children all landed is the same container.
  //
  // Runs AFTER rule 4 and only rescues pairs rule 4 rejected for size. The
  // case is a frame the design draws at full width with its own padding, that
  // the code builds inside its parent's padding instead: 317 against 283,
  // which is exactly 2x17px, with the height matching and every child inside
  // it landing within a pixel. That is one container described two ways, not
  // two containers.
  //
  // Selector containment is what makes a child a child: the trees here are
  // flat and no rule walks upward, so a child is an element whose selector
  // starts with this one's plus " > ".
  //
  // It requires POSITIVE evidence — at least one mapped child, all of them
  // accepted. A container with no children in the proposal is not rescued:
  // "nothing contradicts it" is not the same claim as "its contents are in
  // the right place", and only the second one licenses ignoring a 34px
  // difference.
  // Applied until it stops changing anything, because a rescue can make its
  // PARENT rescuable and the pairs arrive parent-first. Measured on the real
  // card: a frame was judged while its child was still
  // rejected, and never revisited after the child was rescued -- one pair
  // short of a complete run, for no reason but iteration order.
  //
  // Terminates: a rescue only ever turns `not_comparable` into `accepted` and
  // never the reverse, so each pass that changes anything strictly increases
  // the accepted count, which is bounded by the number of pairs.
  let rescued = true
  while (rescued) {
    rescued = false
    for (const g of geometric) {
      if (g.v.outcome !== "not_comparable" || g.v.rule !== "size_plausible") {
        continue
      }
      const prefix = `${g.v.selector} > `
      const children = verdicts.filter((o) => o.selector.startsWith(prefix))
      if (children.length === 0) continue
      if (children.some((c) => c.outcome !== "accepted")) continue
      g.v.outcome = "accepted"
      delete g.v.rule
      delete g.v.note
      rescued = true
    }
  }

  const accepted = verdicts.filter((v) => v.outcome === "accepted")
  const failed = verdicts.length - accepted.length
  const rejected = verdicts.length === 0 || failed * 2 > verdicts.length
  return {
    pairs: verdicts,
    accepted,
    rejected,
    note: rejected
      ? `${failed} of ${verdicts.length} pairs failed verification — the ` +
        "proposal is unusable; fall back to root-and-counts"
      : undefined,
  }
}
