// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { chromium, type Browser } from "playwright"
import { decodePng, type RgbaImage } from "../../src/image/png"
import { probe, type Box } from "../../src/image/probe"

// The control: a real browser render whose CSS we know. probe must recover the browser's own boxes
// from the pixels alone, at the screenshot's scale.
const HTML = `<!doctype html><html><body style="margin:0;background:#ffffff;font:16px/24px sans-serif">
<div id="card" style="position:absolute;left:24px;top:32px;width:280px;padding:16px;border-radius:12px;
  background:#f2f4f7;color:#1a1a1a">Hello world<br>Hello world</div>
<button id="cta" style="position:absolute;left:24px;top:160px;padding:12px 20px;border:0;border-radius:8px;
  background:#0b5fff;color:#ffffff;font:600 16px/24px sans-serif">Continue</button>
</body></html>`

let browser: Browser
let image: RgbaImage
const rects: Record<string, Box> = {}

beforeAll(async () => {
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 360, height: 240 }, deviceScaleFactor: 2 })
  await page.setContent(HTML)
  await page.evaluate(() => document.fonts.ready)
  for (const id of ["card", "cta"]) {
    rects[id] = await page.$eval(`#${id}`, (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })
  }
  image = decodePng(await page.screenshot())
}, 30_000)

afterAll(async () => browser?.close())

// A rough box the way a model would give it: the element plus a loose margin, in image pixels.
const rough = (r: Box, pad = 10): Box => ({ x: (r.x - pad) * 2, y: (r.y - pad) * 2, width: (r.width + 2 * pad) * 2, height: (r.height + 2 * pad) * 2 })

describe("probe on a real browser render at 2x", () => {
  it("recovers the card's CSS box, fill, text colour and line height", () => {
    const r = probe(image, rough(rects.card!), { scale: 2 })
    expect(r.status).toBe("measured")
    expect(r.clipped).toEqual([])
    for (const k of ["x", "y", "width", "height"] as const) expect(r.bounds![k]).toBeCloseTo(rects.card![k], 0)
    expect(r.fill?.hex).toBe("#f2f4f7")
    expect(r.ink?.hex).toBe("#1a1a1a")
    expect(r.lines).toHaveLength(2)
    expect(r.linePitch).toBe(24)
    // Ink starts at the padding edge on the left (glyph side bearing aside) and below it on top.
    expect(r.insets!.left).toBeGreaterThanOrEqual(16)
    expect(r.insets!.left).toBeLessThan(18)
    expect(r.insets!.top).toBeGreaterThan(16)
  })

  it("reads white text on a blue button as ink, not as the page showing through", () => {
    const r = probe(image, rough(rects.cta!), { scale: 2 })
    for (const k of ["x", "y", "width", "height"] as const) expect(r.bounds![k]).toBeCloseTo(rects.cta![k], 0)
    expect(r.fill?.hex).toBe("#0b5fff")
    expect(r.ink?.hex).toBe("#ffffff")
    expect(r.lines).toHaveLength(1)
    expect(r.insets!.left).toBeGreaterThanOrEqual(20)
    expect(r.insets!.left).toBeLessThan(22)
  })
})
