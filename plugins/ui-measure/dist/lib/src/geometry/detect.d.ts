import type { OpenPage } from "../dom/open.js";
import type { Finding } from "../report/types.js";
export interface GeometryConfig {
    /** A text box nearer than this to its container's padding edge is flush. CSS px, not scaled. */
    insetPx: number;
    /** Selectors of elements that must never scroll (a scrollbar there is a defect). */
    nonScrolling: string[];
}
/** Layout defects that need no design to judge: text cut off, collapsed, off the page, jammed
 *  against its container's edge, or a scrollbar where none belongs. Detectors run in the page,
 *  scoped to the subtree under the root, and skip elements that are not drawn. Returns only
 *  failures; a clean page yields [].
 *
 *  Same `__name` trap as src/dom/tree.ts: the code inside `page.evaluate` declares no functions.
 *  An element has "text" when it owns a non-whitespace text node. One element yields at most one
 *  finding (the first defect found, in the order zero-size, clipped, off-canvas, flush-edge). */
export declare function detectGeometry(p: OpenPage, cfg: GeometryConfig): Promise<Finding[]>;
