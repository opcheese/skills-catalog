import type { DesignTree, DomTree, Verification } from "../correspondence/types.js";
import type { Finding, Report } from "../report/types.js";
import { type Token } from "../tokens/index.js";
/** Figma stroke vs CSS border: the smallest difference worth reporting, in design px. */
export declare const TOLERANCE_FLOOR_PX = 2;
export declare function compareSpec(design: DesignTree, dom: DomTree, v: Verification, opts: {
    scale: number;
    tokens?: Token[];
    unthemed?: string[];
}): {
    findings: Finding[];
    coverage: Report["coverage"];
};
