import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
export async function writeReport(file, report) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
export function reportSummary(report, maxLines = 20) {
    const failed = report.findings.filter((f) => f.status === "fail").length;
    const unmeasured = report.findings.filter((f) => f.status === "not_comparable").length;
    const lines = [
        `ui-measure ${report.verdict}: ${failed} failed, ${unmeasured} not comparable; ` +
            `${report.coverage.pairsAccepted}/${report.coverage.pairsProposed} pairs accepted, ${report.coverage.dropped} dropped`,
    ];
    const notable = report.findings.filter((f) => f.status !== "pass");
    const shown = notable.slice(0, Math.max(0, maxLines - 2));
    for (const finding of shown) {
        const detail = finding.status === "not_comparable"
            ? finding.reason ?? "no reason supplied"
            : `${finding.expected ?? "mismatch"} -> ${finding.actual ?? "unavailable"}`;
        lines.push(`${finding.status} ${finding.check}/${finding.kind} ${finding.target.selector}: ${detail}`.replaceAll("\n", " "));
    }
    if (shown.length < notable.length && lines.length < maxLines) {
        lines.push(`... ${notable.length - shown.length} more findings`);
    }
    return lines.join("\n");
}
