import { type ProbeResult } from "./probe.js";
export declare const PROBE_USAGE = "  ui-measure probe IMAGE.png --box X,Y,W,H [--box ...] [--scale S | --frame-width W]\n    [--tolerance N] [--json OUT]\n    (boxes in image pixels; results in CSS pixels = image pixels / scale)";
export interface ProbeReport {
    tool: "ui-measure";
    version: string;
    kind: "probe";
    image: {
        path: string;
        width: number;
        height: number;
    };
    scale: number;
    scaleSource: "flag" | "frame-width" | "assumed";
    warnings: string[];
    probes: ProbeResult[];
}
/** Run `ui-measure probe`; returns the exit code (0 measured, 2 a box measured nothing). */
export declare function probeCommand(args: string[]): Promise<number>;
