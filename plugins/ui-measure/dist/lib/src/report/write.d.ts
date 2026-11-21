import type { Report } from "./types.js";
export declare function writeReport(file: string, report: Report): Promise<void>;
export declare function reportSummary(report: Report, maxLines?: number): string;
