import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { chromium, type Browser } from "playwright"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { serve, type TestServer } from "../helpers/serve"
import { openPage } from "../../src/dom/open"
import { domTree } from "../../src/dom/tree"
import { flatten, readNode } from "../../src/figma/read"
import { verifyMapping } from "../../src/correspondence/verify"
import type { Box, DesignNode, DesignTree, DomElement, DomStyle, DomTree, Proposal, Verification } from "../../src/correspondence/types"
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

const STYLE: DomStyle = {
  color: "rgb(0, 0, 0)",
  backgroundColor: "rgba(0, 0, 0, 0)",
  borderTopWidth: "0px",
  borderRightWidth: "0px",
  borderBottomWidth: "0px",
  borderLeftWidth: "0px",
  borderTopLeftRadius: "0px",
  borderTopRightRadius: "0px",
  borderBottomRightRadius: "0px",
  borderBottomLeftRadius: "0px",
  fontFamily: "serif",
  fontSize: "16px",
  fontWeight: "400",
  lineHeight: "normal",
  boxShadow: "none",
  filter: "none",
  backdropFilter: "none",
}

/** A Verification that accepts every pair given, for trees built by hand. */
function handBuilt(pairs: { nodeId: string; selector: string }[]): Verification {
  const verdicts = pairs.map((p) => ({ ...p, outcome: "accepted" as const }))
  return { pairs: verdicts, accepted: verdicts, sizeDiffers: [], rejected: false }
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
    // Its text matches, so it is size_differs, which lets the verifier rescue the root too.
    expect(r.v.sizeDiffers.map((p) => p.nodeId).sort()).toEqual(["1:1", "1:3"])
    expect(r.coverage).toEqual({ pairsProposed: 3, pairsAccepted: 3, dropped: 0 })
  })

  it("a size-differing pair that is also displaced reports a size fail and a position fail", async () => {
    const design = freshDesign()
    const body = design.nodes.find((n) => n.id === "1:3")
    if (!body?.box) throw new Error("fixture")
    body.box = { ...body.box, y: body.box.y + 10 }
    const r = await run("root", { design })
    expect(kind(r, "size").map((f) => f.target.designNode)).toEqual(["1:3"])
    const pos = kind(r, "box").filter((f) => f.target.designNode === "1:3")
    expect(pos).toHaveLength(1)
    expect(pos[0].deltaPx).toBeCloseTo(10, 0)
    // Width and height are carried by the size finding alone.
    expect(pos[0].expected).not.toMatch(/\dx\d/)
    // Undisplaced, the same pair has a size fail and a passing position.
    const plain = await run("root")
    expect(kind(plain, "box").filter((f) => f.target.designNode === "1:3")).toEqual([])
    expect(kind(plain, "box", "pass").filter((f) => f.target.designNode === "1:3")).toHaveLength(1)
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

  describe("absence and per-side checks", () => {
    const without = (id: string, drop: "radius" | "strokeWeight" | "fill" | "effects") => {
      const d = freshDesign()
      const n = d.nodes.find((x) => x.id === id)
      if (!n) throw new Error("fixture")
      delete n[drop]
      return d
    }
    const mutate = (id: string, f: (n: DesignNode) => void) => {
      const d = freshDesign()
      const n = d.nodes.find((x) => x.id === id)
      if (!n) throw new Error("fixture")
      f(n)
      return d
    }

    it("a radius the design does not have fails with expected none", async () => {
      const r = await run("clean", { design: without("1:1", "radius") })
      const f = kind(r, "radius")
      expect(f).toHaveLength(1)
      expect(f[0].expected).toBe("none")
      expect(f[0].actual).toBe("16px")
    })

    it("a border the design does not have fails with expected none", async () => {
      const f = kind(await run("clean", { design: without("1:1", "strokeWeight") }), "border-width")
      expect(f).toHaveLength(1)
      expect(f[0].expected).toBe("none")
    })

    it("a background the design does not have fails with expected none, and unthemed excuses it", async () => {
      const f = kind(await run("clean", { design: without("1:1", "fill") }), "colour")
      expect(f).toHaveLength(1)
      expect(f[0].expected).toBe("none")
      expect(f[0].actual).toBe("#ffffff")
      expect(kind(await run("clean", { design: without("1:1", "fill"), unthemed: ["#fff"] }), "colour")).toEqual([])
    })

    it("a shadow only the page has fails with expected none", async () => {
      const f = kind(await run("clean", { design: without("1:1", "effects") }), "effects")
      expect(f).toHaveLength(1)
      expect(f[0].expected).toBe("none")
      expect(f[0].actual).toContain("rgba(0, 0, 0, 0.1)")
    })

    it("a design effect the page lacks fails", async () => {
      const f = kind(await run("clean", { design: mutate("1:1", (n) => (n.effects = ["DROP_SHADOW 0 8 16 rgba(0, 0, 0, 0.3)"])) }), "effects")
      expect(f).toHaveLength(1)
    })

    it("a border on a non-top side fails and names that side", async () => {
      const r = await run("border-left")
      const f = kind(r, "border-width")
      expect(f).toHaveLength(1)
      expect(f[0].actual).toContain("left 4px")
      expect(f[0].actual).not.toContain("top")
      expect(f[0].deltaPx).toBeCloseTo(3, 0)
    })

    it("font family, size and weight each fail on their own", async () => {
      const f = (id: string, change: (font: NonNullable<DesignNode["font"]>) => void) =>
        run("clean", {
          design: mutate(id, (n) => {
            if (!n.font) throw new Error("fixture")
            n.font = { ...n.font }
            change(n.font)
          }),
        })
      const family = await f("1:2", (x) => (x.family = "Other Sans"))
      expect(kind(family, "font-family")).toHaveLength(1)
      expect(fails(family)).toHaveLength(1)
      const size = await f("1:2", (x) => (x.size = 22))
      expect(kind(size, "font-size")).toHaveLength(1)
      expect(kind(size, "font-size")[0].deltaPx).toBeCloseTo(2, 0)
      expect(fails(size)).toHaveLength(1)
      const weight = await f("1:2", (x) => (x.weight = 700))
      expect(kind(weight, "font-weight")).toHaveLength(1)
      expect(fails(weight)).toHaveLength(1)
    })

    it("a vector's fill is not_comparable with a reason, never silence", async () => {
      const design = freshDesign()
      design.nodes.push({ id: "9:1", type: "VECTOR", parentId: "1:1", fill: "#ff0000", box: { x: 0, y: 0, width: 1, height: 1 } })
      const dom = {
        root: { selector: "#r", tag: "div", box: { x: 0, y: 0, width: 1, height: 1 }, style: STYLE },
        elements: [] as DomElement[],
      }
      const icon: DomElement = { selector: "#r > svg", tag: "svg", box: { x: 0, y: 0, width: 1, height: 1 }, style: STYLE }
      dom.elements = [dom.root, icon]
      const v = handBuilt([{ nodeId: "9:1", selector: "#r > svg" }])
      const out = compareSpec(design, dom, v, { scale: 1 })
      const fill = out.findings.filter((f) => f.kind === "colour")
      expect(fill).toHaveLength(1)
      expect(fill[0].status).toBe("not_comparable")
      expect(fill[0].reason).toBe("graphic fill is not compared")
    })
  })

  describe("single-node radius and effect regressions", () => {
    const compareOne = (node: DesignNode, style: Partial<DomStyle> = {}) => {
      const root = { ...node, box: { x: 0, y: 0, width: 100, height: 100 } }
      const el: DomElement = {
        selector: "#r",
        tag: "div",
        box: { x: 0, y: 0, width: 100, height: 100 },
        style: { ...STYLE, ...style },
      }
      return compareSpec(
        { root, nodes: [root] },
        { root: el, elements: [el] },
        handBuilt([{ nodeId: root.id, selector: el.selector }]),
        { scale: 1 },
      )
    }

    it("compares each design corner radius against its computed longhand", () => {
      const node: DesignNode = { id: "r", type: "RECTANGLE", radii: [4, 8, 12, 16] }
      const matching = compareOne(node, {
        borderTopLeftRadius: "4px",
        borderTopRightRadius: "8px",
        borderBottomRightRadius: "12px",
        borderBottomLeftRadius: "16px",
      })
      expect(kind(matching, "radius", "pass")).toHaveLength(1)
      const changed = compareOne(node, {
        borderTopLeftRadius: "4px",
        borderTopRightRadius: "20px",
        borderBottomRightRadius: "12px",
        borderBottomLeftRadius: "16px",
      })
      expect(kind(changed, "radius")).toHaveLength(1)
      expect(kind(changed, "radius")[0].deltaPx).toBe(12)
    })

    it("an unexpected 1px radius fails when the design has none", () => {
      const out = compareOne({ id: "r", type: "RECTANGLE" }, { borderTopLeftRadius: "1px" })
      expect(kind(out, "radius")).toHaveLength(1)
      expect(kind(out, "radius")[0].expected).toBe("none")
      expect(kind(out, "radius")[0].deltaPx).toBe(1)
    })

    it("a matching design shadow does not hide an unexpected page blur", () => {
      const out = compareOne(
        { id: "r", type: "FRAME", effects: ["DROP_SHADOW 0 4 8 rgba(0, 0, 0, 0.1)"] },
        { boxShadow: "rgba(0, 0, 0, 0.1) 0px 4px 8px 0px", filter: "blur(10px)" },
      )
      const failed = kind(out, "effects")
      expect(failed).toHaveLength(1)
      expect(failed[0].expected).toBe("none")
      expect(failed[0].actual).toContain("blur(10px)")
    })
  })

  describe("padding is read from the design's own geometry", () => {
    const frame = (children: { id: string; box: Box }[], padding: [number, number, number, number]): DesignTree => {
      const root: DesignNode = {
        id: "r",
        type: "FRAME",
        box: { x: 0, y: 0, width: 300, height: 200 },
        layout: { mode: "VERTICAL", gap: 0, padding },
      }
      const nodes = [root, ...children.map((c): DesignNode => ({ id: c.id, type: "FRAME", box: c.box, parentId: "r" }))]
      return { root, nodes }
    }
    const domFor = (children: { id: string; box: Box }[]): DomTree => {
      const els: DomElement[] = [
        { selector: "#r", tag: "div", box: { x: 0, y: 0, width: 300, height: 200 }, style: STYLE },
        ...children.map((c): DomElement => ({ selector: `#r > #${c.id}`, tag: "div", box: c.box, style: STYLE })),
      ]
      return { root: els[0], elements: els }
    }
    const pairs = (ids: string[]) => handBuilt([{ nodeId: "r", selector: "#r" }, ...ids.map((id) => ({ nodeId: id, selector: `#r > #${id}` }))])
    const padding = (fs: Finding[]) => fs.filter((f) => f.kind === "padding")

    it("a centred child passes though the declared padding says 0", () => {
      const kids = [{ id: "a", box: { x: 100, y: 50, width: 100, height: 40 } }]
      const out = compareSpec(frame(kids, [0, 0, 0, 0]), domFor(kids), pairs(["a"]), { scale: 1 })
      const p = padding(out.findings)
      expect(p).toHaveLength(4)
      expect(p.every((f) => f.status === "pass")).toBe(true)
    })

    it("a child that moved from the centre fails the sides it moved", () => {
      const was = [{ id: "a", box: { x: 100, y: 50, width: 100, height: 40 } }]
      const now = [{ id: "a", box: { x: 80, y: 50, width: 100, height: 40 } }]
      const out = compareSpec(frame(was, [0, 0, 0, 0]), domFor(now), pairs(["a"]), { scale: 1 })
      const bad = padding(out.findings).filter((f) => f.status === "fail")
      expect(bad.map((f) => f.expected?.split(" ")[0]).sort()).toEqual(["left", "right"])
      expect(bad.every((f) => Math.abs(f.deltaPx ?? 0) === 20)).toBe(true)
    })
  })
})
