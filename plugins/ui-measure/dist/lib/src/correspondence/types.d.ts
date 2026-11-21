/** Both sides carry absolute boxes, in their OWN origin. Never compared raw. */
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface DesignNode {
    id: string;
    name?: string;
    type: string;
    box?: Box;
    /** A TEXT node's `characters`, verbatim. Absent on every other type. */
    text?: string;
    /** A container whose ONLY child is a single TEXT node — Figma's shape for
     *  every shadcn text primitive (Badge, Button, and anything else drawn as a
     *  box with one label in it). The code's counterpart is one element carrying
     *  the label directly, so the two sides differ by one level of leaf
     *  granularity and by nothing else. Set at flatten time, because the trees
     *  here are flat and no rule can walk downward. */
    labelOnly?: boolean;
    /** Figma's `layoutSizingHorizontal: 'HUG'` — the node is sized to its own
     *  content rather than by its parent.
     *
     *  Carried because a HUG node has no CSS box of the same width, ever. A
     *  Figma TEXT that hugs is the glyph run; the element rendering it is
     *  usually a block that fills its parent, and the two differ by however
     *  much space the words do not occupy. Measured on the real card: 127px of
     *  text inside a 283px `truncate` container, a 156px difference that the
     *  plausibility rule correctly refuses to treat as the same box and
     *  incorrectly refuses to treat as the same THING. */
    hugsWidth?: boolean;
    /** Id of the node's parent in the design, absent on the root. The trees here
     *  are flat, so this is the only way a rule can ask "are these siblings".
     *  Set at flatten time. */
    parentId?: string;
    /** Auto-layout, when the node has it. `padding` is [top, right, bottom, left]. */
    layout?: {
        mode: "HORIZONTAL" | "VERTICAL";
        gap: number;
        padding: [number, number, number, number];
    };
    radius?: number;
    /** Unequal rectangle corners in Figma order: top-left, top-right, bottom-right, bottom-left. */
    radii?: [number, number, number, number];
    strokeWeight?: number;
    /** First visible SOLID fill: `#rrggbb`, or `rgba(...)` when translucent. */
    fill?: string;
    /** A TEXT node's type style. */
    font?: {
        family: string;
        size: number;
        weight: number;
        lineHeight?: number;
    };
    /** Visible effects, one human-readable string each. */
    effects?: string[];
}
/** The computed-style strings the spec comparison reads, verbatim from
 *  `getComputedStyle`. Parsing is the comparison's job, not the walk's. */
export interface DomStyle {
    color: string;
    backgroundColor: string;
    borderTopWidth: string;
    borderRightWidth: string;
    borderBottomWidth: string;
    borderLeftWidth: string;
    borderTopLeftRadius: string;
    borderTopRightRadius: string;
    borderBottomRightRadius: string;
    borderBottomLeftRadius: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    boxShadow: string;
    filter: string;
    backdropFilter: string;
}
export interface DomElement {
    selector: string;
    tag: string;
    testid?: string;
    /** The element's OWN text, not its descendants' — a container that merely
     *  contains a label is not itself a text leaf. */
    text?: string;
    box?: Box;
    /** Computed style, for the spec comparison. */
    style?: DomStyle;
    /** The box the element's CONTENT actually covers — the glyph run of a text
     *  leaf, or the drawn extent of a vector — in the same viewport coordinates
     *  as `box`.
     *
     *  Usually inside the element's own box, but not always: a stroked path can
     *  overflow its viewBox, and the SVG branch of the walk deliberately does
     *  not clamp it (measured: a 12.0x12.0 `<svg>` inking 13.7x13.7). No rule
     *  may assume ink is the smaller of the two.
     *
     *  Absent when the element has element children (a range over those would
     *  measure their layout, not this element's own content), when the content
     *  fills the element, or when it cannot be measured. Absent is NOT zero and
     *  never means "no content": a rule that reads it must fall back to `box`,
     *  because an element whose ink could not be measured is not thereby
     *  smaller than it is. */
    ink?: Box;
}
/** Preorder, root first. A flat list is enough: the rules need identity, type,
 *  box and position, and no rule walks upward. */
export interface DesignTree {
    root: DesignNode;
    nodes: DesignNode[];
}
export interface DomTree {
    root: DomElement;
    elements: DomElement[];
}
export interface Proposal {
    pairs: {
        nodeId: string;
        selector: string;
        /** The selector as recorded, set only when resolution rewrote `selector` to a walker path.
         *  Diagnostics report this one; verification runs on `selector`. */
        proposed?: string;
    }[];
    /** What the proposer says has no counterpart. Carried through untouched:
     *  an unmapped node is not a finding, it is an absence of one. */
    unmapped: {
        design: string[];
        impl: string[];
    };
    /** The proposer vouches that the mapping is complete: whatever it left
     *  unmapped really has no counterpart. Absent on files that predate it. */
    authoritative?: boolean;
    /** Why each unmapped id (design node id or impl selector) has no
     *  counterpart. Carried on the Proposal only; the engine does not read it. */
    unmappedReasons?: Record<string, string>;
}
export type RejectionRule = "resolvable" | "injective" | "type_compatible" | "order_consistent" | "text_consistent" | "size_plausible"
/** Not a wrong mapping — a mapping nothing here could check. */
 | "measurable";
export interface PairVerdict {
    nodeId: string;
    selector: string;
    /** The selector as recorded, when `selector` is its resolved walker path. */
    proposed?: string;
    /** `size_differs`: the only rule that failed is `size_plausible`, and the
     *  pair is kept anyway because other evidence says it is the same thing
     *  (see verify.ts). It is not in `Verification.accepted`. */
    outcome: "accepted" | "not_comparable" | "size_differs";
    /** The rule that rejected it. Absent on an accepted pair. */
    rule?: RejectionRule;
    note?: string;
}
export interface Verification {
    pairs: PairVerdict[];
    /** The subset downstream arithmetic may run on. */
    accepted: PairVerdict[];
    /** Pairs that are the same thing but differ in size, so spacing can still
     *  be measured. Disjoint from `accepted`. */
    sizeDiffers: PairVerdict[];
    /** True when the proposal as a whole is unusable. */
    rejected: boolean;
    note?: string;
}
