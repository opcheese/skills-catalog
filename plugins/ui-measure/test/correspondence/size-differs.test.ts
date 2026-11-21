// @vitest-environment node
import { describe, expect, it } from "vitest"
import { verifyMapping } from "../../src/correspondence/verify"
import type {
  Box,
  DesignNode,
  DesignTree,
  DomElement,
  DomTree,
  Proposal,
} from "../../src/correspondence/types"

// Synthetic trees, one root and a handful of children. Scale 1, so design and
// CSS pixels coincide and a 20px difference is 20px on both sides.
const bb = (x: number, y: number, width: number, height: number): Box => ({
  x,
  y,
  width,
  height,
})

const designOf = (nodes: DesignNode[]): DesignTree => ({
  root: nodes[0],
  nodes,
})
const domOf = (elements: DomElement[]): DomTree => ({
  root: elements[0],
  elements,
})
const proposalOf = (pairs: [string, string][]): Proposal => ({
  pairs: pairs.map(([nodeId, selector]) => ({ nodeId, selector })),
  unmapped: { design: [], impl: [] },
})
const ONE = { scale: 1 }

describe("a size-only failure kept as size_differs", () => {
  it("keeps a text-matching pair that is 20px taller", () => {
    const design = designOf([
      { id: "r", type: "FRAME", box: bb(0, 0, 200, 100) },
      { id: "t", type: "TEXT", text: "Title", box: bb(0, 0, 100, 20), parentId: "r" },
    ])
    const dom = domOf([
      { selector: "root", tag: "div", box: bb(0, 0, 200, 100) },
      { selector: "root > p", tag: "p", text: "Title", box: bb(0, 0, 100, 40) },
    ])
    const r = verifyMapping(proposalOf([["t", "root > p"]]), design, dom, ONE)
    expect(r.pairs[0].outcome).toBe("size_differs")
    expect(r.sizeDiffers.map((v) => v.nodeId)).toEqual(["t"])
    expect(r.accepted).toEqual([])
    // A kept pair is not a failure, so the proposal is not rejected for it.
    expect(r.rejected).toBe(false)
  })

  it("matches texts after collapsing whitespace", () => {
    const design = designOf([
      { id: "r", type: "FRAME", box: bb(0, 0, 200, 100) },
      { id: "t", type: "TEXT", text: "Save changes", box: bb(0, 0, 100, 20), parentId: "r" },
    ])
    const dom = domOf([
      { selector: "root", tag: "div", box: bb(0, 0, 200, 100) },
      { selector: "root > b", tag: "button", text: "Save  changes\n", box: bb(0, 0, 100, 40) },
    ])
    const r = verifyMapping(proposalOf([["t", "root > b"]]), design, dom, ONE)
    expect(r.pairs[0].outcome).toBe("size_differs")
  })

  // The brief's exact scenario: nothing but the container and its two
  // children. Rule 5 sees the same evidence, so it must report size_differs
  // rather than accepting a pair whose size failed.
  const twoKids = (): [DesignNode[], DomElement[]] => [
    [
      { id: "r", type: "FRAME", box: bb(0, 0, 300, 200) },
      { id: "c", type: "FRAME", box: bb(0, 0, 200, 50), parentId: "r" },
      { id: "a", type: "FRAME", box: bb(0, 0, 50, 50), parentId: "c" },
      { id: "b", type: "FRAME", box: bb(60, 0, 50, 50), parentId: "c" },
    ],
    [
      { selector: "root", tag: "div", box: bb(0, 0, 300, 200) },
      { selector: "root > c", tag: "div", box: bb(0, 0, 216, 50) },
      { selector: "root > c > a", tag: "div", box: bb(0, 0, 50, 50) },
      { selector: "root > c > b", tag: "div", box: bb(60, 0, 50, 50) },
    ],
  ]

  it("keeps a container 16px wider with exactly two accepted children as size_differs, not accepted", () => {
    const [nodes, els] = twoKids()
    const r = verifyMapping(
      proposalOf([
        ["c", "root > c"],
        ["a", "root > c > a"],
        ["b", "root > c > b"],
      ]),
      designOf(nodes),
      domOf(els),
      ONE,
    )
    const c = r.pairs.find((v) => v.nodeId === "c")
    expect(c?.outcome).toBe("size_differs")
    expect(c?.note).toContain("children")
    expect(r.accepted.map((v) => v.nodeId)).toEqual(["a", "b"])
    expect(r.sizeDiffers.map((v) => v.nodeId)).toEqual(["c"])
  })

  it("leaves a container 16px wider with one accepted child and nothing else not_comparable", () => {
    const [nodes, els] = twoKids()
    const r = verifyMapping(
      proposalOf([
        ["c", "root > c"],
        ["a", "root > c > a"],
      ]),
      designOf(nodes),
      domOf(els),
      ONE,
    )
    const c = r.pairs.find((v) => v.nodeId === "c")
    expect(c?.outcome).toBe("not_comparable")
    expect(c?.rule).toBe("size_plausible")
  })

  // Two accepted children and one rejected child: rule 5 does not rescue the
  // container (a child failed), so this is the case the new rule decides.
  const containerDesign = (): DesignNode[] => [
    { id: "r", type: "FRAME", box: bb(0, 0, 300, 200) },
    { id: "c", type: "FRAME", box: bb(0, 0, 200, 50), parentId: "r" },
    { id: "a", type: "FRAME", box: bb(0, 0, 50, 50), parentId: "c" },
    { id: "b", type: "FRAME", box: bb(60, 0, 50, 50), parentId: "c" },
    { id: "x", type: "TEXT", text: "Gone", box: bb(120, 0, 30, 50), parentId: "c" },
  ]
  const containerDom = (): DomElement[] => [
    { selector: "root", tag: "div", box: bb(0, 0, 300, 200) },
    { selector: "root > c", tag: "div", box: bb(0, 0, 216, 50) },
    { selector: "root > c > a", tag: "div", box: bb(0, 0, 50, 50) },
    { selector: "root > c > b", tag: "div", box: bb(60, 0, 50, 50) },
    { selector: "root > c > x", tag: "i", box: bb(120, 0, 30, 50) },
  ]

  it("keeps a container 16px wider whose two children are accepted pairs under its design node", () => {
    const r = verifyMapping(
      proposalOf([
        ["c", "root > c"],
        ["a", "root > c > a"],
        ["b", "root > c > b"],
        ["x", "root > c > x"],
      ]),
      designOf(containerDesign()),
      domOf(containerDom()),
      ONE,
    )
    const by = (id: string) => r.pairs.find((v) => v.nodeId === id)
    expect(by("a")?.outcome).toBe("accepted")
    expect(by("b")?.outcome).toBe("accepted")
    expect(by("x")?.rule).toBe("type_compatible")
    expect(by("c")?.outcome).toBe("size_differs")
  })

  it("leaves a container 16px wider with one accepted child not_comparable", () => {
    const r = verifyMapping(
      proposalOf([
        ["c", "root > c"],
        ["a", "root > c > a"],
        ["x", "root > c > x"],
      ]),
      designOf(containerDesign()),
      domOf(containerDom()),
      ONE,
    )
    const c = r.pairs.find((v) => v.nodeId === "c")
    expect(c?.outcome).toBe("not_comparable")
    expect(c?.rule).toBe("size_plausible")
    expect(r.sizeDiffers).toEqual([])
  })

  it("does not count children whose design parent is another node", () => {
    const nodes = containerDesign().map((n) =>
      n.id === "b" ? { ...n, parentId: "r" } : n,
    )
    const r = verifyMapping(
      proposalOf([
        ["c", "root > c"],
        ["a", "root > c > a"],
        ["b", "root > c > b"],
        ["x", "root > c > x"],
      ]),
      designOf(nodes),
      domOf(containerDom()),
      ONE,
    )
    expect(r.pairs.find((v) => v.nodeId === "c")?.outcome).toBe("not_comparable")
  })

  it("does not rescue with exactly two DOM descendants belonging to unrelated design nodes", () => {
    const [nodes, els] = twoKids()
    const unrelated = nodes.map((n) =>
      n.id === "a" || n.id === "b" ? { ...n, parentId: "r" } : n,
    )
    const r = verifyMapping(
      proposalOf([
        ["c", "root > c"],
        ["a", "root > c > a"],
        ["b", "root > c > b"],
      ]),
      designOf(unrelated),
      domOf(els),
      ONE,
    )
    expect(r.pairs.find((v) => v.nodeId === "c")?.outcome).toBe("not_comparable")
    expect(r.pairs.find((v) => v.nodeId === "c")?.rule).toBe("size_plausible")
  })

  it("keeps a wrong type and wrong size not_comparable with the type rule", () => {
    const design = designOf([
      { id: "r", type: "FRAME", box: bb(0, 0, 200, 100) },
      { id: "t", type: "TEXT", text: "Title", box: bb(0, 0, 100, 20), parentId: "r" },
    ])
    const dom = domOf([
      { selector: "root", tag: "div", box: bb(0, 0, 200, 100) },
      { selector: "root > d", tag: "div", box: bb(0, 0, 100, 60) },
    ])
    const r = verifyMapping(proposalOf([["t", "root > d"]]), design, dom, ONE)
    expect(r.pairs[0].outcome).toBe("not_comparable")
    expect(r.pairs[0].rule).toBe("type_compatible")
  })

  it("does not keep a size-failed pair whose text differs", () => {
    const design = designOf([
      { id: "r", type: "FRAME", box: bb(0, 0, 200, 100) },
      { id: "t", type: "TEXT", text: "Title", box: bb(0, 0, 100, 20), parentId: "r" },
    ])
    const dom = domOf([
      { selector: "root", tag: "div", box: bb(0, 0, 200, 100) },
      { selector: "root > p", tag: "p", text: "Other", box: bb(0, 0, 100, 60) },
    ])
    const r = verifyMapping(proposalOf([["t", "root > p"]]), design, dom, ONE)
    expect(r.pairs[0].outcome).toBe("not_comparable")
    expect(r.pairs[0].rule).toBe("size_plausible")
  })
})

describe("a text-matched size_differs child counts for its parent", () => {
  // Two children: a frame that landed, and a label whose text matches but is 20px
  // taller. The root is 40px wider than the design. Rule 5 needs EVERY mapped child to
  // be good, and the label is good only through its text, so the text evidence must be
  // applied before rule 5 or the root is dropped for the very child that vouches for it.
  it("keeps the root when its text-matched child is the only thing that differs", () => {
    const design = designOf([
      { id: "r", type: "FRAME", box: bb(0, 0, 300, 100) },
      { id: "a", type: "FRAME", box: bb(0, 0, 50, 50), parentId: "r" },
      { id: "t", type: "TEXT", text: "Hi", box: bb(0, 60, 100, 20), parentId: "r" },
    ])
    const dom = domOf([
      { selector: "root", tag: "div", box: bb(0, 0, 340, 100) },
      { selector: "root > a", tag: "div", box: bb(0, 0, 50, 50) },
      { selector: "root > p", tag: "p", text: "Hi", box: bb(0, 60, 100, 40) },
    ])
    const r = verifyMapping(
      proposalOf([["r", "root"], ["a", "root > a"], ["t", "root > p"]]),
      design,
      dom,
      ONE,
    )
    expect(r.accepted.map((v) => v.nodeId)).toEqual(["a"])
    expect(r.sizeDiffers.map((v) => v.nodeId).sort()).toEqual(["r", "t"])
    expect(r.pairs.filter((v) => v.outcome === "not_comparable")).toEqual([])
  })
})

describe("authoritative pairs skip the plausibility rules", () => {
  const iconTrees = (): [DesignTree, DomTree] => [
    designOf([
      { id: "r", type: "FRAME", box: bb(0, 0, 300, 200) },
      { id: "i", type: "VECTOR", box: bb(0, 0, 74, 74), parentId: "r" },
    ]),
    domOf([
      { selector: "root", tag: "div", box: bb(0, 0, 300, 200) },
      { selector: "root > svg", tag: "svg", box: bb(0, 0, 121, 121) },
    ]),
  ]
  const withFlag = (p: Proposal, authoritative: boolean): Proposal => (authoritative ? { ...p, authoritative: true } : p)

  it("authoritative icon 121 vs 74 px is accepted", () => {
    const [design, dom] = iconTrees()
    const r = verifyMapping(withFlag(proposalOf([["i", "root > svg"]]), true), design, dom, ONE)
    expect(r.pairs[0].outcome).toBe("accepted")
    expect(r.rejected).toBe(false)
  })

  it("proposer pairs still drop it", () => {
    const [design, dom] = iconTrees()
    const r = verifyMapping(proposalOf([["i", "root > svg"]]), design, dom, ONE)
    expect(r.pairs[0].outcome).toBe("not_comparable")
    expect(r.pairs[0].rule).toBe("size_plausible")
  })

  it("authoritative swapped text is accepted and its text compared", () => {
    const design = designOf([
      { id: "r", type: "FRAME", box: bb(0, 0, 300, 200) },
      { id: "a", type: "TEXT", text: "Alpha", box: bb(0, 0, 100, 20), parentId: "r" },
      { id: "b", type: "TEXT", text: "Beta", box: bb(0, 30, 100, 20), parentId: "r" },
    ])
    const dom = domOf([
      { selector: "root", tag: "div", box: bb(0, 0, 300, 200) },
      { selector: "root > p:nth-child(1)", tag: "p", text: "Beta", box: bb(0, 0, 100, 20) },
      { selector: "root > p:nth-child(2)", tag: "p", text: "Alpha", box: bb(0, 30, 100, 20) },
    ])
    const swapped = proposalOf([
      ["a", "root > p:nth-child(1)"],
      ["b", "root > p:nth-child(2)"],
    ])
    const proposer = verifyMapping(swapped, design, dom, ONE)
    expect(proposer.pairs.map((p) => p.rule)).toEqual(["text_consistent", "text_consistent"])
    const auth = verifyMapping(withFlag(swapped, true), design, dom, ONE)
    expect(auth.pairs.map((p) => p.outcome)).toEqual(["accepted", "accepted"])
  })
})

describe("authoritative pairs still need measurable boxes", () => {
  it.each([
    ["x", { x: Number.NaN, y: 0, width: 10, height: 10 }],
    ["width", { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 }],
  ])("a non-finite DOM %s is not_comparable by measurable", (_name, box) => {
    const design = designOf([
      { id: "r", type: "FRAME", box: bb(0, 0, 100, 100) },
      { id: "i", type: "VECTOR", box: bb(0, 0, 10, 10), parentId: "r" },
    ])
    const dom = domOf([
      { selector: "root", tag: "div", box: bb(0, 0, 100, 100) },
      { selector: "root > svg", tag: "svg", box },
    ])
    const p: Proposal = { pairs: [{ nodeId: "i", selector: "root > svg" }], unmapped: { design: [], impl: [] }, authoritative: true }
    const v = verifyMapping(p, design, dom, ONE).pairs[0]
    expect(v.outcome).toBe("not_comparable")
    expect(v.rule).toBe("measurable")
  })
})
