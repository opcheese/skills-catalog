// Read-only Figma node exporter for ui-measure.
//
// It builds the REST-shaped JSON that ui-measure's src/figma/read.ts reads
// (`{nodes: {ID: {document}}}`) from the plugin API's node properties. It only
// reads; it never changes the file.
//
// Why not `node.exportAsync({format: "JSON_REST_V1"})`: over the Figma MCP
// connector it is refused ("JSON_REST_V1 export format is not supported in
// this context"), so the REST shape is rebuilt here, field by field. Only the
// fields read.ts reads are emitted. Values the plugin API reports as
// `figma.mixed` are omitted, never serialised.
//
// How to run it through `use_figma`:
//   1. Copy this file's text and replace __ID__ below with the node id,
//      for example "12:34" (the node-id from the Figma URL, "-" turned into ":").
//   2. Pass the text as the `code` of one `use_figma` call on the file.
//   3. Save the returned JSON as the node file the target's `node` field names,
//      for example .ui-measure/nodes/<node>.json.
//
// The script body is an async function body: it may `await` and it `return`s.

const ID = "__ID__"
const MIXED = figma.mixed

const serialisePaint = (p) => {
  const out = { type: p.type }
  if (p.visible === false) out.visible = false
  if (p.opacity !== undefined && p.opacity !== 1) out.opacity = p.opacity
  if (p.type === "SOLID") out.color = { r: p.color.r, g: p.color.g, b: p.color.b, a: 1 }
  return out
}

const serialiseEffect = (e) => {
  const out = { type: e.type }
  if (e.visible === false) out.visible = false
  if ("radius" in e) out.radius = e.radius
  if ("spread" in e && e.spread) out.spread = e.spread
  if ("color" in e) out.color = { ...e.color }
  if ("offset" in e) out.offset = { ...e.offset }
  return out
}

const SCALAR_FIELDS = [
  "layoutSizingHorizontal",
  "layoutMode",
  "itemSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "strokeWeight",
]

const serialiseText = (n, out) => {
  out.characters = n.characters
  const style = {}
  if (n.fontName !== MIXED) style.fontFamily = n.fontName.family
  if (n.fontSize !== MIXED) style.fontSize = n.fontSize
  if (n.fontWeight !== MIXED) style.fontWeight = n.fontWeight
  if (n.lineHeight !== MIXED && n.lineHeight.unit === "PIXELS") {
    style.lineHeightPx = n.lineHeight.value
  }
  out.style = style
}

const serialise = (n) => {
  const out = { id: n.id, name: n.name, type: n.type }
  if (n.visible === false) out.visible = false
  if (n.absoluteBoundingBox) out.absoluteBoundingBox = { ...n.absoluteBoundingBox }

  for (const key of SCALAR_FIELDS) {
    const value = n[key]
    if (key in n && value !== MIXED && value !== undefined && value !== "NONE") out[key] = value
  }

  if ("cornerRadius" in n) {
    if (n.cornerRadius !== MIXED) {
      if (n.cornerRadius) out.cornerRadius = n.cornerRadius
    } else {
      out.rectangleCornerRadii = [
        n.topLeftRadius,
        n.topRightRadius,
        n.bottomRightRadius,
        n.bottomLeftRadius,
      ]
    }
  }

  if ("fills" in n && n.fills !== MIXED && n.fills.length) out.fills = n.fills.map(serialisePaint)
  if ("effects" in n && n.effects.length) out.effects = n.effects.map(serialiseEffect)
  if (n.type === "TEXT") serialiseText(n, out)
  if ("children" in n && n.children.length) out.children = n.children.map(serialise)
  return out
}

const node = await figma.getNodeByIdAsync(ID)
if (!node) throw new Error("no node with id " + ID)
return { nodes: { [ID]: { document: serialise(node) } } }
