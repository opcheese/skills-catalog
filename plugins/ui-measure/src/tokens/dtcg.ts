// W3C Design Tokens (DTCG) loader: groups are nested objects, a token is an
// object with `$value`, and `$type` may be inherited from a parent group.

import type { Token, TokenProperty } from "./types";

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function propertyFor(type: string, path: string): TokenProperty | undefined {
  const segments = path.toLowerCase().split(".");
  const has = (...names: string[]) => segments.some((s) => names.includes(s));
  const isFontSize =
    has("fontsize", "font-size", "font_size") ||
    (has("font", "typography") && has("size"));
  const isLineHeight = has("lineheight", "line-height", "line_height", "leading");
  switch (type) {
    case "color":
      return "color";
    case "dimension":
    case "number": {
      // A unitless number is accepted only where the path says what it is.
      if (isFontSize) return "fontSize";
      if (isLineHeight) return "lineHeight";
      if (type === "number") return undefined;
      const p = path.toLowerCase();
      if (p.includes("radius")) return "radius";
      if (p.includes("border")) return "borderWidth";
      return "spacing";
    }
    case "fontFamily":
      return "fontFamily";
    case "fontWeight":
      return "fontWeight";
    case "shadow":
      return "effect";
    default:
      return undefined;
  }
}

const TYPOGRAPHY_MEMBERS: Record<string, TokenProperty> = {
  fontFamily: "fontFamily",
  fontSize: "fontSize",
  fontWeight: "fontWeight",
  lineHeight: "lineHeight",
};

function stringify(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value.join(", ");
  if (isObject(value) && typeof value.value === "number" && typeof value.unit === "string") {
    return `${value.value}${value.unit}`;
  }
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return undefined;
}

interface Raw {
  path: string;
  type: string | undefined;
  value: unknown;
}

function collect(node: Json, prefix: string[], inherited: string | undefined, out: Raw[]): void {
  const type = typeof node.$type === "string" ? node.$type : inherited;
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$") || !isObject(child)) continue;
    const path = [...prefix, key];
    if ("$value" in child) {
      out.push({
        path: path.join("."),
        type: typeof child.$type === "string" ? child.$type : type,
        value: child.$value,
      });
    } else {
      collect(child, path, type, out);
    }
  }
}

export function parseDtcg(text: string): { tokens: Token[]; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { tokens: [], errors: [`not valid JSON (${error instanceof Error ? error.message : String(error)})`] };
  }
  if (!isObject(parsed)) return { tokens: [], errors: ["not a DTCG object"] };

  const raws: Raw[] = [];
  collect(parsed, [], undefined, raws);
  const byPath = new Map(raws.map((r) => [r.path, r]));

  const tokens: Token[] = [];
  const errors: string[] = [];
  for (const raw of raws) {
    // Resolve an alias like "{color.primary}" to the referenced token's value.
    let value = raw.value;
    let type = raw.type;
    if (typeof value === "string" && /^\{[^{}]+\}$/.test(value)) {
      const target = byPath.get(value.slice(1, -1));
      if (!target) {
        errors.push(`token ${raw.path} aliases ${value}, which does not exist`);
        continue;
      }
      if (typeof target.value === "string" && /^\{[^{}]+\}$/.test(target.value)) {
        errors.push(`token ${raw.path} aliases ${value}, which is itself an alias (cycle or chain deeper than one level)`);
        continue;
      }
      value = target.value;
      type = type ?? target.type;
    }
    if (type === undefined) {
      errors.push(`token ${raw.path} has no $type and none to inherit`);
      continue;
    }
    if (type === "typography") {
      if (!isObject(value)) {
        errors.push(`token ${raw.path} has a typography $value that is not an object`);
        continue;
      }
      for (const [member, property] of Object.entries(TYPOGRAPHY_MEMBERS)) {
        if (!(member in value)) continue;
        const str = stringify(value[member]);
        if (str === undefined) errors.push(`token ${raw.path}.${member} has an unusable value`);
        else tokens.push({ name: `${raw.path}.${member}`, property, value: str });
      }
      continue;
    }
    const property = propertyFor(type, raw.path);
    if (property === undefined) {
      errors.push(`token ${raw.path} has unsupported $type "${type}"`);
      continue;
    }
    const str = stringify(value);
    if (str === undefined) {
      errors.push(`token ${raw.path} has an unusable $value`);
      continue;
    }
    tokens.push({ name: raw.path, property, value: str });
  }
  return { tokens, errors };
}
