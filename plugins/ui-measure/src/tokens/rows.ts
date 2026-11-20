// Row-format token map: a flat list of design-name to value rows, optionally
// declaring which property a row answers for.
//
// Ported from a production loader. Rule kept from there: a row this host
// cannot use must never silently become a token the design system "does not
// have". Unlike the original, a bad row no longer takes the whole file down
// (and no longer vanishes without a word): it is reported by name and the
// other rows are kept.

import type { Token, TokenProperty } from "./types";

/**
 * The properties a row may declare. Enumerated rather than derived from the
 * type, because the check runs against JSON at runtime and a type gives no
 * value list to compare against.
 */
export const KNOWN_PROPERTIES: TokenProperty[] = [
  "color",
  "spacing",
  "radius",
  "fontSize",
  "lineHeight",
  "fontWeight",
  "fontFamily",
  "effect",
  "borderWidth",
];

/**
 * Infer a property from the design name's namespace. Correct for maps written
 * before rows declared a property. It is NOT a general rule, which is why a row
 * may override it with `property`. An unnamed row has no namespace to read.
 */
function inferProperty(name: string | null): TokenProperty | undefined {
  if (name === null) return undefined;
  const n = name.toLowerCase();
  if (n.startsWith("base/") || n.startsWith("alpha/") || n.startsWith("tailwind colors/")) return "color";
  if (n.startsWith("spacing/")) return "spacing";
  if (n.startsWith("border radius/") || n.startsWith("border-radius/")) return "radius";
  if (n.includes("font-size")) return "fontSize";
  if (n.includes("line-height")) return "lineHeight";
  if (n.startsWith("font/weight/")) return "fontWeight";
  if (n.startsWith("font/family/") || n.includes("font-family")) return "fontFamily";
  if (n.includes("shadow")) return "effect";
  if (n.includes("border-width") || n.includes("border/width")) return "borderWidth";
  return undefined;
}

export function parseRows(text: string): { tokens: Token[]; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { tokens: [], errors: [`not valid JSON (${error instanceof Error ? error.message : String(error)})`] };
  }
  // Accept a bare array or `{ tokens: [...] }`, because a generated file
  // usually wants somewhere to put a version or a comment.
  const rows = Array.isArray(parsed) ? parsed : (parsed as { tokens?: unknown } | null)?.tokens;
  if (!Array.isArray(rows)) {
    return { tokens: [], errors: ["neither an array of rows nor an object with a `tokens` array"] };
  }

  const tokens: Token[] = [];
  const errors: string[] = [];
  for (const [index, row] of rows.entries()) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`row ${index} is not an object, so it was skipped`);
      continue;
    }
    const { figma, value, code, property } = row as Record<string, unknown>;
    // A row that cannot be looked up would silently become a token the design
    // system "does not have".
    if (typeof value !== "string") {
      errors.push(`row ${index} has no string \`value\`, so it was skipped`);
      continue;
    }
    // `figma` is the design system's own name; null when the design keeps the
    // value as a raw fill with no named variable.
    if (typeof figma !== "string" && figma !== null && figma !== undefined) {
      errors.push(`row ${index} (${value}) has a \`figma\` that is neither a string nor null, so it was skipped`);
      continue;
    }
    const designName = typeof figma === "string" ? figma : null;
    // Named to a human by whichever handle the row actually has.
    const label = designName ?? value;

    let scope: TokenProperty[];
    if (property !== undefined) {
      const declared = Array.isArray(property) ? property : [property];
      // An empty list declares the row answers for nothing: the same silent
      // hole as a typo.
      if (declared.length === 0) {
        errors.push(`row ${index} (${label}) declares an empty \`property\` list, so it was skipped`);
        continue;
      }
      const unknown = declared.filter((p) => typeof p !== "string" || !KNOWN_PROPERTIES.includes(p as TokenProperty));
      if (unknown.length > 0) {
        errors.push(
          `row ${index} (${label}) declares unknown property ${unknown.map(String).join(", ")}; known: ${KNOWN_PROPERTIES.join(", ")}. The row was skipped`,
        );
        continue;
      }
      scope = declared as TokenProperty[];
    } else {
      const inferred = inferProperty(designName);
      if (inferred === undefined) {
        errors.push(
          `row ${index} (${label}) declares no \`property\` and its name gives none away, so nothing could scope it to a lookup; it was skipped`,
        );
        continue;
      }
      scope = [inferred];
    }

    const name = designName ?? (typeof code === "string" ? code : value);
    for (const p of scope) tokens.push({ name, property: p, value });
  }
  return { tokens, errors };
}
