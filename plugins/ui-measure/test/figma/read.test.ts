// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { flatten, readNode } from "../../src/figma/read"

const card = JSON.parse(
  readFileSync(path.join(__dirname, "../fixtures/figma/card.json"), "utf8"),
)
const tree = () => flatten(readNode(card))
const byId = (id: string) => tree().nodes.find((n) => n.id === id)

describe("readNode", () => {
  it("unwraps a single-node response and a bare node alike", () => {
    const doc = readNode(card)
    expect(doc.id).toBe("1:1")
    expect(readNode(doc).id).toBe("1:1")
    expect(readNode(card, "1:1").id).toBe("1:1")
  })

  it("refuses a multi-node response without a node id", () => {
    const two = { nodes: { a: { document: { id: "a", type: "FRAME" } }, b: { document: { id: "b", type: "FRAME" } } } }
    expect(() => readNode(two)).toThrow(/pass --node-id/)
    expect(readNode(two, "b").id).toBe("b")
    expect(() => readNode(two, "z")).toThrow(/no node 'z'/)
  })
  it("rejects empty responses, null documents, and malformed bare nodes", () => {
    expect(() => readNode({ nodes: {} })).toThrow(/no nodes|empty/i)
    expect(() => readNode({ nodes: { a: { document: null } } })).toThrow(/node 'a'.*document/i)
    expect(() => readNode({})).toThrow(/id.*type|type.*id/i)
  })
})

describe("flatten", () => {
  it("refuses a hidden root with a clear reason", () => {
    expect(() => flatten({ id: "r", type: "FRAME", visible: false })).toThrow("design root is hidden")
  })

  it("carries per-corner radii in top-left, top-right, bottom-right, bottom-left order", () => {
    const t = flatten({ id: "r", type: "RECTANGLE", rectangleCornerRadii: [4, 8, 12, 16] })
    expect(t.root.radii).toEqual([4, 8, 12, 16])
    expect(t.root.radius).toBeUndefined()
  })
  it("skips visible:false nodes and their children", () => {
    const ids = tree().nodes.map((n) => n.id)
    expect(ids).toEqual(["1:1", "1:2", "1:3"])
  })

  it("card layout gap 12, padding [24,24,24,24]", () => {
    expect(byId("1:1")?.layout).toEqual({
      mode: "VERTICAL",
      gap: 12,
      padding: [24, 24, 24, 24],
    })
    expect(byId("1:1")?.radius).toBe(16)
    expect(byId("1:1")?.strokeWeight).toBe(1)
  })

  it("title font fields copied", () => {
    expect(byId("1:2")?.font).toEqual({
      family: "Inter",
      size: 20,
      weight: 600,
      lineHeight: 28,
    })
    expect(byId("1:3")?.font).toEqual({ family: "Inter", size: 14, weight: 400 })
    expect(byId("1:2")?.text).toBe("Plan overview")
    expect(byId("1:2")?.hugsWidth).toBe(true)
  })

  it("fill colour from the first visible SOLID fill", () => {
    // the hidden red fill comes first and must be ignored
    expect(byId("1:1")?.fill).toBe("#ffffff")
    expect(byId("1:2")?.fill).toBe("#1a334d")
    // paint opacity multiplies into alpha
    expect(byId("1:3")?.fill).toBe("rgba(0, 0, 0, 0.5)")
  })

  it("keeps visible effects only", () => {
    expect(byId("1:1")?.effects).toEqual(["DROP_SHADOW 0 4 8 rgba(0, 0, 0, 0.1)"])
  })

  it("sets parentId on every non-root node and not on the root", () => {
    const t = tree()
    expect(t.root.parentId).toBeUndefined()
    expect("parentId" in t.root).toBe(false)
    expect(t.nodes.filter((n) => n.id !== t.root.id).map((n) => n.parentId)).toEqual(["1:1", "1:1"])
  })

  it("marks a container that holds one label, counting visible children only", () => {
    const t = flatten({
      id: "r",
      type: "FRAME",
      children: [
        { id: "t", type: "TEXT", characters: "x" },
        { id: "h", type: "RECTANGLE", visible: false },
      ],
    })
    expect(t.root.labelOnly).toBe(true)
    expect(tree().root.labelOnly).toBeUndefined()
  })

  it("flatten output JSON contains no fileKey even when the response has one", () => {
    const withKey = {
      ...card,
      fileKey: "SECRETKEY123",
      nodes: {
        "1:1": {
          ...card.nodes["1:1"],
          document: { ...card.nodes["1:1"].document, fileKey: "SECRETKEY123" },
        },
      },
    }
    const out = JSON.stringify(flatten(readNode(withKey)))
    expect(out).not.toContain("SECRETKEY123")
    expect(out.toLowerCase()).not.toContain("filekey")
  })
})

describe("inferred node template", () => {
  it("reads like a REST node: the screenshot provenance fields are ignored by the engine", () => {
    const file = path.join(__dirname, "../../templates/inferred-node.json")
    const tree = flatten(readNode(JSON.parse(readFileSync(file, "utf8"))))
    const card = tree.nodes.find((n) => n.id === "inferred:1")!
    expect(card.box).toEqual({ x: 24, y: 24, width: 320, height: 160 })
    expect(card.layout).toMatchObject({ gap: 12, padding: [24, 24, 24, 24] })
    expect(card.radius).toBe(16)
    const heading = tree.nodes.find((n) => n.id === "inferred:2")!
    expect(heading.text).toBe("Plan overview")
    expect(heading.font).toMatchObject({ size: 20, weight: 600, lineHeight: 28 })
  })
})
