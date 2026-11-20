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
  extra: { designRootFontPx?: number; steps?: string } = {},
): Promise<{ findings: Finding[]; usable: boolean[] }> {
  const p = await openPage(
    { adapter: { kind: "url", url: `${server.origin}/${name.replace("?", ".html?")}${name.includes("?") ? "" : ".html"}`, root, ...(extra.steps ? { steps: extra.steps } : {}) }, viewport: [800, 600], ...(extra.designRootFontPx ? { designRootFontPx: extra.designRootFontPx } : {}) },
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

  it("off-canvas bottom: a box below the viewport is off-canvas only when the document cannot scroll", async () => {
    const bad = await run("geo-bottom-bad")
    expect(bad.findings.map((f) => f.kind)).toEqual(["off-canvas"])
    expect((await run("geo-bottom-good")).findings).toEqual([])
  })

  it("an overflow:hidden ancestor does not exempt a box outside the viewport", async () => {
    const bad = await run("geo-hiddenanc-bad")
    expect(bad.findings).toHaveLength(1)
    expect(bad.findings[0].kind).toBe("clipped")
    expect((await run("geo-hiddenanc-good")).findings).toEqual([])
  })

  it("right edge: overflow past the viewport width is off-canvas even on a vertically scrollable page", async () => {
    expect((await run("geo-right-bad")).findings.map((f) => f.kind)).toEqual(["off-canvas"])
    expect((await run("geo-right-good")).findings).toEqual([])
  })

  it("tolerance scales: at scale 0.5 the floor is 1px (1.5px fails, 0.8px passes)", async () => {
    const half = { designRootFontPx: 32 }
    expect((await run("geo-tol?clip=1.5", {}, "#root", half)).findings.map((f) => f.kind)).toEqual(["clipped"])
    expect((await run("geo-tol?clip=0.8", {}, "#root", half)).findings).toEqual([])
  })

  it("a page scrolled by a step is not off-canvas", async () => {
    const steps = fileURLToPath(new URL("../fixtures/modules/scroll-300.mjs", import.meta.url))
    expect((await run("geo-scrolled", {}, "#root", { steps })).findings).toEqual([])
  })

  it("a real scroll container exempts its overflowing content", async () => {
    expect((await run("geo-scrollanc-ok")).findings).toEqual([])
  })

  it("tolerance floor is 2px: 1.5px overhang passes, 3px fails (clipped)", async () => {
    expect((await run("geo-tol?clip=1.5")).findings).toEqual([])
    const bad = await run("geo-tol?clip=3")
    expect(bad.findings.map((f) => f.kind)).toEqual(["clipped"])
  })

  it("tolerance floor is 2px: 1.5px overhang passes, 3px fails (off-canvas)", async () => {
    expect((await run("geo-tol?off=1.5")).findings).toEqual([])
    const bad = await run("geo-tol?off=3")
    expect(bad.findings.map((f) => f.kind)).toEqual(["off-canvas"])
  })

  it("text with no overflowing ancestor and no background raises nothing (card fixture)", async () => {
    expect((await run("card", {}, "#card")).findings).toEqual([])
  })
})
