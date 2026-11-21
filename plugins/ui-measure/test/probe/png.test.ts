// @vitest-environment node
import { describe, expect, it } from "vitest"
import { deflateSync } from "node:zlib"
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

  it("decodes independently built bytes: Paeth picks left where a wrong predictor would pick above", () => {
    // 2x2 greyscale, rows [10,20] and [30,40]; scanlines None then Paeth = [0,10,20, 4,20,10] (PNG spec).
    const image = decodePng(rawPng(2, 2, 0, [0, 10, 20, 4, 20, 10]))
    expect(Array.from(image.data).filter((_, i) => i % 4 === 0)).toEqual([10, 20, 30, 40])
  })

  it("applies tRNS transparency for RGB and greyscale images", () => {
    const rgb = decodePng(rawPng(2, 1, 2, [0, 0, 0, 0, 255, 0, 0], Buffer.from([0, 0, 0, 0, 0, 0])))
    expect(Array.from(rgb.data)).toEqual([255, 255, 255, 255, 255, 0, 0, 255])
    const grey = decodePng(rawPng(2, 1, 0, [0, 7, 9], Buffer.from([0, 7])))
    expect(Array.from(grey.data)).toEqual([255, 255, 255, 255, 9, 9, 9, 255])
  })

  it("refuses an image too large to decode before inflating it", () => {
    expect(() => decodePng(rawPng(100000, 100000, 6, [0]))).toThrow(/too large/)
  })

  it("refuses a truncated header with a setup error", () => {
    for (const n of [12, 20, 28]) expect(() => decodePng(sample().png().subarray(0, n))).toThrow(SetupError)
  })
})

/** A PNG assembled byte by byte from given (already filtered) scanlines, independent of the test encoder. */
function rawPng(width: number, height: number, colorType: number, scanlines: number[], trns?: Buffer): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    let c = 0xffffffff
    for (const b of body) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = colorType
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    ...(trns ? [chunk("tRNS", trns)] : []),
    chunk("IDAT", deflateSync(Buffer.from(scanlines))),
    chunk("IEND", Buffer.alloc(0)),
  ])
}
