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
    };
    verdict: "clean" | "mismatches" | "not_comparable";
}
