import { readFileSync } from "node:fs";
import { parseDtcg } from "./dtcg.js";
import { parseRows } from "./rows.js";
export function loadTokens(path, format) {
    let text;
    try {
        text = readFileSync(path, "utf8");
    }
    catch (error) {
        return { tokens: [], errors: [`cannot read ${path} (${error instanceof Error ? error.message : String(error)})`] };
    }
    return format === "rows" ? parseRows(text) : parseDtcg(text);
}
/** Colours compare as lowercase `#rrggbb[aa]`; everything else as trimmed lowercase text. */
function normaliseColor(value) {
    const v = value.trim().toLowerCase();
    const m = /^#([0-9a-f]{3,4})$/.exec(v);
    return m ? `#${[...m[1]].map((c) => c + c).join("")}` : v;
}
function parseLength(value) {
    const m = /^\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:px)?\s*$/i.exec(value);
    return m ? Number(m[1]) : undefined;
}
function sameValue(property, a, b) {
    switch (property) {
        case "color":
            return normaliseColor(a) === normaliseColor(b);
        case "spacing":
        case "radius":
        case "fontSize":
        case "lineHeight":
        case "borderWidth": {
            const x = parseLength(a);
            const y = parseLength(b);
            if (x !== undefined && y !== undefined)
                return x === y;
            return a.trim().toLowerCase() === b.trim().toLowerCase();
        }
        default:
            return a.trim().toLowerCase() === b.trim().toLowerCase();
    }
}
export function tokenFor(tokens, property, value) {
    return tokens.find((t) => t.property === property && sameValue(property, t.value, value));
}
