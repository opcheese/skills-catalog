// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  normalise,
  readingOrder,
  verifyMapping,
} from "../../src/correspondence/verify"
import type {
  Box,
  DesignNode,
  DesignTree,
  DomTree,
  Proposal,
  RejectionRule,
  Verification,
} from "../../src/correspondence/types"

// The design side is a hand-written, flattened Figma-shaped tree for a small
// device card. It is synthetic but keeps the two facts that shaped the rules:
// the design's origin is {x: 429, y: 214}, not zero, and the two buttons
// appear in the node's child order LOWER first while the DOM renders the upper
// one first. A fixture without those would not exercise the rules.
//
// The DOM side is hand-built too, because standing up a live browser inside a
// unit test would make this an integration test. It mirrors a typical
// component structure — title <p>, status icon + label, two reading
// icon/label pairs, a 190px <img>, two icon-only buttons — at the design's
// relative geometry, translated to a viewport origin and given sub-pixel
// drift.
type RawNode = {
  id: string
  name?: string
  type: string
  characters?: string
  absoluteBoundingBox?: DesignNode["box"]
  children?: RawNode[]
}
const bb = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
})
const cardNode: RawNode = {
  id: "7:953",
  type: "COMPONENT",
  name: "device=Unknown, status=On",
  absoluteBoundingBox: bb(429, 214, 317, 282),
  children: [
    {
      id: "7:887",
      type: "FRAME",
      name: "content",
      absoluteBoundingBox: bb(429, 214, 317, 282),
      children: [
        {
          id: "7:888",
          type: "SLOT",
          name: "Top content",
          absoluteBoundingBox: bb(429, 214, 317, 84),
          children: [
            {
              id: "7:889",
              type: "FRAME",
              name: "Title",
              absoluteBoundingBox: bb(445, 230, 127, 28),
              children: [
                {
                  id: "7:890",
                  type: "TEXT",
                  name: "Humidifier",
                  characters: "Humidifier",
                  absoluteBoundingBox: bb(445, 230, 127, 28),
                },
              ],
            },
            {
              id: "7:891",
              type: "FRAME",
              name: "description",
              absoluteBoundingBox: bb(445, 258, 285, 24),
              children: [
                {
                  id: "7:892",
                  type: "FRAME",
                  name: "Status",
                  absoluteBoundingBox: bb(445, 258, 47, 24),
                  children: [
                    {
                      id: "7:893",
                      type: "INSTANCE",
                      name: "Tag",
                      absoluteBoundingBox: bb(445, 264, 12, 12),
                      children: [
                        {
                          id: "I7:893;1",
                          type: "ELLIPSE",
                          name: "Bullet",
                          absoluteBoundingBox: bb(446.5, 265.5, 9, 9),
                        },
                      ],
                    },
                    {
                      id: "7:894",
                      type: "TEXT",
                      name: "Body",
                      characters: "On",
                      absoluteBoundingBox: bb(460, 258, 32, 24),
                    },
                  ],
                },
                {
                  id: "7:895",
                  type: "FRAME",
                  name: "Item 01",
                  absoluteBoundingBox: bb(500, 258, 59, 24),
                  children: [
                    {
                      id: "7:896",
                      type: "INSTANCE",
                      name: "Icon / Thermometer",
                      absoluteBoundingBox: bb(500, 260, 20, 20),
                      children: [
                        {
                          id: "I7:896;1",
                          type: "VECTOR",
                          name: "Vector",
                          absoluteBoundingBox: bb(506.7, 261.7, 6.7, 16.7),
                        },
                      ],
                    },
                    {
                      id: "7:897",
                      type: "TEXT",
                      name: "Body",
                      characters: "23℃",
                      absoluteBoundingBox: bb(524, 258, 35, 24),
                    },
                  ],
                },
                {
                  id: "7:898",
                  type: "FRAME",
                  name: "Item 02",
                  absoluteBoundingBox: bb(567, 258, 58, 24),
                  children: [
                    {
                      id: "7:899",
                      type: "INSTANCE",
                      name: "Icon / Settings",
                      absoluteBoundingBox: bb(567, 260, 20, 20),
                      children: [
                        {
                          id: "I7:899;1",
                          type: "VECTOR",
                          name: "Vector",
                          absoluteBoundingBox: bb(570.3, 263.3, 13.3, 13.3),
                        },
                      ],
                    },
                    {
                      id: "7:900",
                      type: "TEXT",
                      name: "Body",
                      characters: "70%",
                      absoluteBoundingBox: bb(591, 258, 34, 24),
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "7:901",
          type: "FRAME",
          name: "Top content",
          absoluteBoundingBox: bb(429, 298, 317, 198),
          children: [
            {
              id: "7:902",
              type: "FRAME",
              name: "Left",
              absoluteBoundingBox: bb(429, 298, 225, 198),
              children: [
                {
                  id: "7:903",
                  type: "FRAME",
                  name: "image",
                  absoluteBoundingBox: bb(447, 298, 190, 190),
                  children: [
                    {
                      id: "7:904",
                      type: "RECTANGLE",
                      name: "image 1",
                      absoluteBoundingBox: bb(447, 298, 190, 190),
                    },
                    {
                      id: "7:905",
                      type: "RECTANGLE",
                      name: "image 2",
                      absoluteBoundingBox: bb(447, 298, 190, 190),
                    },
                  ],
                },
              ],
            },
            {
              id: "7:906",
              type: "FRAME",
              name: "Right",
              absoluteBoundingBox: bb(654, 298, 92, 198),
              children: [
                // Lower button first: the design's own child order.
                {
                  id: "7:907",
                  type: "INSTANCE",
                  name: "Button",
                  absoluteBoundingBox: bb(678, 428, 52, 52),
                  children: [
                    {
                      id: "I7:907;1",
                      type: "INSTANCE",
                      name: "Icon / PowerOff",
                      absoluteBoundingBox: bb(692, 442, 24, 24),
                    },
                    {
                      id: "I7:907;2",
                      type: "TEXT",
                      name: "Button",
                      characters: "Button",
                      absoluteBoundingBox: bb(742, 444, 51, 20),
                    },
                    {
                      id: "I7:907;3",
                      type: "INSTANCE",
                      name: "Icon / Circle",
                      absoluteBoundingBox: bb(787, 442, 16, 16),
                    },
                  ],
                },
                {
                  id: "7:908",
                  type: "INSTANCE",
                  name: "Button",
                  absoluteBoundingBox: bb(678, 368, 52, 52),
                  children: [
                    {
                      id: "I7:908;1",
                      type: "INSTANCE",
                      name: "Icon / Thermometer",
                      absoluteBoundingBox: bb(692, 382, 24, 24),
                    },
                    {
                      id: "I7:908;2",
                      type: "TEXT",
                      name: "Button",
                      characters: "Button",
                      absoluteBoundingBox: bb(742, 384, 51, 20),
                    },
                    {
                      id: "I7:908;3",
                      type: "INSTANCE",
                      name: "Icon / Circle",
                      absoluteBoundingBox: bb(787, 382, 16, 16),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

function flatten(node: RawNode): DesignNode[] {
  const self: DesignNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    box: node.absoluteBoundingBox,
    ...(node.characters ? { text: node.characters } : {}),
  }
  const kids = node.children ?? []
  if (kids.length === 1 && kids[0].type === "TEXT") self.labelOnly = true
  return [self, ...kids.flatMap(flatten)]
}

const designNodes = flatten(cardNode)
const designTree: DesignTree = {
  root: designNodes[0],
  nodes: designNodes,
}

/** The design canvas origin. */
const D = { x: 429, y: 214 }
/** Where the harness puts the same card in the viewport. Deliberately not the
 *  design origin: a rule that compared raw coordinates would fail on all ten
 *  correct pairs. */
const V = { x: 41.5, y: 59 }
const at = (x: number, y: number, width: number, height: number) => ({
  x: x - D.x + V.x,
  y: y - D.y + V.y,
  width,
  height,
})

/** Design and DOM share one pixel size in every fixture below. */
const ONE = { scale: 1 }

const domTree: DomTree = {
  root: {
    selector: "[data-testid=generic-device-card]",
    tag: "div",
    testid: "generic-device-card",
    box: at(429, 214, 317, 282),
  },
  elements: [],
}
domTree.elements = [
  domTree.root,
  // Sub-pixel drift on a few boxes: a correct pair does not land exactly.
  {
    selector: "p.card-title",
    tag: "p",
    text: "Humidifier",
    box: at(445.6, 230, 126.8, 28),
  },
  { selector: "[data-slot=status] svg", tag: "svg", box: at(445, 264, 12, 12) },
  {
    selector: "[data-slot=status] span",
    tag: "span",
    text: "On",
    box: at(460.4, 258, 32, 24),
  },
  {
    selector: "[data-slot=reading-1] svg",
    tag: "svg",
    box: at(500, 260, 20, 20),
  },
  {
    selector: "[data-slot=reading-1] span",
    tag: "span",
    text: "23℃",
    box: at(524, 258, 35, 24),
  },
  {
    selector: "[data-slot=reading-2] svg",
    tag: "svg",
    box: at(567, 260, 20, 20),
  },
  {
    selector: "[data-slot=reading-2] span",
    tag: "span",
    text: "70%",
    box: at(591, 258, 34, 24),
  },
  { selector: "img", tag: "img", box: at(447, 298.5, 190, 190) },
  {
    selector: "button[data-slot=upper]",
    tag: "button",
    box: at(678, 368, 52, 52),
  },
  {
    selector: "button[data-slot=power]",
    tag: "button",
    box: at(678, 428, 51.7, 52),
  },
]

/** The correct mapping. Listed in the design node's own child order, which puts
 *  the POWER button (y 428) before the UPPER one (y 368) — the reverse of the
 *  DOM. Reading order, not document order, is what the order rule compares. */
const GOOD_MAPPING: Proposal = {
  pairs: [
    { nodeId: "7:890", selector: "p.card-title" },
    { nodeId: "7:893", selector: "[data-slot=status] svg" },
    { nodeId: "7:894", selector: "[data-slot=status] span" },
    { nodeId: "7:896", selector: "[data-slot=reading-1] svg" },
    { nodeId: "7:897", selector: "[data-slot=reading-1] span" },
    { nodeId: "7:899", selector: "[data-slot=reading-2] svg" },
    { nodeId: "7:900", selector: "[data-slot=reading-2] span" },
    { nodeId: "7:904", selector: "img" },
    { nodeId: "7:907", selector: "button[data-slot=power]" },
    { nodeId: "7:908", selector: "button[data-slot=upper]" },
  ],
  unmapped: {
    design: ["7:888", "7:889", "7:891"],
    impl: ["[data-slot=status]", "[data-slot=reading-1]"],
  },
}

function clone(p: Proposal): Proposal {
  return {
    pairs: p.pairs.map((pair) => ({ ...pair })),
    unmapped: { design: [...p.unmapped.design], impl: [...p.unmapped.impl] },
  }
}

/** Swap which element two nodes claim. */
function swapPairs(p: Proposal, a: number, b: number): Proposal {
  const out = clone(p)
  const tmp = out.pairs[a].selector
  out.pairs[a].selector = out.pairs[b].selector
  out.pairs[b].selector = tmp
  return out
}

/** Give every node the NEXT node's element. */
function shiftByOne(p: Proposal): Proposal {
  const out = clone(p)
  const selectors = p.pairs.map((pair) => pair.selector)
  out.pairs.forEach((pair, i) => {
    pair.selector = selectors[(i + 1) % selectors.length]
  })
  return out
}

function verdict(r: Verification, nodeId: string) {
  const found = r.pairs.find((p) => p.nodeId === nodeId)
  if (!found) throw new Error(`no verdict for ${nodeId}`)
  return found
}

function rulesUsed(r: Verification): RejectionRule[] {
  return [
    ...new Set(r.pairs.flatMap((p) => (p.rule === undefined ? [] : [p.rule]))),
  ]
}

describe("the fixtures themselves", () => {
  it("carries the design node, at a non-zero canvas origin", () => {
    expect(designTree.root.box).toEqual({
      x: 429,
      y: 214,
      width: 317,
      height: 282,
    })
    expect(designNodes).toHaveLength(32)
    expect(verdictNodeType("7:890")).toBe("TEXT")
    expect(verdictNodeType("7:904")).toBe("RECTANGLE")
    expect(verdictNodeType("7:907")).toBe("INSTANCE")
  })
})

function verdictNodeType(id: string): string | undefined {
  return designNodes.find((n) => n.id === id)?.type
}

describe("verifyMapping, one rule at a time", () => {
  it("accepts a correct mapping", () => {
    const r = verifyMapping(GOOD_MAPPING, designTree, domTree, ONE)
    expect(r.pairs.filter((p) => p.outcome !== "accepted")).toEqual([])
    expect(r.accepted).toHaveLength(10)
    expect(r.rejected).toBe(false)
  })

  it("rejects a pair naming something that is not in either tree", () => {
    const p = clone(GOOD_MAPPING)
    p.pairs[0].nodeId = "7:000"
    const r = verifyMapping(p, designTree, domTree, ONE)
    expect(r.pairs[0].outcome).toBe("not_comparable")
    expect(r.pairs[0].rule).toBe("resolvable")
  })

  it("uses the resolution note as the resolvable rejection note", () => {
    const p = clone(GOOD_MAPPING)
    p.pairs[0].selector = ".item"
    const r = verifyMapping(p, designTree, domTree, { ...ONE, notes: { ".item": "ambiguous: 2 elements" } })
    expect(r.pairs[0].rule).toBe("resolvable")
    expect(r.pairs[0].note).toBe("ambiguous: 2 elements")
  })

  it("rejects a mapping that claims one element for two nodes", () => {
    const p = clone(GOOD_MAPPING)
    p.pairs[4].selector = p.pairs[6].selector
    const r = verifyMapping(p, designTree, domTree, ONE)
    expect(verdict(r, "7:897").rule).toBe("injective")
    expect(verdict(r, "7:900").rule).toBe("injective")
    // Neither survives: nothing here can say which of the two was meant.
    expect(verdict(r, "7:897").outcome).toBe("not_comparable")
    expect(verdict(r, "7:900").outcome).toBe("not_comparable")
  })

  it("rejects a TEXT node mapped to an element with no text", () => {
    const p: Proposal = {
      pairs: [{ nodeId: "7:890", selector: "img" }],
      unmapped: { design: [], impl: [] },
    }
    const r = verifyMapping(p, designTree, domTree, ONE)
    expect(r.pairs[0].rule).toBe("type_compatible")
  })

  // Every shadcn text primitive is drawn in Figma as an INSTANCE wrapping one
  // TEXT node, and rendered in code as one element carrying its label
  // directly. Rejecting that pair rejected every Badge and every Button in
  // every component -- measured on a real component 2026-08-19, where it was the one
  // thing standing between the programme and its first recorded baseline.
  it("accepts a single-label container mapped to the element carrying it", () => {
    const p: Proposal = {
      // FRAME "Title", whose only child is the TEXT "Humidifier".
      pairs: [{ nodeId: "7:889", selector: "p.card-title" }],
      unmapped: { design: [], impl: [] },
    }
    const r = verifyMapping(p, designTree, domTree, ONE)
    expect(r.pairs[0].outcome).not.toBe("not_comparable")
  })

  it("rejects a container node mapped to a text leaf", () => {
    const p: Proposal = {
      pairs: [
        { nodeId: "7:907", selector: "[data-slot=reading-1] span" },
      ],
      unmapped: { design: [], impl: [] },
    }
    const r = verifyMapping(p, designTree, domTree, ONE)
    expect(r.pairs[0].rule).toBe("type_compatible")
  })

  it("drops a pair whose sizes cannot correspond once normalised", () => {
    // Title TEXT onto the status label: both are text, so only geometry can
    // separate them, and only after both sides are put in one coordinate space.
    // The separating quantity is SIZE — the title is the full card width, the
    // status label is not — and never position.
    const p: Proposal = {
      pairs: [{ nodeId: "7:890", selector: "[data-slot=status] span" }],
      unmapped: { design: [], impl: [] },
    }
    const r = verifyMapping(p, designTree, domTree, ONE)
    expect(r.pairs[0].rule).toBe("size_plausible")
    expect(r.pairs[0].note).toMatch(/after normalisation/)
  })

  // The whole point of the split, as a test rather than a comment: a pair that
  // is the RIGHT pair in the WRONG PLACE must reach the caller as a verified
  // pair, so the caller can report the displacement. The rule this replaced
  // discarded it, and the displacement was the defect.
  it("accepts a correct pair that has been displaced", () => {
    const target = "img"
    const el = domTree.elements.find((e) => e.selector === target)
    expect(el?.box).toBeDefined()
    const shifted: DomTree = {
      root: domTree.root,
      elements: domTree.elements.map((e) =>
        e.selector === target && e.box
          ? { ...e, box: { ...e.box, x: e.box.x + 45 } }
          : e,
      ),
    }
    const nodeId = GOOD_MAPPING.pairs.find((p) => p.selector === target)?.nodeId
    expect(nodeId).toBeDefined()
    const p: Proposal = {
      pairs: [{ nodeId: nodeId as string, selector: target }],
      unmapped: { design: [], impl: [] },
    }
    const r = verifyMapping(p, designTree, shifted, ONE)
    expect(r.pairs[0].outcome).toBe("accepted")
  })

  it("rejects the proposal wholesale when more than half the pairs fail", () => {
    const r = verifyMapping(shiftByOne(GOOD_MAPPING), designTree, domTree, ONE)
    expect(r.rejected).toBe(true)
    expect(r.note).toMatch(/fall back to root-and-counts/)
  })
})

// The real deliverable: a verifier that accepts a corrupted mapping is
// worthless, because its whole purpose is to stop arithmetic running on a wrong
// proposal. Each corruption below is applied to the mapping proven correct
// above, so nothing but the corruption differs.
describe("mutating a known-good mapping", () => {
  it("catches two nodes swapped onto each other's elements", () => {
    // The hardest swap available: the two reading LABELS. Same design type,
    // near-identical boxes, both carry text — type compatibility cannot see it,
    // and only the 67px of horizontal separation gives it away.
    const corrupted = swapPairs(GOOD_MAPPING, 4, 6)
    expect(corrupted.pairs[4].selector).toBe("[data-slot=reading-2] span")
    expect(corrupted.pairs[6].selector).toBe("[data-slot=reading-1] span")
    const r = verifyMapping(corrupted, designTree, domTree, ONE)
    expect(verdict(r, "7:897").outcome).toBe("not_comparable")
    expect(verdict(r, "7:900").outcome).toBe("not_comparable")
    // Caught by TEXT, not by position: each label's string is the text of the
    // other's element, and nothing but a swap produces that. This is what
    // replaced the whole-box rule — the two labels differ by 1px in width and
    // sit on one row, so size cannot separate them and order alone would drop
    // the minimum set and leave one liar standing.
    expect(verdict(r, "7:897").rule).toBe("text_consistent")
    expect(verdict(r, "7:900").rule).toBe("text_consistent")
    // And no collateral: the reading-2 icon, a pair that was never corrupted,
    // survives. Under the old rule it was dropped so the reading order could
    // be made consistent again; naming the two liars outright costs nothing.
    expect(verdict(r, "7:899").outcome).toBe("accepted")
    expect(r.accepted).toHaveLength(8)
    // Two of ten pairs: the PAIRS are dropped, the run survives. That is the
    // designed behaviour — wholesale rejection is the >half rule, tested above.
    expect(r.rejected).toBe(false)
  })

  it("catches the title TEXT node mapped to the image", () => {
    const corrupted = clone(GOOD_MAPPING)
    corrupted.pairs[0].selector = "img"
    corrupted.pairs[7].selector = "p.card-title"
    expect(corrupted.pairs[0].selector).toBe("img")
    const r = verifyMapping(corrupted, designTree, domTree, ONE)
    expect(verdict(r, "7:890").outcome).toBe("not_comparable")
    expect(verdict(r, "7:890").rule).toBe("type_compatible")
    expect(verdict(r, "7:904").outcome).toBe("not_comparable")
  })

  // The shift above is caught by type alone. This one cannot be: it rotates
  // the three same-type, same-size icons among themselves, so every pair stays
  // type-compatible and size-plausible, and only reading order disagrees.
  it("catches a rotation among same-type, same-size siblings", () => {
    const corrupted = clone(GOOD_MAPPING)
    const icons = [1, 3, 5]
    const selectors = icons.map((i) => corrupted.pairs[i].selector)
    icons.forEach((pairIndex, k) => {
      corrupted.pairs[pairIndex].selector = selectors[(k + 1) % icons.length]
    })
    const r = verifyMapping(corrupted, designTree, domTree, ONE)
    const dropped = icons.filter(
      (i) => verdict(r, corrupted.pairs[i].nodeId).outcome === "not_comparable",
    )
    expect(dropped.length).toBeGreaterThan(0)
    expect(rulesUsed(r)).toContain("order_consistent")
  })

  it("catches two nodes mapped to the same element", () => {
    const corrupted = clone(GOOD_MAPPING)
    corrupted.pairs[8].selector = corrupted.pairs[9].selector
    expect(corrupted.pairs[8].selector).toBe("button[data-slot=upper]")
    const r = verifyMapping(corrupted, designTree, domTree, ONE)
    expect(verdict(r, "7:907").rule).toBe("injective")
    expect(verdict(r, "7:908").rule).toBe("injective")
  })

  it("catches every mapping shifted by one position", () => {
    const corrupted = shiftByOne(GOOD_MAPPING)
    expect(corrupted.pairs[0].selector).toBe("[data-slot=status] svg")
    expect(corrupted.pairs[9].selector).toBe("p.card-title")
    const r = verifyMapping(corrupted, designTree, domTree, ONE)
    expect(r.rejected).toBe(true)
    expect(r.accepted.length).toBeLessThan(5)
    // One rule does all the work here, and that is now the honest reading: a
    // one-position shift crosses a type boundary at almost every pair, so
    // type-compatibility alone refuses 9 of 10 before any geometry is
    // consulted. The old assertion (more than one rule fires) was a property
    // of the whole-box rule, which rejected on position and therefore fired on
    // everything. The corruption below is the one that needs a second rule.
    expect(rulesUsed(r)).toEqual(["type_compatible"])
  })
  // Regression: the old comparator asked "are these within the band" pairwise,
  // which is not a transitive relation, so V8's sort returned a different
  // sequence depending on the order the boxes arrived in. Two sides that agree
  // about the layout would then rank differently for no reason but input
  // order, and rule 3 would reject correct pairs.
  it("orders the same regardless of the order boxes arrive in", () => {
    const boxes: Box[] = [
      { x: 30, y: 0, width: 10, height: 10 },
      { x: 20, y: 6, width: 10, height: 10 },
      { x: 10, y: 12, width: 10, height: 10 },
    ]
    const sequence = (order: number[]) =>
      readingOrder(order.map((i) => boxes[i])).map((r) => order[r])
    const straight = sequence([0, 1, 2])
    for (const permutation of [
      [2, 1, 0],
      [1, 2, 0],
      [0, 2, 1],
      [2, 0, 1],
      [1, 0, 2],
    ]) {
      expect(sequence(permutation)).toEqual(straight)
    }
  })

  // The second half of the same failure: a NaN arriving from the DOM side,
  // where normalisation is not involved. `NaN > tolerance` is false there too.
  // The poisoned field is a SIZE: identity no longer reads position at all.
  it("rejects rather than accepts when an element box carries NaN", () => {
    const target = GOOD_MAPPING.pairs[0].selector
    const poisoned: DomTree = {
      root: domTree.root,
      elements: domTree.elements.map((e) =>
        e.selector === target
          ? { ...e, box: { x: 0, y: 0, width: Number.NaN, height: 10 } }
          : e,
      ),
    }
    const r = verifyMapping(GOOD_MAPPING, designTree, poisoned, ONE)
    const v = r.pairs.find((p) => p.selector === target)
    expect(v?.outcome).toBe("not_comparable")
    expect(v?.note).toContain("non-finite")
  })

  // Regression: a degenerate normalisation made every coordinate Infinity or
  // NaN. `NaN > tolerance` is FALSE, so rule 4 accepted every pair — the
  // verifier failing open through arithmetic rather than through a bad
  // proposal. The roots' width ratio no longer exists as a way to get there;
  // a zero scale and a NaN root coordinate are the ways left.
  const expectNothingMeasurable = (r: Verification) => {
    expect(r.accepted.length).toBe(0)
    expect(r.rejected).toBe(true)
    // Rejected AT NORMALISATION, before rule 3 ranks NaN coordinates into an
    // arbitrary reading order and blames the wrong rule for it.
    for (const v of r.pairs) {
      expect(v.outcome).toBe("not_comparable")
      expect(v.rule).toBe("measurable")
      expect(v.note).toBeTruthy()
    }
  }

  it("rejects rather than accepts when the scale is zero", () => {
    const r = verifyMapping(GOOD_MAPPING, designTree, domTree, { scale: 0 })
    expectNothingMeasurable(r)
    for (const v of r.pairs) {
      expect(v.note).toBe("scale must be finite and greater than zero")
    }
  })

  it("rejects rather than accepts when the scale is NaN", () => {
    const r = verifyMapping(GOOD_MAPPING, designTree, domTree, {
      scale: Number.NaN,
    })
    expectNothingMeasurable(r)
    for (const v of r.pairs) {
      expect(v.note).toBe("scale must be finite and greater than zero")
    }
  })

  it("rejects a negative or infinite scale with the scale note", () => {
    for (const scale of [-1, Number.POSITIVE_INFINITY]) {
      const r = verifyMapping(GOOD_MAPPING, designTree, domTree, { scale })
      expectNothingMeasurable(r)
      for (const v of r.pairs) {
        expect(v.note).toBe("scale must be finite and greater than zero")
      }
    }
  })

  it("rejects rather than accepts when a root box carries NaN", () => {
    const poisonedRoot = { x: Number.NaN, y: 0, width: 317, height: 282 }
    const degenerate: DesignTree = {
      root: { ...designTree.root, box: poisonedRoot },
      nodes: designTree.nodes,
    }
    const r = verifyMapping(GOOD_MAPPING, degenerate, domTree, ONE)
    expectNothingMeasurable(r)
    for (const v of r.pairs) expect(v.note).toContain("degenerate root box")
  })
})

describe("normalise", () => {
  const designRoot = { x: 429, y: 214, width: 317, height: 282 }
  const domRoot = { x: 41.5, y: 59, width: 317, height: 282 }

  it("translates by the roots' origins", () => {
    expect(
      normalise(
        { x: 445, y: 230, width: 127, height: 28 },
        designRoot,
        domRoot,
        1,
      ),
    ).toEqual({ x: 57.5, y: 75, width: 127, height: 28 })
  })

  it("ignores root width: design root 300 wide, dom root 600 wide, scale 1 → a 100px box stays 100px", () => {
    const out = normalise(
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 0, y: 0, width: 300, height: 100 },
      { x: 0, y: 0, width: 600, height: 200 },
      1,
    )
    expect(out.width).toBe(100)
    expect(out.height).toBe(40)
  })

  it("multiplies sizes and offsets from the root by scale", () => {
    expect(
      normalise(
        { x: 429 + 40, y: 214 + 20, width: 100, height: 60 },
        designRoot,
        domRoot,
        0.5,
      ),
    ).toEqual({ x: 41.5 + 20, y: 59 + 10, width: 50, height: 30 })
  })
})

describe("a stated scale", () => {
  // scale is CSS px per design px: a 5px live root against a 10px design
  // root is 0.5, so a design box 200 wide is a CSS box 100 wide.
  const root = { x: 0, y: 0, width: 400, height: 200 }
  const check = (designWidth: number, domWidth: number, scale: number) =>
    verifyMapping(
      {
        pairs: [{ nodeId: "1:2", selector: "#r > :nth-child(1)" }],
        unmapped: { design: [], impl: [] },
      },
      {
        root: { id: "1:1", type: "FRAME", box: root },
        nodes: [
          { id: "1:1", type: "FRAME", box: root },
          {
            id: "1:2",
            type: "RECTANGLE",
            box: { x: 0, y: 0, width: designWidth, height: 20 },
          },
        ],
      },
      {
        root: { selector: "#r", tag: "div", box: root },
        elements: [
          { selector: "#r", tag: "div", box: root },
          {
            selector: "#r > :nth-child(1)",
            tag: "svg",
            box: { x: 0, y: 0, width: domWidth, height: 10 },
          },
        ],
      },
      { scale },
    ).pairs[0]

  it("matches a design 200 wide to a DOM box 100 wide at scale 0.5", () => {
    expect(check(200, 100, 0.5).outcome).toBe("accepted")
  })

  it("does not match the same boxes at scale 1", () => {
    expect(check(200, 100, 1).rule).toBe("size_plausible")
  })

  it("accepts a 7.9 design px (3.95 CSS px) difference at scale 0.5", () => {
    expect(check(200 + 7.9, 100, 0.5).outcome).toBe("accepted")
  })

  it("rejects a 8.1 design px (4.05 CSS px) difference at scale 0.5", () => {
    const v = check(200 + 8.1, 100, 0.5)
    expect(v.outcome).toBe("not_comparable")
    expect(v.rule).toBe("size_plausible")
  })
})

describe("a non-finite DOM box", () => {
  const root = { x: 0, y: 0, width: 100, height: 100 }
  const check = (box: Box, ink?: Box) =>
    verifyMapping(
      {
        pairs: [{ nodeId: "1:2", selector: "#r > :nth-child(1)" }],
        unmapped: { design: [], impl: [] },
      },
      {
        root: { id: "1:1", type: "FRAME", box: root },
        nodes: [
          { id: "1:1", type: "FRAME", box: root },
          {
            id: "1:2",
            type: "RECTANGLE",
            hugsWidth: ink !== undefined,
            box: { x: 0, y: 0, width: 10, height: 10 },
          },
        ],
      },
      {
        root: { selector: "#r", tag: "div", box: root },
        elements: [
          { selector: "#r", tag: "div", box: root },
          { selector: "#r > :nth-child(1)", tag: "svg", box, ink },
        ],
      },
      ONE,
    ).pairs[0]
  const fine = { x: 0, y: 0, width: 10, height: 10 }

  it("is not comparable when x is NaN", () => {
    const v = check({ ...fine, x: Number.NaN })
    expect(v.outcome).toBe("not_comparable")
    expect(v.rule).toBe("measurable")
  })

  it("is not comparable when y is Infinity", () => {
    const v = check({ ...fine, y: Number.POSITIVE_INFINITY })
    expect(v.outcome).toBe("not_comparable")
    expect(v.rule).toBe("measurable")
  })

  it("is not comparable when the ink carries NaN", () => {
    const v = check(fine, { ...fine, height: Number.NaN })
    expect(v.outcome).toBe("not_comparable")
    expect(v.rule).toBe("measurable")
  })
})

describe("a design node sized to its content", () => {
  const root = { x: 0, y: 0, width: 317, height: 282 }

  it("is compared against the element's ink, not its box", () => {
    const v = verifyMapping(
      {
        pairs: [{ nodeId: "1:2", selector: "#harness-root > :nth-child(1)" }],
        unmapped: { design: [], impl: [] },
      },
      {
        root: { id: "1:1", type: "FRAME", box: root },
        nodes: [
          { id: "1:1", type: "FRAME", box: root },
          {
            id: "1:2",
            type: "TEXT",
            text: "Humidifier",
            hugsWidth: true,
            box: { x: 17, y: 17, width: 127, height: 28 },
          },
        ],
      },
      {
        root: { selector: "#harness-root", tag: "div", box: root },
        elements: [
          { selector: "#harness-root", tag: "div", box: root },
          {
            selector: "#harness-root > :nth-child(1)",
            tag: "div",
            text: "Humidifier",
            box: { x: 17, y: 17, width: 283, height: 28 },
            ink: { x: 17, y: 17, width: 127, height: 28 },
          },
        ],
      },
      ONE,
    )
    expect(v.pairs[0].outcome).toBe("accepted")
  })

  it("still refuses when even the ink is the wrong size", () => {
    const v = verifyMapping(
      {
        pairs: [{ nodeId: "1:2", selector: "#harness-root > :nth-child(1)" }],
        unmapped: { design: [], impl: [] },
      },
      {
        root: { id: "1:1", type: "FRAME", box: root },
        nodes: [
          { id: "1:1", type: "FRAME", box: root },
          {
            id: "1:2",
            type: "TEXT",
            text: "Humidifier",
            hugsWidth: true,
            box: { x: 17, y: 17, width: 127, height: 28 },
          },
        ],
      },
      {
        root: { selector: "#harness-root", tag: "div", box: root },
        elements: [
          { selector: "#harness-root", tag: "div", box: root },
          {
            selector: "#harness-root > :nth-child(1)",
            tag: "div",
            text: "something else",
            box: { x: 17, y: 17, width: 283, height: 28 },
            ink: { x: 17, y: 17, width: 40, height: 28 },
          },
        ],
      },
      ONE,
    )
    expect(v.pairs[0].outcome).toBe("not_comparable")
  })

  it("falls back to the box when no ink was measured", () => {
    const v = verifyMapping(
      {
        pairs: [{ nodeId: "1:2", selector: "#harness-root > :nth-child(1)" }],
        unmapped: { design: [], impl: [] },
      },
      {
        root: { id: "1:1", type: "FRAME", box: root },
        nodes: [
          { id: "1:1", type: "FRAME", box: root },
          {
            id: "1:2",
            type: "TEXT",
            text: "y",
            hugsWidth: true,
            box: { x: 17, y: 17, width: 127, height: 28 },
          },
        ],
      },
      {
        root: { selector: "#harness-root", tag: "div", box: root },
        elements: [
          { selector: "#harness-root", tag: "div", box: root },
          {
            selector: "#harness-root > :nth-child(1)",
            tag: "div",
            text: "x",
            box: { x: 17, y: 17, width: 283, height: 28 },
          },
        ],
      },
      ONE,
    )
    // The texts differ on purpose: equal texts would keep this pair as
    // size_differs, and this test is about the size rule itself.
    expect(v.pairs[0].rule).toBe("size_plausible")
    expect(v.pairs[0].outcome).toBe("not_comparable")
  })

  it("does not consult ink when the design node does not hug", () => {
    const v = verifyMapping(
      {
        pairs: [{ nodeId: "1:2", selector: "#harness-root > :nth-child(1)" }],
        unmapped: { design: [], impl: [] },
      },
      {
        root: { id: "1:1", type: "FRAME", box: root },
        nodes: [
          { id: "1:1", type: "FRAME", box: root },
          {
            id: "1:2",
            type: "TEXT",
            text: "x",
            box: { x: 17, y: 17, width: 283, height: 28 },
          },
        ],
      },
      {
        root: { selector: "#harness-root", tag: "div", box: root },
        elements: [
          { selector: "#harness-root", tag: "div", box: root },
          {
            selector: "#harness-root > :nth-child(1)",
            tag: "div",
            text: "x",
            box: { x: 17, y: 17, width: 283, height: 28 },
            ink: { x: 17, y: 17, width: 40, height: 28 },
          },
        ],
      },
      ONE,
    )
    expect(v.pairs[0].outcome).toBe("accepted")
  })
})

describe("a container whose children all landed", () => {
  const root = { x: 0, y: 0, width: 317, height: 282 }
  const trees = (frameDom: Box, childOk: boolean) => ({
    proposal: {
      pairs: [
        { nodeId: "1:2", selector: "#harness-root > :nth-child(1)" },
        {
          nodeId: "1:3",
          selector: "#harness-root > :nth-child(1) > :nth-child(1)",
        },
        {
          nodeId: "1:5",
          selector: "#harness-root > :nth-child(1) > :nth-child(2)",
        },
      ],
      unmapped: { design: [], impl: [] },
    },
    design: {
      root: { id: "1:1", type: "FRAME", box: root },
      nodes: [
        { id: "1:1", type: "FRAME", box: root },
        {
          id: "1:2",
          type: "FRAME",
          name: "Top content",
          parentId: "1:1",
          box: { x: 0, y: 40, width: 317, height: 198 },
        },
        {
          id: "1:3",
          type: "FRAME",
          name: "Left",
          parentId: "1:2",
          box: { x: 17, y: 40, width: 223, height: 196 },
        },
        {
          id: "1:5",
          type: "FRAME",
          name: "Right",
          parentId: "1:2",
          box: { x: 240, y: 40, width: 60, height: 196 },
        },
      ],
    },
    dom: {
      root: { selector: "#harness-root", tag: "div", box: root },
      elements: [
        { selector: "#harness-root", tag: "div", box: root },
        {
          selector: "#harness-root > :nth-child(1)",
          tag: "div",
          box: frameDom,
        },
        {
          selector: "#harness-root > :nth-child(1) > :nth-child(1)",
          tag: "div",
          box: childOk
            ? { x: 17, y: 40, width: 223, height: 196 }
            : { x: 17, y: 40, width: 120, height: 196 },
        },
        {
          selector: "#harness-root > :nth-child(1) > :nth-child(2)",
          tag: "div",
          box: { x: 240, y: 40, width: 60, height: 196 },
        },
      ],
    },
  })

  it("is kept as size_differs when only its own box differs", () => {
    const t = trees({ x: 17, y: 40, width: 283, height: 196 }, true)
    const v = verifyMapping(t.proposal, t.design as never, t.dom as never, ONE)
    expect(v.pairs[0].outcome).toBe("size_differs")
  })

  it("is still refused when a child did not land", () => {
    const t = trees({ x: 17, y: 40, width: 283, height: 196 }, false)
    const v = verifyMapping(t.proposal, t.design as never, t.dom as never, ONE)
    expect(v.pairs[0].outcome).toBe("not_comparable")
  })

  it("is refused when it has no mapped children at all", () => {
    const t = trees({ x: 17, y: 40, width: 283, height: 196 }, true)
    t.proposal.pairs = [t.proposal.pairs[0]]
    const v = verifyMapping(t.proposal, t.design as never, t.dom as never, ONE)
    expect(v.pairs[0].outcome).toBe("not_comparable")
  })
})

describe("row assignment when boxes on one line have different heights", () => {
  it("puts a small centred dot on the line it sits on", () => {
    // The real description row, DOM side: a 22px tag at y=45, the 7.7px bullet
    // centred inside it at y=53.1, and the label beside them. The bullet's top
    // is 8.1px below the row top -- outside an 8px band, and plainly on the
    // same line. Under the band it opened a row of its own and sorted after
    // the whole description row instead of leading it. Its centre is 0.95px
    // from the tag's.
    const order = readingOrder([
      { x: 16, y: 45, width: 60, height: 22 },
      { x: 80, y: 46, width: 100, height: 20 },
      { x: 19.1, y: 53.1, width: 7.7, height: 7.7 },
      { x: 16, y: 75, width: 100, height: 20 },
    ])
    expect(order).toEqual([0, 2, 1, 3])
  })

  it("still separates two lines that merely sit close together", () => {
    // 2px apart and NOT on one line: two rows, whatever their x order. The
    // centres are 22px apart, far outside half of 20.
    const order = readingOrder([
      { x: 200, y: 22, width: 50, height: 20 },
      { x: 16, y: 0, width: 50, height: 20 },
    ])
    expect(order).toEqual([1, 0])
  })

  it("does not put an ancestor and its descendants on one row", () => {
    // These trees are NESTED: the card root contains every descendant, so a
    // rule reading shared vertical EXTENT puts the whole card on one row and
    // destroys top-to-bottom order entirely. Measured 2026-08-20 over the real
    // 23 pairs: extent overlap kept 20 of 23 where the 8px band kept 22.
    const order = readingOrder([
      { x: 16, y: 16, width: 283, height: 240 },
      { x: 100, y: 17, width: 190, height: 28 },
      { x: 17, y: 200, width: 281, height: 28 },
    ])
    expect(order).toEqual([0, 1, 2])
  })

  it("does not let a tall box swallow the line below it", () => {
    // A 60px container and a 20px text run that dips 5px into it. Their
    // centres are 35px apart -- far outside half of 20 -- so the text is its
    // own row.
    const order = readingOrder([
      { x: 16, y: 0, width: 100, height: 60 },
      { x: 16, y: 55, width: 100, height: 20 },
    ])
    expect(order).toEqual([0, 1])
  })
})

describe("a container whose child is itself rescued", () => {
  const root = { x: 0, y: 0, width: 317, height: 282 }

  it("is rescued too, however the proposal is ordered", () => {
    // Parent first, child second, grandchild third -- the real proposal's
    // order. The parent and the child BOTH differ only by their own box; the
    // grandchild lands exactly. One pass rescues the child and leaves the
    // parent judged against a child that was still rejected when it was read.
    const v = verifyMapping(
      {
        pairs: [
          { nodeId: "1:2", selector: "#harness-root > :nth-child(1)" },
          {
            nodeId: "1:3",
            selector: "#harness-root > :nth-child(1) > :nth-child(1)",
          },
          {
            nodeId: "1:4",
            selector:
              "#harness-root > :nth-child(1) > :nth-child(1) > :nth-child(1)",
          },
          // Second children, each landing exactly: a container is rescued only
          // when at least two of its children are good.
          {
            nodeId: "1:6",
            selector: "#harness-root > :nth-child(1) > :nth-child(2)",
          },
          {
            nodeId: "1:7",
            selector:
              "#harness-root > :nth-child(1) > :nth-child(1) > :nth-child(2)",
          },
        ],
        unmapped: { design: [], impl: [] },
      },
      {
        root: { id: "1:1", type: "FRAME", box: root },
        nodes: [
          { id: "1:1", type: "FRAME", box: root },
          {
            id: "1:2",
            type: "FRAME",
            name: "Top content",
            parentId: "1:1",
            box: { x: 0, y: 40, width: 317, height: 198 },
          },
          {
            id: "1:3",
            type: "FRAME",
            name: "Right",
            parentId: "1:2",
            box: { x: 240, y: 40, width: 77, height: 196 },
          },
          {
            id: "1:4",
            type: "FRAME",
            name: "Button",
            parentId: "1:3",
            box: { x: 253, y: 48, width: 40, height: 40 },
          },
          {
            id: "1:6",
            type: "FRAME",
            name: "Footer",
            parentId: "1:2",
            box: { x: 17, y: 238, width: 100, height: 20 },
          },
          {
            id: "1:7",
            type: "FRAME",
            name: "Badge",
            parentId: "1:3",
            box: { x: 245, y: 100, width: 30, height: 30 },
          },
        ],
      },
      {
        root: { selector: "#harness-root", tag: "div", box: root },
        elements: [
          { selector: "#harness-root", tag: "div", box: root },
          {
            selector: "#harness-root > :nth-child(1)",
            tag: "div",
            box: { x: 17, y: 40, width: 283, height: 196 },
          },
          {
            selector: "#harness-root > :nth-child(1) > :nth-child(1)",
            tag: "div",
            box: { x: 253, y: 40, width: 40, height: 196 },
          },
          {
            selector:
              "#harness-root > :nth-child(1) > :nth-child(1) > :nth-child(1)",
            tag: "div",
            box: { x: 253, y: 48, width: 40, height: 40 },
          },
          {
            selector: "#harness-root > :nth-child(1) > :nth-child(2)",
            tag: "div",
            box: { x: 17, y: 238, width: 100, height: 20 },
          },
          {
            selector:
              "#harness-root > :nth-child(1) > :nth-child(1) > :nth-child(2)",
            tag: "div",
            box: { x: 245, y: 100, width: 30, height: 30 },
          },
        ],
      },
      ONE,
    )
    // Parent and child are kept as size_differs (rule 5), the leaves accept.
    expect(v.pairs.map((p) => p.outcome)).toEqual([
      "size_differs",
      "size_differs",
      "accepted",
      "accepted",
      "accepted",
    ])
  })
})
