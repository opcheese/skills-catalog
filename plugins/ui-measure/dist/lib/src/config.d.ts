import type { PageSpec } from "./dom/adapters.js";
import type { GeometryConfig } from "./geometry/detect.js";
export interface Target extends PageSpec {
    node?: string;
    figma?: {
        fileKey?: string;
        nodeId: string;
    };
}
export interface Config {
    targets: Record<string, Target>;
    tokens?: {
        path: string;
        format: "rows" | "dtcg";
    };
    unthemed?: string[];
    geometry?: GeometryConfig;
    baselineDir?: string;
}
export declare function loadConfig(file: string): Config;
