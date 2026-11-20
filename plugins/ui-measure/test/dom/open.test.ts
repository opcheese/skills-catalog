import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { chromium, type Browser } from "playwright"
import { fileURLToPath } from "node:url"
import { serve, type TestServer } from "../helpers/serve"
import { openPage, type OpenPage } from "../../src/dom/open"
import { domTree } from "../../src/dom/tree"

const PAGES = fileURLToPath(new URL("../fixtures/pages", import.meta.url))
const MODULES = fileURLToPath(new URL("../fixtures/modules", import.meta.url))

let browser: Browser
let server: TestServer

beforeAll(async () => {
  browser = await chromium.launch()
  server = await serve(PAGES, { "/wide.ttf": 1000 })
})
afterAll(async () => {
  await browser.close()
  await server.close()
})

async function open(spec: Parameters<typeof openPage>[0]): Promise<OpenPage> {
  const p = await openPage(spec, { browser })
  if ("notComparable" in p) throw new Error(`unexpected notComparable: ${p.notComparable}`)
  return p
}

describe("adapters", () => {
  it("designharness root is first child of #harness-root", async () => {
    const p = await open({
      adapter: { kind: "designharness", baseUrl: `${server.origin}/harness.html`, component: "card", state: "default" },
      viewport: [400, 400],
    })
    try {
      expect(p.rootSelector).toBe("#harness-root > :nth-child(1)")
      const tree = await domTree(p)
      expect(tree.root.testid).toBe("comp")
      expect(tree.root.selector).toBe("#harness-root > :nth-child(1)")
      expect(p.info.url).toContain("c=card")
      expect(p.info.url).toContain("state=default")
    } finally {
      await p.close()
    }
  })

  it("storybook root is first child of #storybook-root", async () => {
    const p = await open({
      adapter: { kind: "storybook", baseUrl: `${server.origin}/storybook/`, storyId: "ui-card--default" },
      viewport: [400, 400],
    })
    try {
      expect(p.rootSelector).toBe("#storybook-root > :nth-child(1)")
      expect((await domTree(p)).root.testid).toBe("story")
      expect(p.info.url).toContain("iframe.html?id=ui-card--default&viewMode=story")
    } finally {
      await p.close()
    }
  })
})

describe("not comparable", () => {
  it("a missing root is notComparable \"root ... not found\"", async () => {
    const r = await openPage(
      { adapter: { kind: "url", url: `${server.origin}/card.html`, root: "#nope" }, viewport: [400, 400] },
      { browser },
    )
    expect(r).toEqual({ notComparable: expect.stringMatching(/^root .* not found$/) })
  })

  it("HTTP 500 is notComparable", async () => {
    const r = await openPage(
      { adapter: { kind: "url", url: `${server.origin}/boom`, root: "body" }, viewport: [400, 400] },
      { browser },
    )
    expect(r).toEqual({ notComparable: expect.stringContaining("500") })
  })
})

describe("screen, scale and dpr", () => {
  it("screen.html renders differently at screen 1280x800 vs 1920x1080 with the same viewport", async () => {
    const widthAt = async (screen: [number, number]) => {
      const p = await open({
        adapter: { kind: "url", url: `${server.origin}/screen.html`, root: "#box" },
        viewport: [1000, 700],
        screen,
      })
      try {
        const computed = await p.page.evaluate(() => getComputedStyle(document.querySelector("#box")!).width)
        const tree = await domTree(p)
        expect(p.info.screen).toEqual(screen)
        expect(tree.root.box?.width).toBe(parseFloat(computed))
        return computed
      } finally {
        await p.close()
      }
    }
    expect(await widthAt([1280, 800])).toBe("200px")
    expect(await widthAt([1920, 1080])).toBe("100px")
  })

  it("card.html at root 10px and 5px gives scale 1 and 0.5 with designRootFontPx 10", async () => {
    const scaleAt = async (px: number) => {
      const p = await open({
        adapter: { kind: "url", url: `${server.origin}/card.html?root=${px}`, root: "#card" },
        viewport: [800, 600],
        designRootFontPx: 10,
      })
      try {
        return p.scale
      } finally {
        await p.close()
      }
    }
    expect(await scaleAt(10)).toBe(1)
    expect(await scaleAt(5)).toBe(0.5)
  })

  it("scale is 1 when no design root font size is configured", async () => {
    const p = await open({
      adapter: { kind: "url", url: `${server.origin}/card.html?root=5`, root: "#card" },
      viewport: [800, 600],
    })
    try {
      expect(p.scale).toBe(1)
    } finally {
      await p.close()
    }
  })

  it("boxes equal at dpr 1 and 2", async () => {
    const boxesAt = async (dpr: number) => {
      const p = await open({
        adapter: { kind: "url", url: `${server.origin}/card.html`, root: "#card" },
        viewport: [800, 600],
        dpr,
      })
      try {
        expect(p.info.dpr).toBe(dpr)
        return (await domTree(p)).elements.map((e) => e.box)
      } finally {
        await p.close()
      }
    }
    const one = await boxesAt(1)
    expect(one.length).toBeGreaterThan(1)
    expect(await boxesAt(2)).toEqual(one)
  })
})

describe("waiting and scripts", () => {
  it("fonts.html is measured after fonts are ready, not at the fallback width", async () => {
    const p = await open({
      adapter: { kind: "url", url: `${server.origin}/fonts.html`, root: "#label" },
      viewport: [400, 200],
    })
    try {
      const tree = await domTree(p)
      // 4 glyphs x 1em x 20px. The monospace fallback is about 48px.
      expect(tree.root.box?.width).toBeCloseTo(80, 1)
    } finally {
      await p.close()
    }
  })

  it("--mock module routes /api/x", async () => {
    const p = await open({
      adapter: { kind: "url", url: `${server.origin}/api.html`, root: "#app", mock: `${MODULES}/mock.mjs` },
      viewport: [400, 200],
    })
    try {
      expect(await p.page.textContent("#out")).toBe("mocked")
    } finally {
      await p.close()
    }
  })

  it("without a mock module /api/x answers for real", async () => {
    const p = await open({
      adapter: { kind: "url", url: `${server.origin}/api.html`, root: "#app" },
      viewport: [400, 200],
    })
    try {
      expect(await p.page.textContent("#out")).toBe("real")
    } finally {
      await p.close()
    }
  })

  it("--steps module clicks before measuring", async () => {
    const p = await open({
      adapter: { kind: "url", url: `${server.origin}/api.html`, root: "#app", steps: `${MODULES}/steps.mjs` },
      viewport: [400, 200],
    })
    try {
      const tree = await domTree(p)
      expect(tree.elements.some((e) => e.text === "clicked")).toBe(true)
    } finally {
      await p.close()
    }
  })
})
