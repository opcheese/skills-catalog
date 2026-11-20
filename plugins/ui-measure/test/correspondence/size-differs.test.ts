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
