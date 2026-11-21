// The design side of the numeric comparison, as data.
//
// Everything here comes from ONE `GET /v1/files/:key/nodes` response. The
// variables REST endpoint is Enterprise-gated, but it is not needed: the node
// carries both the RESOLVED value (`cornerRadius: 20`) and the BINDING
// (`boundVariables`), which is all the gate compares.

/** The subset of a Figma node this reads. Every field optional, as on the real
 *  type — a non-optional mirror compiles here and throws on real data. */
export interface FigmaNodeish {
  id?: string
  name?: string
  type?: string
  cornerRadius?: number
  /** Present INSTEAD of `cornerRadius` when the four corners differ. */
  rectangleCornerRadii?: number[]
  strokeWeight?: number
  strokes?: unknown[]
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
  boundVariables?: Record<string, unknown>
  children?: FigmaNodeish[]
}

export interface DesignFacts {
  /** Resolved values. A property the node lacks is ABSENT, never zero —
   *  except where Figma's silence itself carries the value; see `designFacts`. */
  geometry: Partial<{
    cornerRadius: number
    strokeWeight: number
    width: number
    height: number
  }>
  /** Property name → the VariableID it is bound to, when it is bound. */
  bound: Partial<Record<"cornerRadius" | "strokeWeight", string>>
  /** Node type → how many descendants have it. */
  counts: Record<string, number>
}

/** `boundVariables` nests corner radii under per-corner keys; a stroke binding
 *  is an array. Both are reduced to "is this property bound, and to what". */
function firstAlias(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined
  const node = v as { type?: string; id?: string }
  if (node.type === "VARIABLE_ALIAS" && typeof node.id === "string") {
    return node.id
  }
  for (const child of Object.values(v as Record<string, unknown>)) {
    const found = Array.isArray(child)
      ? firstAlias(child[0])
      : firstAlias(child)
    if (found) return found
  }
  return undefined
}

/** Which `boundVariables` keys bind which property — and ONLY those.
 *
 *  A key must name the property itself, never a sibling that merely travels
 *  with it. `strokes` is the stroke PAINT's colour alias and says nothing about
 *  width: on a real card it resolves to a colour variable, while the node
 *  carries no `strokeWeight` binding at all. Reading it as a width binding
 *  claimed the design commits the border width to a token when it does not,
 *  which would emit a permanent false `unbound` finding downstream.
 *
 *  Adding a property here means finding the key Figma uses for THAT property
 *  and verifying it against a real node — not picking the nearest-looking one. */
const BINDING_KEYS: Record<keyof DesignFacts["bound"], readonly string[]> = {
  cornerRadius: ["rectangleCornerRadii", "cornerRadius"],
  strokeWeight: ["strokeWeight"],
}

export function designFacts(node: FigmaNodeish): DesignFacts {
  const geometry: DesignFacts["geometry"] = {}

  // Absence is not always ignorance. The browser ALWAYS resolves a number for
  // these two — a card with square corners computes `border-radius: 0px` — so
  // leaving the design side absent made every such property permanently
  // `not_comparable`, and a check that can never compare is not a check.
  //
  // Figma's silence is informative in exactly two shapes, and only those:
  //   - no `cornerRadius` and no `rectangleCornerRadii` → the corners are square
  //   - no `strokeWeight` and no `strokes`              → there is no stroke
  // When `rectangleCornerRadii` IS present the corners differ from each other
  // and there is no single number to compare against one computed longhand;
  // that stays absent, and stays `not_comparable`, which is the honest answer.
  if (typeof node.cornerRadius === "number") {
    geometry.cornerRadius = node.cornerRadius
  } else if (!node.rectangleCornerRadii) {
    geometry.cornerRadius = 0
  }
  if (typeof node.strokeWeight === "number") {
    geometry.strokeWeight = node.strokeWeight
  } else if (!node.strokes?.length) {
    geometry.strokeWeight = 0
  }
  if (node.absoluteBoundingBox) {
    geometry.width = node.absoluteBoundingBox.width
    geometry.height = node.absoluteBoundingBox.height
  }

  const bv = node.boundVariables ?? {}
  const bound: DesignFacts["bound"] = {}
  for (const [prop, keys] of Object.entries(BINDING_KEYS)) {
    for (const key of keys) {
      const alias = firstAlias(bv[key])
      if (alias) {
        bound[prop as keyof DesignFacts["bound"]] = alias
        break
      }
    }
  }

  const counts: Record<string, number> = {}
  const walk = (n: FigmaNodeish) => {
    for (const c of n.children ?? []) {
      if (c.type) counts[c.type] = (counts[c.type] ?? 0) + 1
      walk(c)
    }
  }
  walk(node)

  return { geometry, bound, counts }
}
