import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { chromium, type Browser } from "playwright"
import { fileURLToPath } from "node:url"
import { serve, type TestServer } from "../helpers/serve"
import { openPage } from "../../src/dom/open"
import { domTree } from "../../src/dom/tree"

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

async function cardTree() {
  const p = await openPage(
    { adapter: { kind: "url", url: `${server.origin}/card.html`, root: "#card" }, viewport: [800, 600] },
    { browser },
  )
  if ("notComparable" in p) throw new Error(p.notComparable)
  try {
    return await domTree(p)
  } finally {
    await p.close()
  }
}

describe("domTree", () => {
  it("lists the root first, in preorder, with selectors and own text", async () => {
    const tree = await cardTree()
    expect(tree.root).toBe(tree.elements[0])
    expect(tree.root.selector).toBe("#card")
    expect(tree.elements[1]).toMatchObject({ selector: "#card > :nth-child(1)", tag: "h2", text: "Title" })
    expect(tree.root.text).toBeUndefined()
  })

  it("records the glyph run as ink on a text leaf", async () => {
    const h2 = (await cardTree()).elements[1]
    expect(h2.ink).toBeDefined()
    expect(h2.ink!.width).toBeLessThan(h2.box!.width)
  })

  it("hidden element absent from tree", async () => {
    const tree = await cardTree()
    const texts = tree.elements.map((e) => e.text)
    expect(texts).toContain("visible")
    expect(tree.elements.map((e) => e.selector)).toEqual([
      "#card",
      "#card > :nth-child(1)",
      "#card > :nth-child(2)",
    ])
  })
})
