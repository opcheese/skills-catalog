import type { Box, DesignTree } from "../correspondence/types.js";
interface RawColor {
    r: number;
    g: number;
    b: number;
    a?: number;
}
interface RawPaint {
    type?: string;
    visible?: boolean;
    opacity?: number;
    color?: RawColor;
}
interface RawEffect {
    type?: string;
    visible?: boolean;
    radius?: number;
    spread?: number;
    color?: RawColor;
    offset?: {
        x: number;
        y: number;
    };
}
export interface RawNode {
    id: string;
    name?: string;
    type: string;
    /** Figma's own flag; absent means visible. */
    visible?: boolean;
    /** A TEXT node's string. The verifier uses it to REFUTE a swap. */
    characters?: string;
    absoluteBoundingBox?: Box;
    layoutSizingHorizontal?: string;
    layoutMode?: string;
    itemSpacing?: number;
    paddingTop?: number;
    paddingRight?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    cornerRadius?: number;
    strokeWeight?: number;
    fills?: RawPaint[];
    effects?: RawEffect[];
    style?: {
        fontFamily?: string;
        fontSize?: number;
        fontWeight?: number;
        lineHeightPx?: number;
    };
    children?: RawNode[];
}
/** The input is a `GET /v1/files/:key/nodes` response, or the node itself.
 *
 *  A multi-node response has no meaningful "first" node, and picking one would
 *  measure a different component than the one asked for. */
export declare function readNode(json: unknown, nodeId?: string): RawNode;
/** Preorder flatten — the verifier reads a flat list and no rule walks upward,
 *  so every non-root node carries its `parentId`.
 *
 *  A `visible: false` node is not on screen, so it and everything under it is
 *  dropped: nothing in the DOM can correspond to it. */
export declare function flatten(root: RawNode): DesignTree;
export {};
