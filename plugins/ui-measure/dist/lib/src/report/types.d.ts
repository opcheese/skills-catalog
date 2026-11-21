import type { RejectionRule } from "../correspondence/types.js";
export type Status = "pass" | "fail" | "not_comparable";
export interface Finding {
    check: "geometry" | "spec";
    kind: string;
    status: Status;
    origin?: "introduced" | "inherited";
    target: {
        selector: string;
        designNode?: string;
        text?: string;
    };
    expected?: string;
    actual?: string;
    deltaPx?: number;
    reason?: string;
}
export interface Report {
    tool: "ui-measure";
    version: string;
    ranAt: string;
    page: {
        url: string;
        viewport: [number, number];
        screen: [number, number];
        dpr: number;
    };
    scale: number;
    findings: Finding[];
    coverage: {
        pairsProposed: number;
        pairsAccepted: number;
        dropped: number;
        authoritative: boolean;
        /** Every proposed pair the verifier did not accept, with the selector as proposed and why.
         *  Diagnostic only: the verdict does not read it. */
        rejected: {
            nodeId: string;
            selector: string;
            rule: RejectionRule;
            note?: string;
        }[];
    };
    verdict: "clean" | "mismatches" | "not_comparable";
}
