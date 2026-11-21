import type { DesignTree, DomTree, Verification } from "../correspondence/types.js";
import type { Finding, Report } from "../report/types.js";
import { type Token } from "../tokens/index.js";
/** Figma stroke vs CSS border: the smallest difference worth reporting, in design px. */
export declare const TOLERANCE_FLOOR_PX = 2;
type Rgba = [number, number, number, number];
interface Shadow {
    inset: boolean;
    x: number;
    y: number;
    blur: number;
    spread: number;
    colour: Rgba;
}
/** The readable `drop-shadow(...)` entries of a CSS `filter`, in the shape `box-shadow` entries parse to. */
export declare function parseFilterShadows(filter: string): Shadow[];
export declare function compareSpec(design: DesignTree, dom: DomTree, v: Verification, opts: {
    scale: number;
    tokens?: Token[];
    unthemed?: string[];
    authoritative?: boolean;
}): {
    findings: Finding[];
    coverage: Report["coverage"];
};
export {};
