// Renders notice-card-design.png: the notice card as a designer's 2x frame export (368x208 frame, card at
// 24,24), from the same values as notice-card.json. Used by the screenshot-path eval as the only design.
// Run: node test/skill-eval/render-design.mjs
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
const dir = fileURLToPath(new URL(".", import.meta.url))
const html = `<!doctype html><html><head><style>
@font-face { font-family: Inter; src: url(file://${dir}font.ttf); font-weight: 100 900 }
body { margin: 0; width: 368px; height: 208px; background: #f4f4f5; font-family: Inter }
.card { position: absolute; left: 24px; top: 24px; width: 272px; height: 112px; padding: 24px;
  display: flex; flex-direction: column; gap: 12px; border-radius: 16px; background: #ffffff;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1) }
h2 { margin: 0; font: 600 20px/28px Inter; color: rgb(26, 51, 77) }
p { margin: 0; font: 400 14px/20px Inter; color: rgba(0, 0, 0, 0.5) }
</style></head><body><div class="card"><h2>Plan overview</h2><p>Everything you need in one place.</p></div></body></html>`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 368, height: 208 }, deviceScaleFactor: 2 })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: `${dir}notice-card-design.png` })
await browser.close()
