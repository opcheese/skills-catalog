// @vitest-environment node
import { describe, expect, it } from "vitest"
import { decodePng } from "../../src/image/png"
import { probe } from "../../src/image/probe"
import { Canvas } from "../helpers/png"

// Glyph-like ink: 2px strokes every 4px, so text covers well under half its box, as real text does.
function text(canvas: Canvas, x: number, y: number, width: number, height: number, hex: string): Canvas {
  for (let i = x; i < x + width; i += 4) canvas.rect(i, y, 2, height, hex)
  return canvas
}

// A card at (40,50) 200x100, fill #f2f4f7, with two text lines of ink #1a1a1a inset 16 from the left
// and top: line 1 x 56-133 y 66-75, line 2 x 56-113 y 84-93 (pitch 18). A neighbour sits just right of
// the box.
function card(): Canvas {
  const canvas = new Canvas(400, 300, "#ffffff").rect(40, 50, 200, 100, "#f2f4f7")
  text(canvas, 56, 66, 80, 10, "#1a1a1a")
  text(canvas, 56, 84, 60, 10, "#1a1a1a")
  return canvas.rect(262, 50, 18, 18, "#d0021b")
}

const image = () => decodePng(card().png())

describe("probe", () => {
  it("snaps a loose box to the element's exact edges and reads its colours", () => {
    const r = probe(image(), { x: 30, y: 40, width: 230, height: 125 })
    expect(r.status).toBe("measured")
    expect(r.background).toBe("#ffffff")
    expect(r.boundsPx).toEqual({ x: 40, y: 50, width: 200, height: 100 })
    expect(r.clipped).toEqual([])
    expect(r.fill).toEqual({ hex: "#f2f4f7", coverage: expect.closeTo(0.965, 3) })
    expect(r.ink?.hex).toBe("#1a1a1a")
    expect(r.inkBounds).toEqual({ x: 56, y: 66, width: 78, height: 28 })
    expect(r.insets).toEqual({ top: 16, right: 106, bottom: 56, left: 16 })
    expect(r.lines).toEqual([
      { top: 66, bottom: 76, height: 10 },
      { top: 84, bottom: 94, height: 10 },
    ])
    expect(r.linePitch).toBe(18)
  })

  it("reports CSS pixels at the given scale", () => {
    const r = probe(image(), { x: 30, y: 40, width: 230, height: 125 }, { scale: 2 })
    expect(r.bounds).toEqual({ x: 20, y: 25, width: 100, height: 50 })
    expect(r.insets).toEqual({ top: 8, right: 53, bottom: 28, left: 8 })
    expect(r.linePitch).toBe(9)
    expect(r.lines[0]).toEqual({ top: 33, bottom: 38, height: 5 })
  })

  it("measures bare text: no own fill, ink against the background", () => {
    const r = probe(image(), { x: 52, y: 62, width: 90, height: 36 })
    expect(r.background).toBe("#f2f4f7")
    expect(r.fill).toBeNull()
    expect(r.ink?.hex).toBe("#1a1a1a")
    expect(r.boundsPx).toEqual({ x: 56, y: 66, width: 78, height: 28 })
    expect(r.insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it("names the sides where the element runs past the search area", () => {
    const big = decodePng(new Canvas(400, 300, "#ffffff").rect(40, 50, 300, 200, "#f2f4f7").png())
    const r = probe(big, { x: 35, y: 45, width: 60, height: 40 })
    expect(r.status).toBe("measured")
    expect(r.clipped.sort()).toEqual(["bottom", "right"])
  })

  it("returns nothing when the box holds only the surrounding colour", () => {
    const r = probe(image(), { x: 100, y: 110, width: 40, height: 20 })
    expect(r.status).toBe("nothing")
    expect(r.reason).toMatch(/surrounding colour/)
  })

  it("returns nothing for a box outside the image", () => {
    const r = probe(image(), { x: 500, y: 10, width: 20, height: 20 })
    expect(r.status).toBe("nothing")
    expect(r.reason).toMatch(/outside the image/)
  })

  it("is not fooled by a lighter tolerance: a faint card still separates from white", () => {
    const faint = decodePng(new Canvas(200, 200, "#ffffff").rect(50, 50, 80, 60, "#f7f7f7").png())
    expect(probe(faint, { x: 40, y: 40, width: 100, height: 80 }).boundsPx).toEqual({ x: 50, y: 50, width: 80, height: 60 })
  })

  it("keeps a drop shadow out of the box and reports it as a rim", () => {
    // White card on a white page, 4px soft shadow: a ring of greys fading outward.
    const canvas = new Canvas(300, 200, "#ffffff")
    const greys = ["#f5f5f5", "#ebebeb", "#e0e0e0", "#d4d4d4"]
    greys.forEach((g, i) => canvas.rect(36 + i, 46 + i, 168 - 2 * i, 88 - 2 * i, g))
    canvas.rect(40, 50, 160, 80, "#ffffff")
    text(canvas, 52, 62, 40, 12, "#18181b")
    const r = probe(decodePng(canvas.png()), { x: 28, y: 38, width: 184, height: 104 })
    expect(r.boundsPx).toEqual({ x: 40, y: 50, width: 160, height: 80 })
    expect(r.outerPx).toEqual({ x: 36, y: 46, width: 168, height: 88 })
    expect(r.rim).toEqual({
      top: { width: 4, kind: "shadow" },
      right: { width: 4, kind: "shadow" },
      bottom: { width: 4, kind: "shadow" },
      left: { width: 4, kind: "shadow" },
    })
    expect(r.fill?.hex).toBe("#ffffff")
    expect(r.ink?.hex).toBe("#18181b")
    expect(r.insets).toEqual({ top: 12, right: 110, bottom: 56, left: 12 })
  })

  it("counts a solid border as part of the box", () => {
    const canvas = new Canvas(300, 200, "#ffffff").rect(40, 50, 160, 80, "#e4e4e7").rect(41, 51, 158, 78, "#ffffff")
    text(canvas, 57, 67, 40, 12, "#18181b")
    const r = probe(decodePng(canvas.png()), { x: 30, y: 40, width: 180, height: 100 })
    expect(r.boundsPx).toEqual({ x: 40, y: 50, width: 160, height: 80 })
    expect(r.rim?.top).toEqual({ width: 1, kind: "border", hex: "#e4e4e7" })
    expect(r.fill?.hex).toBe("#ffffff")
    expect(r.insets).toEqual({ top: 17, right: 105, bottom: 51, left: 17 })
  })

  it("takes the text colour from the strong ink, not a faint tint around it", () => {
    // A faint tint above and below the text (a glass surface's gradient), not enclosing it.
    const canvas = new Canvas(300, 200, "#ffffff").rect(46, 56, 64, 2, "#f8fafe").rect(46, 80, 64, 2, "#f8fafe")
    text(canvas, 50, 60, 56, 18, "#296fe8")
    const r = probe(decodePng(canvas.png()), { x: 40, y: 50, width: 80, height: 40 })
    expect(r.fill).toBeNull()
    expect(r.ink?.hex).toBe("#296fe8")
    expect(r.boundsPx).toEqual({ x: 50, y: 60, width: 54, height: 18 })
    expect(r.lines).toEqual([{ top: 60, bottom: 78, height: 18 }])
  })

  it("calls a rim a shadow when its sides differ, even if each side is one colour", () => {
    const canvas = new Canvas(300, 200, "#ffffff").rect(39, 49, 162, 85, "#f0f0f0").rect(39, 130, 162, 4, "#dcdcdc")
    canvas.rect(40, 50, 160, 80, "#ffffff")
    text(canvas, 52, 62, 40, 12, "#18181b")
    const r = probe(decodePng(canvas.png()), { x: 30, y: 40, width: 180, height: 104 })
    expect(r.boundsPx).toEqual({ x: 40, y: 50, width: 160, height: 80 })
    expect(r.rim?.bottom.kind).toBe("shadow")
    expect(r.rim?.left.kind).toBe("shadow")
  })

  it("marks the ink colour approximate when no single colour dominates the strokes (resampled image)", () => {
    const canvas = new Canvas(200, 100, "#ffffff")
    const shades = ["#2a70e9", "#2b71ea", "#2c72eb", "#2d73ec", "#2e74ed", "#2f75ee", "#3076ef", "#3177f0"]
    for (let i = 0; i < 16; i++) canvas.rect(40 + i * 4, 30, 2, 12, shades[i % shades.length]!)
    const r = probe(decodePng(canvas.png()), { x: 30, y: 20, width: 90, height: 32 })
    expect(r.ink?.exact).toBe(false)
    expect(probe(image(), { x: 30, y: 40, width: 230, height: 125 }).ink?.exact).toBe(true)
  })

  it("warns when the colour around the box is mixed, because the background guess may be wrong", () => {
    const canvas = new Canvas(200, 100, "#ffffff").rect(0, 50, 200, 50, "#222222")
    text(canvas, 40, 30, 40, 10, "#d0021b")
    const r = probe(decodePng(canvas.png()), { x: 36, y: 26, width: 48, height: 22 })
    expect(r.warnings.join(" ")).toMatch(/surrounding colour is mixed/)
    expect(probe(image(), { x: 30, y: 40, width: 230, height: 125 }).warnings).toEqual([])
  })

  it("calls an uneven one-colour rim a shadow: borders are even, offset shadows are not", () => {
    const canvas = new Canvas(300, 200, "#ffffff").rect(39, 49, 162, 83, "#e8e8e8").rect(40, 50, 160, 80, "#ffffff")
    const r = probe(decodePng(canvas.png()), { x: 30, y: 40, width: 180, height: 100 })
    expect(r.rim?.bottom).toEqual({ width: 2, kind: "shadow" })
    expect(r.boundsPx).toEqual({ x: 40, y: 50, width: 160, height: 80 })
  })

  it("does not take dense bold text for a filled box", () => {
    const canvas = new Canvas(200, 100, "#ffffff")
    // Bold glyphs: 3px strokes, 3px letter spacing, each glyph a closed ring around its counter.
    for (let i = 0; i < 8; i++) canvas.rect(40 + i * 12, 30, 9, 14, "#18181b").rect(43 + i * 12, 33, 3, 8, "#ffffff")
    const r = probe(decodePng(canvas.png()), { x: 34, y: 24, width: 108, height: 26 })
    expect(r.fill).toBeNull()
    expect(r.ink?.hex).toBe("#18181b")
  })

  it("falls back to the image's edge for the background when the box leaves no room around it", () => {
    // The card covers most of the frame, so the card colour is the most common colour in the image.
    const frame = decodePng(new Canvas(200, 120, "#f4f4f5").rect(12, 12, 176, 96, "#ffffff").png())
    const r = probe(frame, { x: 2, y: 2, width: 196, height: 116 })
    expect(r.background).toBe("#f4f4f5")
    expect(r.boundsPx).toEqual({ x: 12, y: 12, width: 176, height: 96 })
    expect(r.clipped).toEqual([])
  })

  it("keeps content that touches the element's edge (zero padding) as ink", () => {
    const canvas = new Canvas(200, 100, "#ffffff").rect(40, 20, 100, 60, "#f2f4f7").rect(40, 40, 20, 10, "#18181b")
    const r = probe(decodePng(canvas.png()), { x: 30, y: 10, width: 120, height: 80 })
    expect(r.boundsPx).toEqual({ x: 40, y: 20, width: 100, height: 60 })
    expect(r.ink?.hex).toBe("#18181b")
    expect(r.insets).toEqual({ top: 20, right: 80, bottom: 30, left: 0 })
  })

  it("keeps a thick even border in the box", () => {
    const canvas = new Canvas(300, 200, "#ffffff").rect(40, 50, 160, 80, "#e4e4e7").rect(45, 55, 150, 70, "#ffffff")
    const r = probe(decodePng(canvas.png()), { x: 30, y: 40, width: 180, height: 100 })
    expect(r.boundsPx).toEqual({ x: 40, y: 50, width: 160, height: 80 })
    expect(r.rim?.left).toEqual({ width: 5, kind: "border", hex: "#e4e4e7" })
  })

  it("warns that an uneven one-colour rim is ambiguous (uneven border or offset shadow)", () => {
    const canvas = new Canvas(300, 200, "#ffffff").rect(39, 49, 162, 83, "#e8e8e8").rect(40, 50, 160, 80, "#ffffff")
    const r = probe(decodePng(canvas.png()), { x: 30, y: 40, width: 180, height: 100 })
    expect(r.warnings.join(" ")).toMatch(/uneven border or an offset shadow/)
  })

  it("keeps ink coverage within 0..1 when faint content is dropped from the box", () => {
    const canvas = new Canvas(200, 200, "#ffffff").rect(20, 100, 160, 1, "#f7f7f7").rect(100, 100, 2, 2, "#18181b")
    const r = probe(decodePng(canvas.png()), { x: 10, y: 10, width: 180, height: 180 })
    expect(r.ink!.coverage).toBeGreaterThan(0)
    expect(r.ink!.coverage).toBeLessThanOrEqual(1)
  })

  it("does not call a side clipped where the element meets the image's own edge", () => {
    const edge = decodePng(new Canvas(100, 60, "#ffffff").rect(0, 10, 30, 20, "#f2f4f7").png())
    const r = probe(edge, { x: 0, y: 4, width: 40, height: 32 })
    expect(r.clipped).toEqual([])
    expect(r.warnings.join(" ")).toMatch(/image edge: left/)
  })

  it("reads a solid shape with no inner detail as a fill with no ink", () => {
    const r = probe(decodePng(new Canvas(100, 100, "#ffffff").rect(40, 40, 16, 16, "#18181b").png()), { x: 30, y: 30, width: 36, height: 36 })
    expect(r.fill?.hex).toBe("#18181b")
    expect(r.ink).toBeNull()
  })
})
