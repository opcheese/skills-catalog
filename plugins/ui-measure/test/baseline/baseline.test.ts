import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  baselineKey,
  baselinePath,
  classify,
  readBaseline,
  recordBaseline,
  serialiseBaseline,
} from "../../src/baseline/baseline"
import { BaselineExistsError, PartialRunError } from "../../src/errors"
import type { Finding, Report } from "../../src/report/types"

const fail = (over: Partial<Finding> = {}): Finding => ({
  check: "spec",
  kind: "padding",
  status: "fail",
  target: { selector: ".card", designNode: "Card/Body" },
  expected: "16px",
  actual: "24px",
  deltaPx: 8,
  ...over,
})

const report = (findings: Finding[], over: Partial<Report> = {}): Report => ({
  tool: "ui-measure",
  version: "0.2.0",
  ranAt: "2026-11-20T00:00:00.000Z",
  page: { url: "http://x/", viewport: [800, 600], screen: [800, 600], dpr: 1 },
  scale: 1,
  findings,
  coverage: { pairsProposed: 1, pairsAccepted: 1, dropped: 0, authoritative: false, rejected: [] },
  verdict: findings.some((f) => f.status === "fail") ? "mismatches" : "clean",
  ...over,
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ui-measure-baseline-"))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe("baselineKey", () => {
  it("is stable under sub-pixel jitter in expected and actual", () => {
    const a = fail({ expected: "16.2px", actual: "23.9px" })
    const b = fail({ expected: "15.8px", actual: "24.1px" })
    expect(baselineKey(a)).toBe(baselineKey(b))
  })

  it("distinguishes whole-pixel differences", () => {
    expect(baselineKey(fail({ actual: "24px" }))).not.toBe(baselineKey(fail({ actual: "26px" })))
  })

  it("prefers the design node over the selector, so a selector rename is the same defect", () => {
    const a = fail({ target: { selector: ".card", designNode: "Card/Body" } })
    const b = fail({ target: { selector: ".card-v2", designNode: "Card/Body" } })
    expect(baselineKey(a)).toBe(baselineKey(b))
  })

  it("falls back to the selector when there is no design node", () => {
    const a = fail({ target: { selector: ".a" } })
    const b = fail({ target: { selector: ".b" } })
    expect(baselineKey(a)).not.toBe(baselineKey(b))
  })

  it("separates check and kind", () => {
    expect(baselineKey(fail({ kind: "gap" }))).not.toBe(baselineKey(fail({ kind: "padding" })))
    expect(baselineKey(fail({ check: "geometry" }))).not.toBe(baselineKey(fail({ check: "spec" })))
  })

  it("does not collapse negative sub-pixel values into distinct keys", () => {
    expect(baselineKey(fail({ actual: "-0.2px" }))).toBe(baselineKey(fail({ actual: "0.2px" })))
  })
})

describe("classify", () => {
  it("marks a finding present in the baseline inherited", () => {
    const [out] = classify([fail()], [fail()])
    expect(out.origin).toBe("inherited")
  })

  it("marks a finding absent from the baseline introduced", () => {
    const [out] = classify([fail({ kind: "gap" })], [fail()])
    expect(out.origin).toBe("introduced")
  })

  it("marks a known finding that grew past tolerance introduced", () => {
    const [out] = classify([fail({ deltaPx: 11 })], [fail({ deltaPx: 8 })])
    expect(out.origin).toBe("introduced")
  })

  it("keeps growth within the 2px tolerance inherited", () => {
    const [out] = classify([fail({ deltaPx: 10 })], [fail({ deltaPx: 8 })])
    expect(out.origin).toBe("inherited")
  })

  it("treats a non-finite deltaPx as introduced, never inherited", () => {
    const [out] = classify([fail({ deltaPx: Number.NaN })], [fail()])
    expect(out.origin).toBe("introduced")
  })

  it("treats a non-finite stored deltaPx as introduced, never inherited", () => {
    const [out] = classify([fail()], [fail({ deltaPx: Number.NaN })])
    expect(out.origin).toBe("introduced")
  })

  it("leaves pass and not_comparable findings without an origin", () => {
    const pass: Finding = { ...fail(), status: "pass", origin: "inherited" }
    const nc: Finding = { ...fail({ kind: "gap" }), status: "not_comparable", origin: "introduced", reason: "no pair" }
    const out = classify([pass, nc], [fail()])
    expect(out[0].origin).toBeUndefined()
    expect(out[1].origin).toBeUndefined()
  })

  it("does not mutate its input", () => {
    const input = [fail()]
    classify(input, [fail()])
    expect(input[0].origin).toBeUndefined()
  })
})

describe("recordBaseline and readBaseline", () => {
  it("recorded padding fail is inherited on the next run", () => {
    recordBaseline(dir, "card", report([fail()]))
    const [out] = classify([fail()], readBaseline(dir, "card"))
    expect(out.origin).toBe("inherited")
  })

  it("a new gap fail on top of a recorded padding fail is introduced", () => {
    recordBaseline(dir, "card", report([fail()]))
    const out = classify([fail(), fail({ kind: "gap", expected: "8px", actual: "20px" })], readBaseline(dir, "card"))
    expect(out.map((f) => f.origin)).toEqual(["inherited", "introduced"])
  })

  it("records only fail findings, without origin", () => {
    const pass: Finding = { ...fail({ kind: "gap" }), status: "pass" }
    recordBaseline(dir, "card", report([{ ...fail(), origin: "introduced" }, pass]))
    const stored = readBaseline(dir, "card")
    expect(stored).toHaveLength(1)
    expect(stored[0].kind).toBe("padding")
    expect(stored[0].origin).toBeUndefined()
  })

  it("refuses a not_comparable run and writes nothing", () => {
    const r = report([fail()], { verdict: "not_comparable" })
    expect(() => recordBaseline(dir, "card", r)).toThrow(PartialRunError)
    expect(existsSync(baselinePath(dir, "card"))).toBe(false)
  })

  it("refuses a run that dropped pairs even when the verdict is mismatches", () => {
    const r = report([fail()], { coverage: { pairsProposed: 3, pairsAccepted: 2, dropped: 1, authoritative: false, rejected: [] } })
    expect(() => recordBaseline(dir, "card", r)).toThrow(PartialRunError)
  })

  it("refuses a run holding a not_comparable finding", () => {
    const nc: Finding = { ...fail({ kind: "gap" }), status: "not_comparable", reason: "no pair" }
    expect(() => recordBaseline(dir, "card", report([fail(), nc]))).toThrow(PartialRunError)
  })

  it("refuses to overwrite an existing baseline without force", () => {
    recordBaseline(dir, "card", report([fail()]))
    expect(() => recordBaseline(dir, "card", report([]))).toThrow(BaselineExistsError)
    expect(readBaseline(dir, "card")).toHaveLength(1)
  })

  it("overwrites deliberately with force", () => {
    recordBaseline(dir, "card", report([fail()]))
    recordBaseline(dir, "card", report([]), { force: true })
    expect(readBaseline(dir, "card")).toHaveLength(0)
  })

  it("records a clean run as an empty baseline", () => {
    recordBaseline(dir, "card", report([]))
    expect(existsSync(baselinePath(dir, "card"))).toBe(true)
    expect(readBaseline(dir, "card")).toEqual([])
  })

  it("returns an empty list when no baseline file exists", () => {
    expect(readBaseline(dir, "none")).toEqual([])
  })

  it("throws on a malformed file instead of treating it as absent", () => {
    writeFileSync(baselinePath(dir, "card"), "{not json")
    expect(() => readBaseline(dir, "card")).toThrow(/not valid JSON/)
  })

  it("throws on a file that is not an array of findings", () => {
    writeFileSync(baselinePath(dir, "card"), "{}")
    expect(() => readBaseline(dir, "card")).toThrow(/not a usable baseline/)
  })

  it.each([null, "3"])("rejects a stored deltaPx of %j", (deltaPx) => {
    writeFileSync(baselinePath(dir, "card"), JSON.stringify([{ ...fail(), deltaPx }]))
    expect(() => readBaseline(dir, "card")).toThrow(/card\.json.*entry 0.*deltaPx/)
  })

  it.each(["expected", "actual"] as const)("rejects a non-string stored %s", (field) => {
    writeFileSync(baselinePath(dir, "card"), JSON.stringify([{ ...fail(), [field]: 3 }]))
    expect(() => readBaseline(dir, "card")).toThrow(new RegExp(`card\\.json.*entry 0.*${field}`))
  })

  it("throws on two entries with one key", () => {
    writeFileSync(baselinePath(dir, "card"), JSON.stringify([fail(), fail()]))
    expect(() => readBaseline(dir, "card")).toThrow(/duplicate/)
  })

  it("rejects a target name that escapes the directory", () => {
    expect(() => baselinePath(dir, "../evil")).toThrow(/target/)
  })
})

describe("serialiseBaseline", () => {
  it("writes sorted keys, 2-space indent and a trailing newline", () => {
    const text = serialiseBaseline([fail()])
    expect(text.endsWith("}\n]\n") || text.endsWith("]\n")).toBe(true)
    expect(text).toContain('\n  {\n    "actual"')
    const keys = [...text.matchAll(/^    "(\w+)":/gm)].map((m) => m[1])
    expect(keys).toEqual([...keys].sort())
  })

  it("is byte-identical for findings built in a different key order", () => {
    const a: Finding = { check: "spec", kind: "k", status: "fail", target: { selector: "s" }, expected: "1px", actual: "2px" }
    const b = { actual: "2px", expected: "1px", target: { selector: "s" }, status: "fail", kind: "k", check: "spec" } as Finding
    expect(serialiseBaseline([a])).toBe(serialiseBaseline([b]))
  })

  it("writes the file it reads back", () => {
    recordBaseline(dir, "card", report([fail()]))
    const raw = readFileSync(baselinePath(dir, "card"), "utf8")
    expect(raw.endsWith("\n")).toBe(true)
    expect(JSON.parse(raw)).toHaveLength(1)
  })
})
