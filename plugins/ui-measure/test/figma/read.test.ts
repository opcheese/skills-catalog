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
})

describe("flatten", () => {
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
