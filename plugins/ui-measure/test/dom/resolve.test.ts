import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { chromium, type Browser } from "playwright"
import { fileURLToPath } from "node:url"
import { serve, type TestServer } from "../helpers/serve"
import { openPage, type OpenPage } from "../../src/dom/open"
import { domTree } from "../../src/dom/tree"
import { resolveProposal } from "../../src/dom/resolve"

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

async function resolveOne(selector: string) {
  const p = await openPage(
    { adapter: { kind: "url", url: `${server.origin}/pairs.html`, root: "#root" }, viewport: [800, 600] },
    { browser },
  )
  if ("notComparable" in p) throw new Error(p.notComparable)
  try {
    const dom = await domTree(p as OpenPage)
    const out = await resolveProposal(p, dom, {
      pairs: [{ nodeId: "1:1", selector }],
      unmapped: { design: [], impl: [] },
      authoritative: true,
      unmappedReasons: { x: "y" },
    })
    return { selector: out.proposal.pairs[0].selector, notes: out.notes, proposal: out.proposal }
  } finally {
    await p.close()
  }
}

describe("resolveProposal", () => {
  it("walker paths pass through unchanged", async () => {
    const r = await resolveOne("#root > :nth-child(1)")
    expect(r.selector).toBe("#root > :nth-child(1)")
    expect(r.notes).toEqual({})
    expect(r.proposal.authoritative).toBe(true)
    expect(r.proposal.unmappedReasons).toEqual({ x: "y" })
  })
  it("test id resolves to the walker path", async () => {
    const r = await resolveOne("[data-testid=card]")
    expect(r.selector).toBe("#root > :nth-child(2)")
    expect(r.notes).toEqual({})
  })
  it("aria-label selector resolves", async () => {
    const r = await resolveOne('button[aria-label="Back"]')
    expect(r.selector).toBe("#root > :nth-child(1)")
  })
  it("a nested element resolves through its wrapper", async () => {
    const r = await resolveOne("h2")
    expect(r.selector).toBe("#root > :nth-child(2) > :nth-child(1) > :nth-child(1)")
  })
  it("ambiguous selector", async () => {
    const r = await resolveOne(".item")
    expect(r.selector).toBe(".item")
    expect(r.notes[".item"]).toBe("ambiguous: 2 elements")
  })
  it("no match", async () => {
    expect((await resolveOne(".nope")).notes[".nope"]).toBe("no element")
  })
  it("outside the root", async () => {
    expect((await resolveOne(".menu")).notes[".menu"]).toBe("no element inside root")
  })
  it("invalid selector", async () => {
    // Browsers forgive a bracket left open at the end (`[aria-label=Back` still matches), so the
    // selector here is cut off before its value, which they do reject.
    const sel = "button[aria-label="
    expect((await resolveOne(sel)).notes[sel]).toBe("invalid selector")
  })
  it("the root itself resolves", async () => {
    const r = await resolveOne("#root")
    expect(r.selector).toBe("#root")
    expect(r.notes).toEqual({})
  })
})
