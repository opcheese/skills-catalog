import type { RgbaImage } from "./png.js";
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface Insets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface Line {
    top: number;
    bottom: number;
    height: number;
}
export interface ProbeOptions {
    /** Image pixels per CSS pixel. Default 1. */
    scale?: number;
    /** Sum of absolute RGB differences above which a pixel differs from a colour. Default 12. */
    tolerance?: number;
}
export type Side = "top" | "right" | "bottom" | "left";
export interface Rim {
    /** CSS pixels. */
    width: number;
    kind: "none" | "border" | "shadow";
    /** The border colour, for a border. */
    hex?: string;
}
export interface ProbeResult {
    status: "measured" | "nothing";
    reason?: string;
    /** The box as given, image pixels. */
    box: Box;
    /** Dominant colour of a ring outside the box. */
    background?: string;
    /** Snapped element box, CSS pixels. */
    bounds?: Box;
    /** Snapped element box, image pixels. */
    boundsPx?: Box;
    /** Everything that differs from the background, shadow and border included, CSS pixels. */
    outer?: Box;
    outerPx?: Box;
    /**
     * Per side, what lies between the outer edge and the fill: a one-colour band is a border and stays in
     * the box; anything else (a gradient) is a shadow and is left out of the box. null without a fill.
     */
    rim: Record<Side, Rim> | null;
    /** Sides where the element reaches the edge of the search area: the given box was too small. */
    clipped: Side[];
    /** The element's own fill; null when it has none (bare text or an icon on the background). */
    fill: {
        hex: string;
        coverage: number;
    } | null;
    /** Dominant content colour inside the element (text, icon, border); null when there is none. */
    /** exact: one colour holds a real share of the strokes; false on resampled images, where it is approximate. */
    ink: {
        hex: string;
        coverage: number;
        exact: boolean;
    } | null;
    inkBounds: Box | null;
    /** From the element's edges to its ink: the padding to content. CSS pixels. */
    insets: Insets | null;
    /** Horizontal ink bands, CSS pixels from the image top. */
    lines: Line[];
    /** Median distance between line tops, CSS pixels; null with fewer than two lines. */
    linePitch: number | null;
    /** Reasons to distrust this measurement. */
    warnings: string[];
}
/**
 * Measure one element in a screenshot from a rough box around it. Every number comes from pixels:
 * the edges are snapped to the element, colours are the dominant ones, lines are ink row bands.
 */
export declare function probe(image: RgbaImage, box: Box, options?: ProbeOptions): ProbeResult;
