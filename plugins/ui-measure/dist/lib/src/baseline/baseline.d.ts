import type { Finding, Report } from "../report/types.js";
/** How a finding is identified across runs.
 *
 *  NOT the design node id alone, and not a raw id at all: ids change between
 *  design edits, and a design tree with coincident parent and child offers two
 *  correct answers to "which node is this", so an id-only key would report the
 *  same inherited defect as newly introduced whenever the mapping changed its
 *  mind. The key is the check, the kind, the node's design name (or the
 *  selector when there is none) and the rounded expected/actual values. */
export declare function baselineKey(f: Finding): string;
/** Sets `origin` on every fail finding: inherited when the baseline records
 *  the same defect, introduced otherwise. Other statuses have any existing
 *  origin stripped -- only fail findings are ever recorded or classified.
 *  Input is not mutated. */
export declare function classify(findings: Finding[], baseline: Finding[]): Finding[];
/** Baseline file for a target. The target names a file, so it may not carry a
 *  path separator or climb out of the directory. */
export declare function baselinePath(dir: string, target: string): string;
/** Stable JSON -- sorted keys, 2-space indent, trailing newline -- so a
 *  baseline change is a reviewable diff. */
export declare function serialiseBaseline(findings: Finding[]): string;
/** The recorded findings, or [] when the file does not exist.
 *
 *  A malformed file THROWS. A failed read that returned [] would be
 *  indistinguishable from "nothing recorded yet", and the caller treats the
 *  second as a reason to record one rather than a reason to stop. */
export declare function readBaseline(dir: string, target: string): Finding[];
/** Records the run's fail findings as the baseline for `target`.
 *
 *  THE RULE: a run that could not measure must not become a baseline. Anything
 *  the run failed to measure is simply absent from the recorded entries, and
 *  absence is indistinguishable from "this element conforms".
 *
 *  An existing baseline is only replaced with `force`: an accidental refresh
 *  silently converts every introduced defect into an inherited one, which is
 *  the gate disarming itself. */
export declare function recordBaseline(dir: string, target: string, r: Report, opts?: {
    force?: boolean;
}): void;
