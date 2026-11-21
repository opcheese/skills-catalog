// @vitest-environment node
import { describe, expect, it } from "vitest"
import { decodePng } from "../../src/image/png"
import { SetupError } from "../../src/errors"
import { Canvas } from "../helpers/png"

function sample(): Canvas {
  return new Canvas(7, 5, "#ffffff").rect(1, 1, 3, 2, "#123456").rect(5, 3, 2, 2, "#abcdef")
}

describe("decodePng", () => {
  for (const filter of [0, 1, 2, 3, 4] as const) {
    it(`round-trips RGBA with row filter ${filter}`, () => {
      const canvas = sample()
      const image = decodePng(canvas.png({ filter }))
      expect(image.width).toBe(7)
      expect(image.height).toBe(5)
      expect(Array.from(image.data)).toEqual(Array.from(canvas.data))
    })
  }

  it("decodes RGB and palette images to RGBA", () => {
    const canvas = sample()
    for (const colorType of [2, 3] as const) {
      expect(Array.from(decodePng(canvas.png({ colorType, filter: 4 })).data)).toEqual(Array.from(canvas.data))
    }
  })

  it("decodes greyscale and greyscale-alpha", () => {
    const canvas = new Canvas(3, 2, "#808080").rect(1, 0, 1, 1, "#202020")
    const grey = decodePng(canvas.png({ colorType: 0 }))
    expect(Array.from(grey.data.slice(4, 8))).toEqual([32, 32, 32, 255])
    const greyAlpha = decodePng(canvas.png({ colorType: 4 }))
    expect(Array.from(greyAlpha.data.slice(0, 4))).toEqual([128, 128, 128, 255])
  })

  it("composites transparent pixels over white", () => {
    const canvas = new Canvas(2, 1, "#000000").rect(1, 0, 1, 1, "#000000", 0)
    const image = decodePng(canvas.png())
    expect(Array.from(image.data.slice(4, 8))).toEqual([255, 255, 255, 255])
  })

  it("refuses what it cannot decode with a setup error that names the reason", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow(SetupError)
    expect(() => decodePng(sample().png({ interlace: 1 }))).toThrow(/interlaced/)
    expect(() => decodePng(sample().png({ bitDepth: 16 }))).toThrow(/bit depth 16/)
  })
})
