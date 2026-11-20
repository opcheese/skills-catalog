// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { designFacts } from "../../src/figma/facts"

describe("design facts from a node", () => {
  it("reads the root's own geometry", () => {
    const f = designFacts({
      id: "1:1",
      name: "Card",
      cornerRadius: 20,
      strokeWeight: 1,
      absoluteBoundingBox: { x: 0, y: 0, width: 317, height: 282 },
    })
    expect(f.geometry.cornerRadius).toBe(20)
    expect(f.geometry.strokeWeight).toBe(1)
    expect(f.geometry.width).toBe(317)
    expect(f.geometry.height).toBe(282)
  })

  // A property BOUND to a variable is a design-system commitment. An unbound
  // one is a local decision. The gate treats them differently, so the binding
  // has to be carried, not just the number.
  it("records which properties are bound to a variable", () => {
    const f = designFacts({
      id: "1:1",
      cornerRadius: 20,
      boundVariables: {
        rectangleCornerRadii: {
          RECTANGLE_TOP_LEFT_CORNER_RADIUS: {
            type: "VARIABLE_ALIAS",
            id: "VariableID:11320:18032",
          },
        },
      },
    })
    expect(f.bound.cornerRadius).toBe("VariableID:11320:18032")
    expect(f.bound.strokeWeight).toBeUndefined()
  })

  // A binding key must name the property itself. `strokes` is the stroke
  // PAINT's colour alias; reading it as a width binding claims the design
  // commits the border width to a token when it does not.
  it("does not read a stroke COLOUR binding as a stroke WIDTH binding", () => {
    const f = designFacts({
      id: "1:1",
      strokeWeight: 1,
      boundVariables: {
        strokes: [{ type: "VARIABLE_ALIAS", id: "VariableID:1:450" }],
      },
    })
    expect(f.geometry.strokeWeight).toBe(1)
    expect(f.bound.strokeWeight).toBeUndefined()
  })

  it("does read a real stroke WIDTH binding", () => {
    const f = designFacts({
      id: "1:1",
      strokeWeight: 1,
      boundVariables: {
        strokeWeight: { type: "VARIABLE_ALIAS", id: "VariableID:9:9" },
      },
    })
    expect(f.bound.strokeWeight).toBe("VariableID:9:9")
  })

  // An absent property yields NO fact rather than a zero — EXCEPT where
  // Figma's silence is itself the value. The browser always resolves a number
  // for corners and border width, so a permanently-absent design side would
  // make those two permanently `not_comparable`.
  it("reads silence as zero when silence means 'none'", () => {
    const f = designFacts({ id: "1:1" })
    expect(f.geometry.cornerRadius).toBe(0)
    expect(f.geometry.strokeWeight).toBe(0)
  })

  it("leaves the corner radius absent when the corners differ", () => {
    const f = designFacts({ id: "1:1", rectangleCornerRadii: [8, 8, 0, 0] })
    expect("cornerRadius" in f.geometry).toBe(false)
  })

  it("leaves the stroke weight absent when the node is stroked", () => {
    const f = designFacts({ id: "1:1", strokes: [{ type: "SOLID" }] })
    expect("strokeWeight" in f.geometry).toBe(false)
  })

  // The width/height case is unchanged: no bounding box is genuine ignorance,
  // and there is no zero that could stand in for it.
  it("omits a size the node does not carry", () => {
    const f = designFacts({ id: "1:1" })
    expect("width" in f.geometry).toBe(false)
    expect("height" in f.geometry).toBe(false)
  })

  it("counts descendants per node type, recursively", () => {
    const f = designFacts({
      id: "1:1",
      children: [
        {
          id: "2",
          type: "FRAME",
          children: [
            { id: "3", type: "TEXT" },
            { id: "4", type: "TEXT" },
          ],
        },
        { id: "5", type: "RECTANGLE" },
      ],
    })
    expect(f.counts).toEqual({ FRAME: 1, TEXT: 2, RECTANGLE: 1 })
  })

  it("reads the card fixture", () => {
    const node = JSON.parse(
      readFileSync(
        path.join(__dirname, "../fixtures/figma/card.json"),
        "utf8",
      ),
    ).nodes["1:1"].document
    const f = designFacts(node)
    expect(f.geometry.cornerRadius).toBe(16)
    expect(f.geometry.strokeWeight).toBe(1)
    expect(f.geometry.width).toBe(320)
    expect(f.geometry.height).toBe(160)
    expect(f.bound.cornerRadius).toBeUndefined()
    expect(f.counts.TEXT).toBe(3)
  })
})
