// @vitest-environment node
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { loadConfig } from "../../src/config"
import { flatten, readNode } from "../../src/figma/read"

const card = JSON.parse(
  readFileSync(path.join(__dirname, "../fixtures/figma/card.json"), "utf8"),
)
const script = readFileSync(
  path.join(__dirname, "../../scripts/export-node.js"),
  "utf8",
)

const MIXED = Symbol("mixed")
type Mock = Record<string, unknown>

/** Run the script body as `use_figma` does: an async function with `figma` in scope. */
async function run(id: string, nodes: Record<string, Mock>) {
  const figma = {
    mixed: MIXED,
    getNodeByIdAsync: async (wanted: string) => nodes[wanted] ?? null,
  }
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const fn = new AsyncFunction("figma", script.replace(`"__ID__"`, JSON.stringify(id)))
  return fn(figma)
}

const solid = (r: number, g: number, b: number, opacity?: number) => ({
  type: "SOLID",
  color: { r, g, b },
  ...(opacity === undefined ? {} : { opacity }),
})

function pluginCard(): Record<string, Mock> {
  const title: Mock = {
    id: "1:2",
    name: "Title",
    type: "TEXT",
    characters: "Plan overview",
    layoutSizingHorizontal: "HUG",
    fills: [solid(0.1, 0.2, 0.3)],
    fontName: { family: "Inter", style: "Semi Bold" },
    fontSize: 20,
    fontWeight: 600,
    lineHeight: { unit: "PIXELS", value: 28 },
    absoluteBoundingBox: { x: 124, y: 224, width: 140, height: 28 },
  }
  const body: Mock = {
    id: "1:3",
    name: "Body",
    type: "TEXT",
    characters: "Everything you need in one place.",
    layoutSizingHorizontal: "FIXED",
    fills: [solid(0, 0, 0, 0.5)],
    fontName: { family: "Inter", style: "Regular" },
    fontSize: 14,
    fontWeight: 400,
    lineHeight: { unit: "AUTO" },
    absoluteBoundingBox: { x: 124, y: 264, width: 272, height: 20 },
  }
  const label: Mock = {
    id: "1:5",
    name: "Badge label",
    type: "TEXT",
    characters: "New",
    fills: [],
    fontName: { family: "Inter", style: "Regular" },
    fontSize: 12,
    fontWeight: 400,
    lineHeight: { unit: "AUTO" },
    absoluteBoundingBox: { x: 130, y: 300, width: 30, height: 16 },
  }
  const badge: Mock = {
    id: "1:4",
    name: "Badge",
    type: "FRAME",
    visible: false,
    layoutMode: "NONE",
    fills: [],
    effects: [],
    cornerRadius: 0,
    absoluteBoundingBox: { x: 124, y: 296, width: 60, height: 24 },
    children: [label],
  }
  const root: Mock = {
    id: "1:1",
    name: "Card",
    type: "FRAME",
    visible: true,
    layoutMode: "VERTICAL",
    itemSpacing: 12,
    paddingLeft: 24,
    paddingRight: 24,
    paddingTop: 24,
    paddingBottom: 24,
    cornerRadius: 16,
    strokeWeight: 1,
    fills: [
      { ...solid(1, 0, 0), visible: false },
      solid(1, 1, 1),
    ],
    effects: [
      {
        type: "DROP_SHADOW",
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.1 },
        offset: { x: 0, y: 4 },
        radius: 8,
        spread: 0,
      },
      { type: "LAYER_BLUR", visible: false, radius: 4 },
    ],
    absoluteBoundingBox: { x: 100, y: 200, width: 320, height: 160 },
    children: [title, body, badge],
  }
  return { "1:1": root }
}

describe("export-node.js", () => {
  it("exporter output reads like the REST fixture", async () => {
    const out = await run("1:1", pluginCard())
    expect(flatten(readNode(out))).toEqual(flatten(readNode(card)))
  })

  it("mixed values are omitted, not serialised", async () => {
    const nodes = pluginCard()
    Object.assign(nodes["1:1"], {
      cornerRadius: MIXED,
      topLeftRadius: 4,
      topRightRadius: 8,
      bottomRightRadius: 12,
      bottomLeftRadius: 16,
      strokeWeight: MIXED,
      fills: MIXED,
    })
    const out = await run("1:1", nodes)
    const doc = out.nodes["1:1"].document
    expect(doc.rectangleCornerRadii).toEqual([4, 8, 12, 16])
    expect("cornerRadius" in doc).toBe(false)
    expect("strokeWeight" in doc).toBe(false)
    expect("fills" in doc).toBe(false)
    const tree = flatten(readNode(out))
    expect(tree.root.radii).toEqual([4, 8, 12, 16])
    expect(JSON.stringify(out)).not.toContain("mixed")
  })

  it("text with mixed font properties omits only those fields", async () => {
    const nodes = pluginCard()
    const title = (nodes["1:1"].children as Mock[])[0]
    title.fontName = MIXED
    title.fontSize = MIXED
    const out = await run("1:1", nodes)
    const doc = out.nodes["1:1"].document.children[0]
    expect(doc.style).toEqual({ fontWeight: 600, lineHeightPx: 28 })
  })
})

describe("templates", () => {
  const templates = path.join(__dirname, "../../templates")

  it("the config template passes the config loader", () => {
    const config = loadConfig(path.join(templates, "ui-measure.config.json"))
    expect(Object.keys(config.targets)).toHaveLength(1)
  })

  it("the gitignore snippet ignores the reports folder", () => {
    const lines = readFileSync(path.join(templates, "gitignore-snippet.txt"), "utf8").split("\n")
    expect(lines).toContain(".ui-measure/reports/")
  })
})
