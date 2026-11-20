// A baseline: what a page ALREADY diverges by, so the gate can block on what a
// change INTRODUCED rather than on the accumulated state of the repo.
//
// Without it the gate reports absolute conformance and nothing else, which on
// a real codebase means it is red from the first run and stays red -- a gate
// that is always red is a gate nobody reads.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { BaselineExistsError, PartialRunError } from "../errors"
import type { Finding, Report } from "../report/types"

/** Growth beyond this at a known key is a regression, not the same defect.
 *  Equals the geometric tolerance floor (2px): below it, two measurements of
 *  one divergence are indistinguishable. */
const GROWTH_TOLERANCE_PX = 2

/** Round every number inside a string to whole pixels ("16.4px" -> "16px").
 *  Sub-pixel jitter between renders is real, and a key that moved with it
 *  would mint a new identity every run. */
function roundNumbers(s: string | undefined): string {
  if (s === undefined) return ""
  return s.replace(/-?\d+(?:\.\d+)?/g, (n) => String(Math.round(Number(n)) + 0))
}

/** How a finding is identified across runs.
 *
 *  NOT the design node id alone, and not a raw id at all: ids change between
 *  design edits, and a design tree with coincident parent and child offers two
 *  correct answers to "which node is this", so an id-only key would report the
 *  same inherited defect as newly introduced whenever the mapping changed its
 *  mind. The key is the check, the kind, the node's design name (or the
 *  selector when there is none) and the rounded expected/actual values. */
export function baselineKey(f: Finding): string {
  const subject = f.target.designNode ?? f.target.selector
  return [f.check, f.kind, subject, roundNumbers(f.expected), roundNumbers(f.actual)].join("|")
}

/** Sets `origin` on every fail finding: inherited when the baseline records
 *  the same defect, introduced otherwise. Other statuses have any existing
 *  origin stripped -- only fail findings are ever recorded or classified.
 *  Input is not mutated. */
export function classify(findings: Finding[], baseline: Finding[]): Finding[] {
  const known = new Map(baseline.map((b) => [baselineKey(b), b]))
  return findings.map((f) => {
    if (f.status !== "fail") {
      const { origin: _origin, ...rest } = f
      return rest
    }
    const was = known.get(baselineKey(f))
    return { ...f, origin: isSameDefect(f, was) ? "inherited" : "introduced" }
  })
}

function isSameDefect(now: Finding, was: Finding | undefined): boolean {
  if (!was) return false
  // A delta that is not a finite number was not measured. It cannot be
  // compared to anything, so it blocks -- never falls through to inherited.
  if (
    (now.deltaPx !== undefined && !Number.isFinite(now.deltaPx)) ||
    (was.deltaPx !== undefined && !Number.isFinite(was.deltaPx))
  ) {
    return false
  }
  // A divergence that GREW is a new defect at an old location. Calling it
  // inherited would let a regression hide behind an existing one.
  if (now.deltaPx !== undefined && was.deltaPx !== undefined && now.deltaPx - was.deltaPx > GROWTH_TOLERANCE_PX) {
    return false
  }
  return true
}

/** Baseline file for a target. The target names a file, so it may not carry a
 *  path separator or climb out of the directory. */
export function baselinePath(dir: string, target: string): string {
  if (target === "" || target === "." || target === ".." || /[\\/]/.test(target)) {
    throw new Error(`unusable baseline target ${JSON.stringify(target)}: it must be a plain name, not a path`)
  }
  return path.join(dir, `${target}.json`)
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    )
  }
  return value
}

/** Stable JSON -- sorted keys, 2-space indent, trailing newline -- so a
 *  baseline change is a reviewable diff. */
export function serialiseBaseline(findings: Finding[]): string {
  return `${JSON.stringify(sortKeys(findings), null, 2)}\n`
}

/** The recorded findings, or [] when the file does not exist.
 *
 *  A malformed file THROWS. A failed read that returned [] would be
 *  indistinguishable from "nothing recorded yet", and the caller treats the
 *  second as a reason to record one rather than a reason to stop. */
export function readBaseline(dir: string, target: string): Finding[] {
  const file = baselinePath(dir, target)
  let raw: string
  try {
    raw = readFileSync(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${String(error)}`)
  }
  return validate(parsed, file)
}

/** Everything the classifier assumes, checked once, at the boundary. A file
 *  that fails these still parses as JSON, and every such failure would land on
 *  the non-blocking side of the classification -- the wrong default. */
function validate(parsed: unknown, file: string): Finding[] {
  const bad = (why: string): never => {
    throw new Error(`${file} is not a usable baseline: ${why}`)
  }
  if (!Array.isArray(parsed)) bad("not an array of findings")
  const seen = new Set<string>()
  for (const [i, raw] of (parsed as unknown[]).entries()) {
    if (typeof raw !== "object" || raw === null) bad(`entry ${i} is not an object`)
    const f = raw as Partial<Finding>
    if (f.status !== "fail") bad(`entry ${i} is not a fail finding`)
    if (typeof f.check !== "string" || typeof f.kind !== "string") bad(`entry ${i} has no check or kind`)
    if (typeof f.target?.selector !== "string") bad(`entry ${i} has no target selector`)
    if (f.deltaPx !== undefined && (typeof f.deltaPx !== "number" || !Number.isFinite(f.deltaPx))) {
      bad(`entry ${i} has a deltaPx that is not a finite number`)
    }
    for (const field of ["expected", "actual"] as const) {
      if (f[field] !== undefined && typeof f[field] !== "string") bad(`entry ${i} has a non-string ${field}`)
    }
    // Two entries at one key mean two answers to "what does this diverge by".
    const key = baselineKey(f as Finding)
    if (seen.has(key)) bad(`duplicate key ${key}`)
    seen.add(key)
  }
  return parsed as Finding[]
}

const WHY_A_PARTIAL_RUN_IS_NOT_A_BASELINE =
  "A baseline recorded from a partial run silently narrows what the gate " +
  "can ever detect: everything the run failed to measure is absent from the " +
  "baseline, so a later run that does measure it reports it as introduced -- " +
  "and a later run that drops it too reports nothing at all. Nothing was " +
  "written. Fix the setup so every pair is measured, then record again."

/** Records the run's fail findings as the baseline for `target`.
 *
 *  THE RULE: a run that could not measure must not become a baseline. Anything
 *  the run failed to measure is simply absent from the recorded entries, and
 *  absence is indistinguishable from "this element conforms".
 *
 *  An existing baseline is only replaced with `force`: an accidental refresh
 *  silently converts every introduced defect into an inherited one, which is
 *  the gate disarming itself. */
export function recordBaseline(dir: string, target: string, r: Report, opts: { force?: boolean } = {}): void {
  const file = baselinePath(dir, target)
  if (r.verdict === "not_comparable") {
    throw new PartialRunError(`REFUSING: this run was not comparable. ${WHY_A_PARTIAL_RUN_IS_NOT_A_BASELINE}`)
  }
  const unmeasured = r.findings.filter((f) => f.status === "not_comparable").length
  if (r.coverage.dropped > 0 || unmeasured > 0) {
    throw new PartialRunError(
      `REFUSING: this run measured only part of the page -- ${r.coverage.dropped} pairs dropped, ` +
        `${unmeasured} not_comparable findings. ${WHY_A_PARTIAL_RUN_IS_NOT_A_BASELINE}`,
    )
  }
  if (!opts.force && existsSync(file)) {
    throw new BaselineExistsError(
      `REFUSING: a baseline for ${target} already exists at ${file}. An accidental refresh silently ` +
        "converts every introduced defect into an inherited one. Pass force to overwrite it deliberately.",
    )
  }
  const entries = r.findings.filter((f) => f.status === "fail").map(({ origin: _origin, ...rest }) => rest)
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, serialiseBaseline(entries))
}
