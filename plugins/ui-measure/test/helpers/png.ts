import { deflateSync } from "node:zlib"

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) c = TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

export interface EncodeOptions {
  colorType?: 0 | 2 | 3 | 4 | 6
  interlace?: 0 | 1
  bitDepth?: number
  /** Row filter to use for every row (0-4). */
  filter?: 0 | 1 | 2 | 3 | 4
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Test-only PNG encoder for RGBA pixels. Palette mode builds a palette from the distinct colours. */
export function encodePng(width: number, height: number, rgba: Uint8Array, options: EncodeOptions = {}): Buffer {
  const colorType = options.colorType ?? 6
  const filter = options.filter ?? 0
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  const palette: number[] = []
  const paletteIndex = new Map<number, number>()
  const raw: number[][] = []
  for (let y = 0; y < height; y++) {
    const row: number[] = []
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const [r, g, b, a] = [rgba[o]!, rgba[o + 1]!, rgba[o + 2]!, rgba[o + 3]!]
      if (colorType === 6) row.push(r, g, b, a)
      else if (colorType === 2) row.push(r, g, b)
      else if (colorType === 0) row.push(r)
      else if (colorType === 4) row.push(r, a)
      else {
        const key = (r << 16) | (g << 8) | b
        if (!paletteIndex.has(key)) {
          paletteIndex.set(key, palette.length / 3)
          palette.push(r, g, b)
        }
        row.push(paletteIndex.get(key)!)
      }
    }
    raw.push(row)
  }
  const lines: number[] = []
  for (let y = 0; y < height; y++) {
    const row = raw[y]!
    const prev = y > 0 ? raw[y - 1]! : row.map(() => 0)
    lines.push(filter)
    for (let i = 0; i < row.length; i++) {
      const a = i >= channels ? row[i - channels]! : 0
      const b = prev[i]!
      const c = i >= channels ? prev[i - channels]! : 0
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]!
      lines.push((row[i]! - predictor) & 0xff)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = options.bitDepth ?? 8
  ihdr[9] = colorType
  ihdr[12] = options.interlace ?? 0
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)]
  if (colorType === 3) parts.push(chunk("PLTE", Buffer.from(palette)))
  parts.push(chunk("IDAT", deflateSync(Buffer.from(lines))), chunk("IEND", Buffer.alloc(0)))
  return Buffer.concat(parts)
}

/** A solid canvas with rectangles painted on it, for exact-geometry tests. */
export class Canvas {
  readonly data: Uint8Array
  constructor(readonly width: number, readonly height: number, background: string) {
    this.data = new Uint8Array(width * height * 4)
    this.rect(0, 0, width, height, background)
  }
  rect(x: number, y: number, w: number, h: number, hex: string, alpha = 255): this {
    const n = parseInt(hex.slice(1), 16)
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (i < 0 || j < 0 || i >= this.width || j >= this.height) continue
        const o = (j * this.width + i) * 4
        this.data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha], o)
      }
    }
    return this
  }
  png(options?: EncodeOptions): Buffer {
    return encodePng(this.width, this.height, this.data, options)
  }
}
