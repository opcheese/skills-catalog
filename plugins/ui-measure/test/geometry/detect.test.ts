import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { chromium, type Browser } from "playwright"
import { fileURLToPath } from "node:url"
import { serve, type TestServer } from "../helpers/serve"
import { openPage } from "../../src/dom/open"
import { detectGeometry, type GeometryConfig } from "../../src/geometry/detect"
import type { Finding } from "../../src/report/types"

const PAGES = fileURLToPath(new URL("../fixtures/pages", import.meta.url))

let browser: Browser
let server: TestServer
beforeAll(async () => {
  browser = await chromium.launch()
  server = await serve(PAGES)
})
afterAll(async () => {
  await browser.close()
  await server.close()
})

async function run(
  name: string,
  cfg: Partial<GeometryConfig> = {},
  root = "#root",
): Promise<{ findings: Finding[]; usable: boolean[] }> {
  const p = await openPage(
    { adapter: { kind: "url", url: `${server.origin}/${name}.html`, root }, viewport: [800, 600] },
    { browser },
  )
  if ("notComparable" in p) throw new Error(p.notComparable)
  try {
    const findings = await detectGeometry(p, { insetPx: 4, nonScrolling: [], ...cfg })
    const usable = await Promise.all(findings.map(async (f) => (await p.page.locator(f.target.selector).count()) === 1))
    return { findings, usable }
  } finally {
    await p.close()
  }
}

const CASES: { kind: string; page: string; cfg?: Partial<GeometryConfig> }[] = [
  { kind: "clipped", page: "geo-clipped" },
  { kind: "zero-size", page: "geo-zero" },
  { kind: "off-canvas", page: "geo-offcanvas" },
  { kind: "flush-edge", page: "geo-flush" },
  { kind: "scrollbar", page: "geo-scrollbar", cfg: { nonScrolling: ["#feed"] } },
]

describe("detectGeometry", () => {
  for (const c of CASES) {
    it(`${c.kind}: the bad page yields exactly one finding, the good twin none`, async () => {
      const bad = await run(`${c.page}-bad`, c.cfg)
      expect(bad.findings).toHaveLength(1)
      expect(bad.findings[0]).toMatchObject({ check: "geometry", kind: c.kind, status: "fail" })
      expect(bad.usable).toEqual([true])
      const good = await run(`${c.page}-good`, c.cfg)
      expect(good.findings).toEqual([])
    })
  }

  it("scrollbar finds nothing unless the selector is listed as non-scrolling", async () => {
    expect((await run("geo-scrollbar-bad")).findings).toEqual([])
  })

  it("flush-edge honours insetPx", async () => {
    expect((await run("geo-flush-good", { insetPx: 20 })).findings).toHaveLength(1)
  })

  it("elements that are not drawn are skipped", async () => {
    const { findings } = await run("geo-hidden")
    expect(findings).toEqual([])
  })

  it("text with no overflowing ancestor and no background raises nothing (card fixture)", async () => {
    expect((await run("card", {}, "#card")).findings).toEqual([])
  })
})
