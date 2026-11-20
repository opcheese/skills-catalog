import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { chromium, type Browser } from "playwright"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { serve, type TestServer } from "../helpers/serve"
import { openPage } from "../../src/dom/open"
import { domTree } from "../../src/dom/tree"
import { flatten, readNode } from "../../src/figma/read"
import { verifyMapping } from "../../src/correspondence/verify"
import type { DesignTree, Proposal } from "../../src/correspondence/types"
import type { Token } from "../../src/tokens"
import type { Finding } from "../../src/report/types"
import { compareSpec } from "../../src/spec/compare"

const PAGES = fileURLToPath(new URL("../fixtures/pages", import.meta.url))
const CARD = fileURLToPath(new URL("../fixtures/figma/card.json", import.meta.url))

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

// A recorded mapping: what a proposer would say about card.json against the fixture pages.
const proposal: Proposal = {
  pairs: [
    { nodeId: "1:1", selector: "#card" },
    { nodeId: "1:2", selector: "#card > :nth-child(1)" },
    { nodeId: "1:3", selector: "#card > :nth-child(2)" },
  ],
  unmapped: { design: [], impl: [] },
}

const freshDesign = (): DesignTree => flatten(readNode(JSON.parse(readFileSync(CARD, "utf8"))))

async function run(
  name: string,
  opts: { rootPx?: number; tokens?: Token[]; unthemed?: string[]; design?: DesignTree } = {},
) {
  const design = opts.design ?? freshDesign()
  const query = opts.rootPx ? `?root=${opts.rootPx}` : ""
  const p = await openPage(
    {
      adapter: { kind: "url", url: `${server.origin}/card-${name}.html${query}`, root: "#card" },
      viewport: [800, 600],
      designRootFontPx: 16,
    },
    { browser },
  )
  if ("notComparable" in p) throw new Error(p.notComparable)
  try {
    const dom = await domTree(p)
    const v = verifyMapping(proposal, design, dom, { scale: p.scale })
    const out = compareSpec(design, dom, v, { scale: p.scale, tokens: opts.tokens, unthemed: opts.unthemed })
    return { ...out, v, scale: p.scale }
  } finally {
    await p.close()
  }
}

const fails = (r: { findings: Finding[] }) => r.findings.filter((f) => f.status === "fail")
const kind = (r: { findings: Finding[] }, k: string, status = "fail") =>
  r.findings.filter((f) => f.kind === k && f.status === status)

describe("compareSpec", () => {
  it("card-clean has no fail findings and every check ran", async () => {
    const r = await run("clean")
    expect(fails(r)).toEqual([])
    expect(r.findings.filter((f) => f.status === "not_comparable")).toEqual([])
    for (const k of ["box", "gap", "padding", "radius", "border-width", "colour", "font-family", "font-size", "font-weight", "line-height", "effects", "root-size"]) {
      expect(kind(r, k, "pass").length, `no passing ${k} finding`).toBeGreaterThan(0)
    }
    expect(r.coverage).toEqual({ pairsProposed: 3, pairsAccepted: 3, dropped: 0 })
  })

  it("card-padding (32 vs 24) fails padding by 8 and drops no pair", async () => {
    const r = await run("padding")
    const top = kind(r, "padding").filter((f) => f.expected?.startsWith("top"))
    expect(top).toHaveLength(1)
    expect(top[0].deltaPx).toBeCloseTo(8, 0)
    expect(top[0].target.designNode).toBe("1:1")
    expect(r.v.pairs.filter((p) => p.outcome === "not_comparable")).toEqual([])
    expect(r.coverage.dropped).toBe(0)
  })

  it("card-gap (20 vs 12) fails gap by 8", async () => {
    const r = await run("gap")
    const gap = kind(r, "gap")
    expect(gap).toHaveLength(1)
    expect(gap[0].deltaPx).toBeCloseTo(8, 0)
    expect(gap[0].expected).toContain("12")
    expect(gap[0].actual).toContain("20")
  })

  it("card-radius (8 vs 16) fails radius", async () => {
    const r = await run("radius")
    const radius = kind(r, "radius")
    expect(radius).toHaveLength(1)
    expect(radius[0].deltaPx).toBeCloseTo(8, 0)
    expect(radius[0].target.designNode).toBe("1:1")
  })

  it("card-colour fails colour and names the token that was meant", async () => {
    const tokens: Token[] = [{ name: "color.surface", property: "color", value: "#ffffff" }]
    const r = await run("colour", { tokens })
    const colour = kind(r, "colour")
    expect(colour).toHaveLength(1)
    expect(colour[0].expected).toContain("color.surface")
    expect(colour[0].expected).toContain("#ffffff")
    expect(colour[0].actual).toBe("#f4f4f4")
    const bare = await run("colour")
    expect(kind(bare, "colour")[0].expected).toBe("#ffffff")
  })

  it("card-colour passes when its colour is a declared unthemed literal", async () => {
    const r = await run("colour", { unthemed: ["#F4F4F4"] })
    expect(kind(r, "colour")).toEqual([])
    expect(fails(r)).toEqual([])
  })

  it("card-root (40px wider) fails root-size once, not as a size finding too", async () => {
    const r = await run("root")
    const root = kind(r, "root-size")
    expect(root).toHaveLength(1)
    expect(root[0].deltaPx).toBeCloseTo(40, 0)
    expect(r.findings.filter((f) => f.kind === "size" && f.target.designNode === "1:1")).toEqual([])
  })

  it("a pair that differs in size reports a size finding and is kept, not dropped", async () => {
    const r = await run("root")
    const size = kind(r, "size")
    expect(size.map((f) => f.target.designNode)).toEqual(["1:3"])
    expect(size[0].deltaPx).toBeCloseTo(40, 0)
    // The root is the one pair the verifier cannot keep here: only one of its two children is an
    // ACCEPTED pair (the other is size_differs), so it counts as dropped. Its size is still reported,
    // as root-size, because that finding does not depend on the pair.
    expect(r.v.sizeDiffers.map((p) => p.nodeId)).toEqual(["1:3"])
    expect(r.coverage).toEqual({ pairsProposed: 3, pairsAccepted: 2, dropped: 1 })
  })

  it("1px off passes (floor 2) and 3px off fails", async () => {
    const near = freshDesign()
    const body = near.nodes.find((n) => n.id === "1:3")
    if (!body?.box) throw new Error("fixture")
    body.box = { ...body.box, y: body.box.y + 1 }
    expect(fails(await run("clean", { design: near }))).toEqual([])
    body.box = { ...body.box, y: body.box.y + 2 }
    const far = await run("clean", { design: near })
    expect(kind(far, "box").map((f) => f.target.designNode)).toEqual(["1:3"])
  })

  it("at scale 0.5 the clean card is still clean", async () => {
    const r = await run("clean", { rootPx: 8 })
    expect(r.scale).toBe(0.5)
    expect(fails(r)).toEqual([])
    expect(r.findings.filter((f) => f.status === "not_comparable")).toEqual([])
    expect(kind(r, "box", "pass").length).toBeGreaterThan(0)
  })

  it("a dropped pair is counted and a missing sibling pair makes the gap not_comparable", async () => {
    const design = freshDesign()
    const p = await openPage(
      { adapter: { kind: "url", url: `${server.origin}/card-clean.html`, root: "#card" }, viewport: [800, 600] },
      { browser },
    )
    if ("notComparable" in p) throw new Error(p.notComparable)
    try {
      const dom = await domTree(p)
      const partial: Proposal = { pairs: proposal.pairs.slice(0, 2), unmapped: { design: [], impl: [] } }
      const v = verifyMapping(partial, design, dom, { scale: 1 })
      const r = compareSpec(design, dom, v, { scale: 1 })
      expect(r.coverage).toEqual({ pairsProposed: 2, pairsAccepted: 2, dropped: 0 })
      const gap = r.findings.filter((f) => f.kind === "gap")
      expect(gap).toHaveLength(1)
      expect(gap[0].status).toBe("not_comparable")
      expect(gap[0].reason).toMatch(/1:3/)
      const bogus: Proposal = { pairs: [...partial.pairs, { nodeId: "9:9", selector: "#nope" }], unmapped: { design: [], impl: [] } }
      const v2 = verifyMapping(bogus, design, dom, { scale: 1 })
      expect(compareSpec(design, dom, v2, { scale: 1 }).coverage).toEqual({ pairsProposed: 3, pairsAccepted: 2, dropped: 1 })
    } finally {
      await p.close()
    }
  })
})
