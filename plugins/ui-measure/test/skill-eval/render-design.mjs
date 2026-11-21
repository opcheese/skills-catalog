// Renders notice-card-design.png: the notice card as a designer's 2x frame export (368x208 frame, card at
// 24,24), from the same values as notice-card.json. Used by the screenshot-path eval as the only design.
// Text is Noto Sans (OFL, a system font here, not committed): a real face, so the export looks like a real design.
// The eval copies the same two files into its work directory. Run: node test/skill-eval/render-design.mjs [FONT_DIR]
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
const dir = fileURLToPath(new URL(".", import.meta.url))
const fonts = process.argv[2] ?? "/usr/share/fonts/truetype/noto"
const html = `<!doctype html><html><head><style>
@font-face { font-family: Brand; src: url(https://fixture.local/NotoSans-Regular.ttf); font-weight: 400 }
@font-face { font-family: Brand; src: url(https://fixture.local/NotoSans-SemiBold.ttf); font-weight: 600 }
body { margin: 0; width: 368px; height: 208px; background: #f4f4f5; font-family: Brand }
.card { position: absolute; left: 24px; top: 24px; width: 272px; height: 112px; padding: 24px;
  display: flex; flex-direction: column; gap: 12px; border-radius: 16px; background: #ffffff;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1) }
h2 { margin: 0; font: 600 20px/28px Brand; color: rgb(26, 51, 77) }
p { margin: 0; font: 400 14px/20px Brand; color: rgba(0, 0, 0, 0.5) }
</style></head><body><div class="card"><h2>Plan overview</h2><p>Everything you need in one place.</p></div></body></html>`
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 368, height: 208 }, deviceScaleFactor: 2 })
// Serve the fonts to the page: a setContent page cannot load file:// fonts and silently falls back.
await page.route("https://fixture.local/*.ttf", (route) =>
  route.fulfill({ path: `${fonts}/${new URL(route.request().url()).pathname.slice(1)}` }))
await page.setContent(html)
for (const f of ["600 20px Brand", "400 14px Brand"]) {
  if (!(await page.evaluate(async (f) => (await document.fonts.load(f)).length, f))) throw new Error(`font ${f} did not load`)
}
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: `${dir}notice-card-design.png` })
await browser.close()
