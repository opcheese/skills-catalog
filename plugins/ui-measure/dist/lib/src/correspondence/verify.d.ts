import type { Box, DesignNode, DesignTree, DomElement, DomTree, Proposal, Verification } from "./types.js";
/** How far a normalised design box's SIZE may differ from its element's and
 *  still be a plausible correspondence.
 *
 *  IDENTITY IS DECIDED WITHOUT POSITION, AND THAT IS THE WHOLE POINT. The rule
 *  this replaces compared whole boxes, which answered two different questions
 *  with one number: *could these be the same thing* and *are these in the same
 *  place*. Position is the thing downstream arithmetic exists to measure, so
 *  using it to decide comparability made the mechanism blind to exactly the
 *  defect class it was built for — the bigger the shift, the more certain the
 *  verifier was that it was not a real pair. Measured 2026-08-18: the seeded
 *  45px illustration shift and the card's own 15px deviation were BOTH
 *  discarded as implausible rather than reported as mismatches.
 *
 *  Size is not position: a translated element keeps its width and height, so a
 *  positional defect cannot hide from a size rule, and a size rule still
 *  separates candidates a translation would not.
 *
 *  The number, from the same measurement over the real card: correct pairs
 *  differ by 0-5px in width and height (5px on the TEXT nodes, where the font
 *  metric resolves differently), and the one genuinely WRONG pair the model
 *  proposed — the title TEXT claimed by a full-width wrapper — differs by
 *  156px. 8px is above every correct pair and far below the wrong one.
 *
 *  This is NOT the conformance tolerance. conformance.ts uses EPSILON = 0.5
 *  because it is measuring; here the question is only whether two things could
 *  be the same thing. */
export declare const SIZE_TOLERANCE_PX = 8;
/** The design's origin is the Figma canvas (e.g. {x: 429, y: 214}); the DOM's
 *  is the viewport. Raw coordinates are not comparable, so a design box is
 *  expressed in the element coordinate space of the DOM root: translated by the
 *  two roots' origins and multiplied by `scale`, the CSS pixels per design
 *  pixel (the live root font size over the design's root font size, so a 5px
 *  live root against a 10px design root gives 0.5 and CSS boxes half the
 *  design's).
 *
 *  The roots' WIDTH RATIO is deliberately not used. A ratio inferred from the
 *  two roots silently absorbs a real width deviation of the root into every
 *  child's box, so the one defect the root comparison exists to report would
 *  be divided out before any pair was measured. The scale is a stated input,
 *  never an inference. */
export declare function normalise(box: Box, designRoot: Box, domRoot: Box, scale: number): Box;
/** Reading order: top to bottom, then left to right within a row. Applied to
 *  BOTH sides in the same coordinate space, so a correct mapping produces the
 *  same sequence on both and needs no cross-taxonomy assumption.
 *
 *  A box is on a row when its CENTRE sits within half the shorter height of the
 *  row's first member's centre. A line is where things are centred on, not
 *  where their tops happen to fall: a top-edge proxy answers "same line"
 *  wrongly precisely when two boxes on one line have different heights, which
 *  is the bullet — a 9px dot beside a 22px tag has its top further down not
 *  because it is on another line but because it is smaller and centred.
 *
 *  Rows are ASSIGNED first, then sorted. Comparing y inside the comparator is
 *  not transitive — with three boxes 6px apart, a and b are the
 *  same row, b and c are the same row, and a and c are not, so the result
 *  depends on the order the sort happens to compare them in. Two sides that
 *  agree would then rank differently for no reason but input order, and rule 3
 *  would reject correct pairs. */
export declare function readingOrder(boxes: Box[]): number[];
/** The box on the implementation side that is comparable to `node`'s.
 *
 *  For a node Figma sized to its own content, that is the element's ink: the
 *  design box IS the glyph run or the drawn path, so the element's border box
 *  is the wrong end of the comparison and differs by however much empty space
 *  the parent gave it.
 *
 *  Falls back to the border box whenever ink was not measured. Absent ink
 *  means "not measured", never "zero" — an element whose range could not be
 *  read is not thereby smaller than it is, and a rule that treated it as such
 *  would reject correct pairs on a browser quirk. */
export declare function comparableBox(node: DesignNode, el: DomElement): Box;
export declare function verifyMapping(proposal: Proposal, design: DesignTree, dom: DomTree, opts: {
    scale: number;
    notes?: Record<string, string>;
}): Verification;
