import { NotComparableError } from "../errors.js";
/** The input is a `GET /v1/files/:key/nodes` response, or the node itself.
 *
 *  A multi-node response has no meaningful "first" node, and picking one would
 *  measure a different component than the one asked for. */
export function readNode(json, nodeId) {
    const requireNode = (value) => {
        if (typeof value !== "object" || value === null || Array.isArray(value) ||
            typeof value.id !== "string" || value.id === "" ||
            typeof value.type !== "string" || value.type === "") {
            throw new Error("Figma node must be an object with non-empty string id and type fields");
        }
        return value;
    };
    const raw = json;
    const nodes = raw?.nodes;
    if (nodes && typeof nodes === "object" && !Array.isArray(nodes)) {
        const map = nodes;
        const ids = Object.keys(map);
        if (ids.length === 0)
            throw new Error("Figma response contains no nodes");
        if (nodeId !== undefined) {
            const hit = map[nodeId];
            if (!hit) {
                throw new Error(`response has no node '${nodeId}'. present: ${ids.join(", ")}`);
            }
            if (!hit.document)
                throw new Error(`response node '${nodeId}' has no document`);
            return requireNode(hit.document);
        }
        if (ids.length > 1) {
            throw new Error(`response carries ${ids.length} nodes (${ids.join(", ")}); pass ` +
                "--node-id to say which one to measure");
        }
        const only = map[ids[0]];
        if (!only?.document)
            throw new Error(`response node '${ids[0]}' has no document`);
        return requireNode(only.document);
    }
    return requireNode(json);
}
const hex = (n) => Math.round(Math.min(1, Math.max(0, n)) * 255)
    .toString(16)
    .padStart(2, "0");
/** `#rrggbb` when opaque, `rgba(r, g, b, a)` otherwise. `extra` is a paint's
 *  own opacity, which multiplies the colour's alpha. */
function colour(c, extra = 1) {
    const a = Math.round((c.a ?? 1) * extra * 1000) / 1000;
    if (a >= 1)
        return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
    const ch = (n) => Math.round(Math.min(1, Math.max(0, n)) * 255);
    return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${a})`;
}
function firstSolidFill(fills) {
    const hit = fills?.find((f) => f.type === "SOLID" && f.visible !== false && f.color);
    return hit?.color ? colour(hit.color, hit.opacity ?? 1) : undefined;
}
function effectStrings(effects) {
    const out = [];
    for (const e of effects ?? []) {
        if (e.visible === false || !e.type)
            continue;
        const parts = [e.type];
        if (e.offset)
            parts.push(e.offset.x, e.offset.y);
        if (e.radius !== undefined)
            parts.push(e.radius);
        if (e.spread)
            parts.push(e.spread);
        if (e.color)
            parts.push(colour(e.color));
        out.push(parts.join(" "));
    }
    return out;
}
function readOne(node, kids, parentId) {
    const self = {
        id: node.id,
        name: node.name,
        type: node.type,
        box: node.absoluteBoundingBox,
        ...(parentId !== undefined ? { parentId } : {}),
        ...(node.characters ? { text: node.characters } : {}),
        // Spread rather than `hugsWidth: node.layoutSizingHorizontal === "HUG"`:
        // an explicit `false` and an absent field mean different things to the
        // verifier, and only the absent one means "Figma said nothing".
        ...(node.layoutSizingHorizontal === "HUG" ? { hugsWidth: true } : {}),
    };
    // The trees are flat, so a rule that needs to know a node holds one label
    // and nothing else can only learn it here, while the children are in hand.
    if (kids.length === 1 && kids[0].type === "TEXT")
        self.labelOnly = true;
    if (node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL") {
        self.layout = {
            mode: node.layoutMode,
            gap: node.itemSpacing ?? 0,
            padding: [
                node.paddingTop ?? 0,
                node.paddingRight ?? 0,
                node.paddingBottom ?? 0,
                node.paddingLeft ?? 0,
            ],
        };
    }
    if (typeof node.cornerRadius === "number")
        self.radius = node.cornerRadius;
    if (node.rectangleCornerRadii)
        self.radii = [...node.rectangleCornerRadii];
    if (typeof node.strokeWeight === "number")
        self.strokeWeight = node.strokeWeight;
    const fill = firstSolidFill(node.fills);
    if (fill)
        self.fill = fill;
    if (node.style &&
        typeof node.style.fontFamily === "string" &&
        typeof node.style.fontSize === "number" &&
        typeof node.style.fontWeight === "number") {
        self.font = {
            family: node.style.fontFamily,
            size: node.style.fontSize,
            weight: node.style.fontWeight,
            ...(typeof node.style.lineHeightPx === "number"
                ? { lineHeight: node.style.lineHeightPx }
                : {}),
        };
    }
    const effects = effectStrings(node.effects);
    if (effects.length)
        self.effects = effects;
    return self;
}
/** Preorder flatten — the verifier reads a flat list and no rule walks upward,
 *  so every non-root node carries its `parentId`.
 *
 *  A `visible: false` child is not on screen, so it and everything under it is
 *  dropped. A hidden requested root leaves nothing to measure and is refused. */
export function flatten(root) {
    if (root.visible === false)
        throw new NotComparableError("design root is hidden");
    const nodes = [];
    const walk = (node, parentId) => {
        const kids = (node.children ?? []).filter((c) => c.visible !== false);
        nodes.push(readOne(node, kids, parentId));
        for (const k of kids)
            walk(k, node.id);
    };
    walk(root);
    return { root: nodes[0], nodes };
}
