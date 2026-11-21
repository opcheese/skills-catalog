// W3C Design Tokens (DTCG) loader: groups are nested objects, a token is an
// object with `$value`, and `$type` may be inherited from a parent group.
function isObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}
function propertyFor(type, path) {
    const segments = path.toLowerCase().split(".");
    const has = (...names) => segments.some((s) => names.includes(s));
    const isFontSize = has("fontsize", "font-size", "font_size") ||
        (has("font", "typography") && has("size"));
    const isLineHeight = has("lineheight", "line-height", "line_height", "leading");
    switch (type) {
        case "color":
            return "color";
        case "dimension":
        case "number": {
            // A unitless number is accepted only where the path says what it is.
            if (isFontSize)
                return "fontSize";
            if (isLineHeight)
                return "lineHeight";
            if (type === "number")
                return undefined;
            const p = path.toLowerCase();
            if (p.includes("radius"))
                return "radius";
            if (p.includes("border"))
                return "borderWidth";
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
const TYPOGRAPHY_MEMBERS = {
    fontFamily: "fontFamily",
    fontSize: "fontSize",
    fontWeight: "fontWeight",
    lineHeight: "lineHeight",
};
function stringify(value) {
    if (typeof value === "string")
        return value;
    if (typeof value === "number")
        return String(value);
    if (Array.isArray(value) && value.every((v) => typeof v === "string"))
        return value.join(", ");
    if (isObject(value) && typeof value.value === "number" && typeof value.unit === "string") {
        return `${value.value}${value.unit}`;
    }
    if (value !== null && typeof value === "object")
        return JSON.stringify(value);
    return undefined;
}
function formatColor(components, alpha) {
    const channels = components.map((n) => Math.round(n * 255));
    const a = Math.round(alpha * 1000) / 1000;
    if (a >= 1)
        return `#${channels.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    return `rgba(${channels.join(", ")}, ${a})`;
}
function colorObject(value) {
    if (!isObject(value))
        throw new Error("color must be an srgb object or a string");
    if (value.colorSpace !== undefined && value.colorSpace !== "srgb") {
        throw new Error(`unsupported color space ${JSON.stringify(value.colorSpace)}`);
    }
    let components;
    let hexAlpha = 1;
    if (value.hex !== undefined) {
        if (typeof value.hex !== "string")
            throw new Error("hex must be a string");
        const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.hex);
        if (!match)
            throw new Error("hex must be #rgb, #rgba, #rrggbb, or #rrggbbaa");
        let hex = match[1];
        if (hex.length <= 4)
            hex = [...hex].map((c) => c + c).join("");
        components = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        if (hex.length === 8)
            hexAlpha = parseInt(hex.slice(6, 8), 16) / 255;
    }
    else {
        if (value.colorSpace !== "srgb")
            throw new Error("color requires colorSpace srgb or a hex string");
        if (!Array.isArray(value.components) || value.components.length !== 3 ||
            value.components.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1)) {
            throw new Error("srgb components must be three finite numbers from 0 to 1");
        }
        components = value.components;
    }
    if (value.alpha !== undefined &&
        (typeof value.alpha !== "number" || !Number.isFinite(value.alpha) || value.alpha < 0 || value.alpha > 1)) {
        throw new Error("alpha must be a finite number from 0 to 1");
    }
    const alpha = hexAlpha * (typeof value.alpha === "number" ? value.alpha : 1);
    return formatColor(components, alpha);
}
function shadowDimension(value, field) {
    const str = stringify(value);
    const match = str ? /^(-?(?:\d+(?:\.\d+)?|\.\d+))px$/.exec(str.trim()) : null;
    if (!match)
        throw new Error(`${field} must be a pixel dimension`);
    return Number(match[1]);
}
function shadowObject(value) {
    if (!isObject(value))
        throw new Error("shadow must be an object or an effect string");
    if (value.inset !== undefined && typeof value.inset !== "boolean")
        throw new Error("inset must be boolean");
    const x = shadowDimension(value.offsetX, "offsetX");
    const y = shadowDimension(value.offsetY, "offsetY");
    const blur = shadowDimension(value.blur, "blur");
    const spread = value.spread === undefined ? 0 : shadowDimension(value.spread, "spread");
    const parts = [value.inset ? "INNER_SHADOW" : "DROP_SHADOW", x, y, blur];
    if (spread)
        parts.push(spread);
    parts.push(colorObject(value.color));
    return parts.join(" ");
}
function collect(node, prefix, inherited, out) {
    const type = typeof node.$type === "string" ? node.$type : inherited;
    for (const [key, child] of Object.entries(node)) {
        if (key.startsWith("$") || !isObject(child))
            continue;
        const path = [...prefix, key];
        if ("$value" in child) {
            out.push({
                path: path.join("."),
                type: typeof child.$type === "string" ? child.$type : type,
                value: child.$value,
            });
        }
        else {
            collect(child, path, type, out);
        }
    }
}
export function parseDtcg(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (error) {
        return { tokens: [], errors: [`not valid JSON (${error instanceof Error ? error.message : String(error)})`] };
    }
    if (!isObject(parsed))
        return { tokens: [], errors: ["not a DTCG object"] };
    const raws = [];
    collect(parsed, [], undefined, raws);
    const byPath = new Map(raws.map((r) => [r.path, r]));
    const tokens = [];
    const errors = [];
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
                if (!(member in value))
                    continue;
                const str = stringify(value[member]);
                if (str === undefined)
                    errors.push(`token ${raw.path}.${member} has an unusable value`);
                else
                    tokens.push({ name: `${raw.path}.${member}`, property, value: str });
            }
            continue;
        }
        const property = propertyFor(type, raw.path);
        if (property === undefined) {
            errors.push(`token ${raw.path} has unsupported $type "${type}"`);
            continue;
        }
        let str;
        try {
            if (property === "color" && typeof value !== "string")
                str = colorObject(value);
            else if (property === "effect" && typeof value !== "string")
                str = shadowObject(value);
            else
                str = stringify(value);
        }
        catch (error) {
            errors.push(`token ${raw.path} has an unusable $value: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }
        if (str === undefined) {
            errors.push(`token ${raw.path} has an unusable $value`);
            continue;
        }
        tokens.push({ name: raw.path, property, value: str });
    }
    return { tokens, errors };
}
