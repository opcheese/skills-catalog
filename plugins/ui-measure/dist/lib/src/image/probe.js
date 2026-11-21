/** Area share of non-background pixels above which an element counts as having its own fill. */
const FILLED_SHARE = 0.75;
/** A row or column is inside the fill when it holds at least this share of the widest fill run. */
const FILL_RUN_SHARE = 0.25;
/** A rim side is a border when this share of it is one colour and it is at most BORDER_MAX CSS px wide. */
const BORDER_SAME_SHARE = 0.8;
const BORDER_MAX = 4;
/** Ink at least this share of the way to the farthest ink pixel sets extent and lines... */
const STRONG_SHARE = 0.25;
/** ...and at least this share sets the ink colour. */
const CORE_SHARE = 0.5;
/** The dominant ink colour is exact when it holds this share of the core stroke pixels. */
const EXACT_SHARE = 0.2;
/** The ring around the box is one background when this share of it matches the dominant colour. */
const RING_SAME_SHARE = 0.7;
/** An enclosed region joins the element (a card inside its shadow ring) only above this share of it. */
const HOLE_SHARE = 0.25;
/** 4-connected flood from the perimeter of a w x h grid over cells where passable(i) holds. */
function flood(w, h, passable) {
    const seen = new Uint8Array(w * h);
    const queue = [];
    const seed = (x, y) => {
        const i = y * w + x;
        if (!seen[i] && passable(i)) {
            seen[i] = 1;
            queue.push(i);
        }
    };
    for (let x = 0; x < w; x++) {
        seed(x, 0);
        seed(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
        seed(0, y);
        seed(w - 1, y);
    }
    for (let k = 0; k < queue.length; k++) {
        const i = queue[k];
        const x = i % w;
        const y = (i - x) / w;
        if (x + 1 < w)
            seed(x + 1, y);
        if (x > 0)
            seed(x - 1, y);
        if (y + 1 < h)
            seed(x, y + 1);
        if (y > 0)
            seed(x, y - 1);
    }
    return seen;
}
function distance(d, o, c) {
    return Math.abs(d[o] - c[0]) + Math.abs(d[o + 1] - c[1]) + Math.abs(d[o + 2] - c[2]);
}
/**
 * Most frequent exact colour. Exact, not binned: 4-bit-per-channel bins (one-shot-ui's approach) put
 * white and #f2f4f7 in one bin, and light UI surfaces are exactly the colours that must stay apart.
 * PNG is lossless, so a solid surface is one exact colour and anti-aliasing scatters around it.
 */
function dominant(d, offsets) {
    const counts = new Map();
    let best = -1;
    let bestCount = 0;
    for (const o of offsets) {
        const key = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        if (n > bestCount) {
            bestCount = n;
            best = key;
        }
    }
    return best < 0 ? undefined : [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const colourDistance = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const round = (v) => Math.round(v * 100) / 100;
const share = (v) => Math.round(v * 1000) / 1000;
function clip(box, image) {
    const x0 = Math.max(0, Math.floor(box.x));
    const y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(image.width, Math.ceil(box.x + box.width));
    const y1 = Math.min(image.height, Math.ceil(box.y + box.height));
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : undefined;
}
const grow = (b, m) => ({ x: b.x - m, y: b.y - m, width: b.width + 2 * m, height: b.height + 2 * m });
const inside = (b, x, y) => x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height;
function* pixels(image, b, skip) {
    for (let y = b.y; y < b.y + b.height; y++) {
        for (let x = b.x; x < b.x + b.width; x++)
            if (!skip || !inside(skip, x, y))
                yield (y * image.width + x) * 4;
    }
}
/**
 * Measure one element in a screenshot from a rough box around it. Every number comes from pixels:
 * the edges are snapped to the element, colours are the dominant ones, lines are ink row bands.
 */
export function probe(image, box, options = {}) {
    const scale = options.scale ?? 1;
    const tol = options.tolerance ?? 12;
    const empty = { box, warnings: [], rim: null, clipped: [], fill: null, ink: null, inkBounds: null, insets: null, lines: [], linePitch: null };
    const given = clip(box, image);
    if (!given)
        return { ...empty, status: "nothing", reason: "the box is outside the image" };
    const d = image.data;
    const m = Math.max(4, Math.round(0.1 * Math.min(given.width, given.height)));
    const search = clip(grow(given, m), image);
    const ringOuter = clip(grow(given, 2 * m), image);
    const ring = [...pixels(image, ringOuter, search)];
    let bg = dominant(d, ring);
    bg ??= dominant(d, pixels(image, { x: 0, y: 0, width: image.width, height: image.height }));
    const warnings = [];
    if (ring.length && ring.filter((o) => distance(d, o, bg) <= tol).length / ring.length < RING_SAME_SHARE) {
        warnings.push("the surrounding colour is mixed (the box sits across a boundary); the background guess may be wrong, move or resize the box");
    }
    const css = (v) => round(v / scale);
    const cssBox = (b) => ({ x: css(b.x), y: css(b.y), width: css(b.width), height: css(b.height) });
    // Non-background mask over the search area; keep the 8-connected components that touch the box.
    const sw = search.width;
    const mask = new Uint8Array(sw * search.height);
    for (let y = 0; y < search.height; y++) {
        for (let x = 0; x < sw; x++) {
            if (distance(d, ((search.y + y) * image.width + search.x + x) * 4, bg) > tol)
                mask[y * sw + x] = 1;
        }
    }
    const kept = new Uint8Array(mask.length);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || kept[start])
            continue;
        const component = [start];
        kept[start] = 2;
        let touches = false;
        for (let k = 0; k < component.length; k++) {
            const p = component[k];
            const px = p % sw;
            const py = (p - px) / sw;
            if (inside(given, search.x + px, search.y + py))
                touches = true;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = px + dx;
                    const ny = py + dy;
                    if (nx < 0 || ny < 0 || nx >= sw || ny >= search.height)
                        continue;
                    const q = ny * sw + nx;
                    if (mask[q] && !kept[q]) {
                        kept[q] = 2;
                        component.push(q);
                    }
                }
            }
        }
        for (const p of component) {
            kept[p] = touches ? 1 : 3;
            if (!touches)
                continue;
            const px = p % sw;
            const py = (p - px) / sw;
            x0 = Math.min(x0, px);
            y0 = Math.min(y0, py);
            x1 = Math.max(x1, px);
            y1 = Math.max(y1, py);
        }
    }
    if (x1 < 0) {
        return { ...empty, warnings, status: "nothing", background: hex(bg), reason: "nothing in the box differs from the surrounding colour" };
    }
    const clipped = [];
    if (y0 === 0)
        clipped.push("top");
    if (x1 === sw - 1)
        clipped.push("right");
    if (y1 === search.height - 1)
        clipped.push("bottom");
    if (x0 === 0)
        clipped.push("left");
    const outer = { x: search.x + x0, y: search.y + y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    const at = (x, y) => (y - search.y) * sw + (x - search.x);
    const off = (x, y) => (y * image.width + x) * 4;
    // What the element encloses belongs to it: a white card inside its grey shadow ring is the card.
    // Only a large enclosed region counts: letter counters are small holes and stay outside.
    const exterior = flood(sw, search.height, (i) => kept[i] !== 1);
    const enclosed = new Uint8Array(mask.length);
    const outerAreaPx = outer.width * outer.height;
    for (let start = 0; start < mask.length; start++) {
        if (kept[start] === 1 || exterior[start] || enclosed[start])
            continue;
        const region = [start];
        enclosed[start] = 2;
        for (let k = 0; k < region.length; k++) {
            const i = region[k];
            const x = i % sw;
            for (const j of [i - sw, i + sw, x > 0 ? i - 1 : -1, x + 1 < sw ? i + 1 : -1]) {
                if (j >= 0 && j < mask.length && kept[j] !== 1 && !exterior[j] && !enclosed[j]) {
                    enclosed[j] = 2;
                    region.push(j);
                }
            }
        }
        const big = region.length >= HOLE_SHARE * outerAreaPx;
        for (const i of region)
            enclosed[i] = big ? 1 : 3;
    }
    const isElement = (x, y) => kept[at(x, y)] === 1 || enclosed[at(x, y)] === 1;
    const outerArea = outer.width * outer.height;
    let solid = 0;
    for (let y = outer.y; y < outer.y + outer.height; y++) {
        for (let x = outer.x; x < outer.x + outer.width; x++)
            if (isElement(x, y))
                solid++;
    }
    let bounds = outer;
    let fill = null;
    let rim = null;
    let ref = bg;
    if (solid / outerArea >= FILLED_SHARE) {
        const own = [];
        for (let y = outer.y; y < outer.y + outer.height; y++) {
            for (let x = outer.x; x < outer.x + outer.width; x++)
                if (isElement(x, y))
                    own.push(off(x, y));
        }
        ref = dominant(d, own);
        // Fill extent: rows and columns where the fill colour is a real share of the widest run.
        const rowFill = new Array(outer.height).fill(0);
        const colFill = new Array(outer.width).fill(0);
        for (let y = outer.y; y < outer.y + outer.height; y++) {
            for (let x = outer.x; x < outer.x + outer.width; x++) {
                if (distance(d, off(x, y), ref) <= tol) {
                    rowFill[y - outer.y]++;
                    colFill[x - outer.x]++;
                }
            }
        }
        const span = (counts) => {
            const max = Math.max(...counts);
            const first = counts.findIndex((c) => c >= FILL_RUN_SHARE * max);
            let last = counts.length - 1;
            while (last > first && counts[last] < FILL_RUN_SHARE * max)
                last--;
            return [first, last];
        };
        const [fy0, fy1] = span(rowFill);
        const [fx0, fx1] = span(colFill);
        const fillBox = { x: outer.x + fx0, y: outer.y + fy0, width: fx1 - fx0 + 1, height: fy1 - fy0 + 1 };
        const band = {
            top: { x: fillBox.x, y: outer.y, width: fillBox.width, height: fillBox.y - outer.y },
            bottom: { x: fillBox.x, y: fillBox.y + fillBox.height, width: fillBox.width, height: outer.y + outer.height - fillBox.y - fillBox.height },
            left: { x: outer.x, y: fillBox.y, width: fillBox.x - outer.x, height: fillBox.height },
            right: { x: fillBox.x + fillBox.width, y: fillBox.y, width: outer.x + outer.width - fillBox.x - fillBox.width, height: fillBox.height },
        };
        rim = {};
        const keep = {};
        for (const side of ["top", "right", "bottom", "left"]) {
            const b = band[side];
            const width = side === "top" || side === "bottom" ? b.height : b.width;
            if (width <= 0 || b.width <= 0 || b.height <= 0) {
                rim[side] = { width: 0, kind: "none" };
                continue;
            }
            const offsets = [...pixels(image, b)];
            const colour = dominant(d, offsets);
            const same = offsets.filter((o) => distance(d, o, colour) <= tol).length / offsets.length;
            const border = same >= BORDER_SAME_SHARE && width / scale <= BORDER_MAX;
            keep[side] = border;
            rim[side] = border ? { width: css(width), kind: "border", hex: hex(colour) } : { width: css(width), kind: "shadow" };
        }
        // A border is the same colour and width all round; a shadow differs by side (offset, falloff).
        const borders = ["top", "right", "bottom", "left"].filter((side) => rim[side].kind === "border");
        const nonEmpty = ["top", "right", "bottom", "left"].filter((side) => rim[side].kind !== "none");
        const first = borders[0] && hexRgb(rim[borders[0]].hex);
        const consistent = borders.length === nonEmpty.length &&
            borders.every((side) => colourDistance(hexRgb(rim[side].hex), first) <= tol && rim[side].width === rim[borders[0]].width);
        if (!consistent) {
            for (const side of borders) {
                rim[side] = { width: rim[side].width, kind: "shadow" };
                keep[side] = false;
            }
        }
        const left = keep.left ? outer.x : fillBox.x;
        const top = keep.top ? outer.y : fillBox.y;
        const right = keep.right ? outer.x + outer.width : fillBox.x + fillBox.width;
        const bottom = keep.bottom ? outer.y + outer.height : fillBox.y + fillBox.height;
        bounds = { x: left, y: top, width: right - left, height: bottom - top };
        let near = 0;
        for (const o of pixels(image, bounds))
            if (distance(d, o, ref) <= tol)
                near++;
        fill = { hex: hex(ref), coverage: share(near / (bounds.width * bounds.height)) };
    }
    let area = bounds.width * bounds.height;
    // Inside a filled element, anything not fill-coloured that connects to the edge is edge (rounded
    // corners, anti-aliasing, border, shadow), not ink. Text is enclosed by fill, so even white text on
    // a white page is never reached.
    const outsideEl = fill
        ? flood(bounds.width, bounds.height, (i) => {
            const lx = i % bounds.width;
            return distance(d, off(bounds.x + lx, bounds.y + (i - lx) / bounds.width), ref) > tol;
        })
        : new Uint8Array(area);
    // Ink: content pixels inside the element. Its colour, extent and lines come from the strong ink, the
    // pixels at least STRONG_SHARE of the way to the farthest one, so anti-aliasing and faint tints around
    // the content do not decide them.
    const candidates = [];
    let farthest = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
        for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
            const o = off(x, y);
            const isInk = fill
                ? !outsideEl[(y - bounds.y) * bounds.width + (x - bounds.x)] && distance(d, o, ref) > tol
                : kept[at(x, y)] === 1 && inside(search, x, y);
            if (!isInk)
                continue;
            candidates.push(o);
            farthest = Math.max(farthest, distance(d, o, ref));
        }
    }
    const strongMin = Math.max(tol, STRONG_SHARE * farthest);
    const strong = candidates.filter((o) => distance(d, o, ref) >= strongMin);
    const coreMin = Math.max(tol, CORE_SHARE * farthest);
    const inkOffsets = strong;
    let ix0 = Infinity, iy0 = Infinity, ix1 = -Infinity, iy1 = -Infinity;
    for (const o of strong) {
        const p = o / 4;
        const x = p % image.width;
        const y = (p - x) / image.width;
        ix0 = Math.min(ix0, x);
        iy0 = Math.min(iy0, y);
        ix1 = Math.max(ix1, x);
        iy1 = Math.max(iy1, y);
    }
    // Bare content (no fill) is its own box: snap to the strong ink.
    if (!fill && strong.length >= 4) {
        bounds = { x: ix0, y: iy0, width: ix1 - ix0 + 1, height: iy1 - iy0 + 1 };
    }
    const rows = new Uint8Array(bounds.height);
    for (const o of strong) {
        const p = o / 4;
        const y = (p - (p % image.width)) / image.width;
        if (y >= bounds.y && y < bounds.y + bounds.height)
            rows[y - bounds.y] = 1;
    }
    area = bounds.width * bounds.height;
    let ink = null;
    let inkBounds = null;
    let insets = null;
    const lines = [];
    if (inkOffsets.length >= 4) {
        const core = inkOffsets.filter((o) => distance(d, o, ref) >= coreMin);
        const colour = dominant(d, core);
        const exactShare = core.filter((o) => distance(d, o, colour) === 0).length / core.length;
        ink = { hex: hex(colour), coverage: share(candidates.length / area), exact: exactShare >= EXACT_SHARE };
        if (!ink.exact)
            warnings.push("the ink colour is approximate: no single colour dominates the strokes (a resampled image?)");
        const inkPx = { x: ix0, y: iy0, width: ix1 - ix0 + 1, height: iy1 - iy0 + 1 };
        inkBounds = cssBox(inkPx);
        insets = {
            top: css(inkPx.y - bounds.y),
            right: css(bounds.x + bounds.width - (inkPx.x + inkPx.width)),
            bottom: css(bounds.y + bounds.height - (inkPx.y + inkPx.height)),
            left: css(inkPx.x - bounds.x),
        };
        for (let r = 0; r < rows.length; r++) {
            if (!rows[r] || (r > 0 && rows[r - 1]))
                continue;
            let end = r;
            while (end < rows.length && rows[end])
                end++;
            lines.push({ top: css(bounds.y + r), bottom: css(bounds.y + end), height: css(end - r) });
        }
    }
    const tops = lines.map((l) => l.top);
    const steps = tops.slice(1).map((t, i) => t - tops[i]).sort((a, b) => a - b);
    const linePitch = steps.length ? round(steps[Math.floor((steps.length - 1) / 2)]) : null;
    return {
        status: "measured",
        box,
        background: hex(bg),
        bounds: cssBox(bounds),
        boundsPx: bounds,
        outer: cssBox(outer),
        outerPx: outer,
        rim,
        clipped,
        fill,
        ink,
        inkBounds,
        insets,
        lines,
        linePitch,
        warnings,
    };
}
