// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { execFileSync, spawn } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import packageJson from "../package.json" with { type: "json" }
import { serve, type TestServer } from "./helpers/serve"
import type { Report } from "../src/report/types"

const PACKAGE = fileURLToPath(new URL("..", import.meta.url))
const FIXTURES = join(PACKAGE, "test", "fixtures")
const CLI = join(PACKAGE, "dist", "ui-measure.mjs")
const scratch = mkdtempSync(join(tmpdir(), "ui-measure-cli-"))
let config: string
let server: TestServer

interface CliResult {
  status: number | null
  stdout: string
  stderr: string
}

function run(
  args: string[],
  opts: { cli?: string; cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [opts.cli ?? CLI, ...args], {
      cwd: opts.cwd ?? PACKAGE,
      env: opts.env ?? process.env,
      timeout: 30_000,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.on("error", reject)
    child.on("close", (status) => resolve({ status, stdout, stderr }))
  })
}

function output(result: CliResult): string {
  return `${result.stdout}\n${result.stderr}`
}

function readReport(path: string): Report {
  return JSON.parse(readFileSync(path, "utf8")) as Report
}

beforeAll(async () => {
  execFileSync("pnpm", ["build"], { cwd: PACKAGE, stdio: "pipe" })
  server = await serve(join(FIXTURES, "pages"))
  const template = readFileSync(join(FIXTURES, "ui-measure.config.json"), "utf8")
  config = join(scratch, "ui-measure.config.json")
  writeFileSync(
    config,
    template
      .replaceAll("{{origin}}", server.origin)
      .replaceAll("{{fixtures}}", FIXTURES)
      .replaceAll("{{baselineDir}}", join(scratch, "baselines")),
  )
}, 60_000)

afterAll(async () => {
  await server?.close()
})

describe("ui-measure CLI", () => {
  it("geometry reports a clipped fail and exits 1", async () => {
    const json = join(scratch, "geometry-bad.json")
    const result = await run(["geometry", "--config", config, "--target", "geo-bad", "--json", json])
    expect(output(result)).not.toContain("undefined")
    expect(result.status, output(result)).toBe(1)
    const report = readReport(json)
    expect(report.verdict).toBe("mismatches")
    expect(report.findings.filter((f) => f.kind === "clipped" && f.status === "fail")).toHaveLength(1)
    expect(result.stdout.trim().split("\n").length).toBeLessThanOrEqual(20)
  })

  it("geometry on a good page exits 0", async () => {
    const result = await run(["geometry", "--config", config, "--target", "geo-good"])
    expect(output(result)).toContain("clean")
    expect(result.status, output(result)).toBe(0)
  })

  it("spec uses a recorded proposal and reports padding mismatches", async () => {
    const json = join(scratch, "spec-padding.json")
    const result = await run([
      "spec",
      "--config", config,
      "--target", "card-padding",
      "--proposer", "recorded",
      "--proposal", join(FIXTURES, "card-proposal.json"),
      "--json", json,
    ])
    expect(result.status, output(result)).toBe(1)
    const report = readReport(json)
    expect(report.coverage).toEqual({ pairsProposed: 3, pairsAccepted: 3, dropped: 0, authoritative: false, rejected: [] })
    expect(report.findings.some((f) => f.kind === "padding" && f.status === "fail" && f.deltaPx === 8)).toBe(true)
    expect(result.stdout.trim().split("\n").length).toBeLessThanOrEqual(20)
  })

  describe("default pairs file", () => {
    const pairsDir = join(scratch, ".ui-measure", "pairs")
    const defaultFile = join(pairsDir, "card-padding.json")
    const specArgs = (json: string, extra: string[] = []) => [
      "spec", "--config", config, "--target", "card-padding", ...extra, "--json", json,
    ]
    afterEach(() => rmSync(pairsDir, { recursive: true, force: true }))

    it("picks up the default pairs file", async () => {
      mkdirSync(pairsDir, { recursive: true })
      const recorded = JSON.parse(readFileSync(join(FIXTURES, "card-proposal.json"), "utf8"))
      writeFileSync(defaultFile, JSON.stringify({ ...recorded, authoritative: true }))
      const json = join(scratch, "default-pairs.json")
      const result = await run(specArgs(json))
      expect(result.status, output(result)).toBe(1)
      const report = readReport(json)
      expect(report.coverage).toEqual({ pairsProposed: 3, pairsAccepted: 3, dropped: 0, authoritative: true, rejected: [] })
      expect(report.findings.some((f) => f.kind === "padding" && f.status === "fail" && f.deltaPx === 8)).toBe(true)
    })

    it("explicit --proposal wins over the default file", async () => {
      mkdirSync(pairsDir, { recursive: true })
      writeFileSync(defaultFile, "{ not json")
      const json = join(scratch, "explicit-wins.json")
      const result = await run(specArgs(json, ["--proposal", join(FIXTURES, "card-proposal.json")]))
      expect(result.status, output(result)).toBe(1)
      expect(readReport(json).coverage.pairsAccepted).toBe(3)
    })

    it("no file keeps today's error", async () => {
      const json = join(scratch, "no-default.json")
      const result = await run(specArgs(json))
      expect(result.status, output(result)).toBe(2)
      expect(readReport(json).findings).toEqual([
        expect.objectContaining({ reason: "no correspondence proposer was selected" }),
      ])
    })

    it("malformed default file is a setup error", async () => {
      mkdirSync(pairsDir, { recursive: true })
      writeFileSync(defaultFile, "{ not json")
      const result = await run(specArgs(join(scratch, "malformed.json")))
      expect(result.status, output(result)).toBe(3)
      expect(output(result)).toContain(defaultFile)
    })
  })

  it("a missing root is not comparable and exits 2", async () => {
    const json = join(scratch, "missing-root.json")
    const result = await run([
      "spec",
      "--config", config,
      "--target", "missing-root",
      "--proposer", "recorded",
      "--proposal", join(FIXTURES, "card-proposal.json"),
      "--json", json,
    ])
    expect(result.status, output(result)).toBe(2)
    const report = readReport(json)
    expect(report.verdict).toBe("not_comparable")
    expect(report.findings).toEqual([
      expect.objectContaining({ status: "not_comparable", reason: expect.stringContaining("not found") }),
    ])
  })

  it("a recorded proposal with unresolvable selectors completes and drops those pairs", async () => {
    const proposal = join(scratch, "unresolvable-proposal.json")
    writeFileSync(
      proposal,
      JSON.stringify({
        pairs: [
          { nodeId: "1:1", selector: "#card" },
          { nodeId: "1:2", selector: "body" },
          { nodeId: "1:3", selector: "h2[class=Back" },
        ],
        unmapped: { design: [], impl: [] },
      }),
    )
    const json = join(scratch, "spec-unresolvable.json")
    const result = await run([
      "spec",
      "--config", config,
      "--target", "card-clean",
      "--proposer", "recorded",
      "--proposal", proposal,
      "--json", json,
    ])
    expect(result.status, output(result)).not.toBe(3)
    const report = readReport(json)
    // body is outside the root, the other has an unbalanced bracket: both are proposed and
    // dropped, never accepted.
    expect(report.coverage).toMatchObject({ pairsProposed: 3, pairsAccepted: 1, dropped: 2 })
    expect(report.coverage.rejected).toEqual([
      { nodeId: "1:2", selector: "body", rule: "resolvable", note: "no element inside root" },
      { nodeId: "1:3", selector: "h2[class=Back", rule: "resolvable", note: "invalid selector" },
    ])
    expect(report.findings.every((f) => f.status !== "not_comparable" || f.kind !== "page")).toBe(true)
  })

  it("empty authoritative proposal is not comparable", async () => {
    const proposal = join(scratch, "empty-authoritative.json")
    writeFileSync(proposal, JSON.stringify({ pairs: [], unmapped: { design: [], impl: [] }, authoritative: true }))
    const json = join(scratch, "spec-empty-authoritative.json")
    const result = await run([
      "spec",
      "--config", config,
      "--target", "card-clean",
      "--proposer", "recorded",
      "--proposal", proposal,
      "--json", json,
    ])
    expect(result.status, output(result)).toBe(2)
    expect(readReport(json).verdict).toBe("not_comparable")
  })

  it("a partial proposal is not_comparable and exits 2 even without mismatches", async () => {
    const json = join(scratch, "spec-partial.json")
    const result = await run([
      "spec",
      "--config", config,
      "--target", "card-clean",
      "--proposer", "recorded",
      "--proposal", join(FIXTURES, "card-partial-proposal.json"),
      "--json", json,
    ])
    expect(result.status, output(result)).toBe(2)
    const report = readReport(json)
    expect(report.verdict).toBe("not_comparable")
    expect(report.findings.some((f) => f.status === "fail")).toBe(false)
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "gap", status: "not_comparable", reason: expect.stringContaining("1:3") }),
    ]))
  })

  it("baseline check allows inherited defects and rejects a newly introduced defect", async () => {
    const initialConfig = JSON.parse(readFileSync(config, "utf8"))
    const changedConfig = join(scratch, "ui-measure-changed.config.json")
    const args = ["--config", config, "--target", "baseline-changing"]
    const recorded = await run(["baseline", "record", ...args])
    expect(recorded.status, output(recorded)).toBe(1)
    const inherited = await run(["baseline", "check", ...args])
    expect(inherited.status, output(inherited)).toBe(0)
    expect(inherited.stdout).toContain("inherited")

    initialConfig.targets["baseline-changing"].adapter.url += "&off=300"
    writeFileSync(changedConfig, JSON.stringify(initialConfig))
    const introduced = await run(["baseline", "check", "--config", changedConfig, "--target", "baseline-changing"])
    expect(introduced.status, output(introduced)).toBe(1)
    expect(introduced.stdout).toContain("introduced")
  })

  it("baseline record and check run spec mode and preserve a spec mismatch", async () => {
    const args = [
      "--config", config,
      "--target", "card-padding",
      "--mode", "spec",
      "--proposer", "recorded",
      "--proposal", join(FIXTURES, "card-proposal.json"),
    ]
    const recorded = await run(["baseline", "record", ...args])
    expect(recorded.status, output(recorded)).toBe(1)
    const baseline = JSON.parse(readFileSync(join(scratch, "baselines", "card-padding.json"), "utf8"))
    expect(baseline).toEqual(expect.arrayContaining([
      expect.objectContaining({ check: "spec", kind: "padding", status: "fail" }),
    ]))
    const checked = await run(["baseline", "check", ...args])
    expect(checked.status, output(checked)).toBe(0)
    expect(checked.stdout).toContain("inherited")
  })

  it("a hidden design root is not_comparable and exits 2 with its reason", async () => {
    const json = join(scratch, "hidden-design.json")
    const result = await run([
      "spec",
      "--config", config,
      "--target", "card-clean",
      "--node", join(FIXTURES, "figma", "hidden-root.json"),
      "--proposer", "recorded",
      "--proposal", join(FIXTURES, "card-proposal.json"),
      "--json", json,
    ])
    expect(result.status, output(result)).toBe(2)
    expect(output(result)).toContain("design root is hidden")
    const report = readReport(json)
    expect(report.verdict).toBe("not_comparable")
    expect(report.findings).toEqual([
      expect.objectContaining({ status: "not_comparable", reason: "design root is hidden" }),
    ])
  })

  it("an unknown target exits 3", async () => {
    const result = await run(["geometry", "--config", config, "--target", "unknown"])
    expect(result.status, output(result)).toBe(3)
    expect(output(result)).toContain("unknown target")
  })

  it("an unresolvable Playwright peer exits 3 with an install hint", async () => {
    const isolated = join(scratch, "isolated")
    mkdirSync(isolated, { recursive: true })
    const cli = join(isolated, "ui-measure.mjs")
    copyFileSync(CLI, cli)
    const result = await run(["geometry", "--config", config, "--target", "geo-good"], {
      cli,
      cwd: isolated,
      env: { ...process.env, NODE_PATH: "", PATH: "" },
    })
    expect(result.status, output(result)).toBe(3)
    expect(output(result)).toContain("install playwright")
  })

  it("baseline record then check on the same page exits 0", async () => {
    const args = ["--config", config, "--target", "geo-good"]
    const recorded = await run(["baseline", "record", ...args])
    expect(output(recorded)).toContain("recorded")
    expect(recorded.status, output(recorded)).toBe(0)
    expect(existsSync(join(scratch, "baselines", "geo-good.json"))).toBe(true)
    const checked = await run(["baseline", "check", ...args])
    expect(checked.status, output(checked)).toBe(0)
  })

  it("baseline record writes mismatches and exits 1", async () => {
    const result = await run(["baseline", "record", "--config", config, "--target", "geo-bad"])
    const baseline = join(scratch, "baselines", "geo-bad.json")
    expect(result.status, output(result)).toBe(1)
    expect(output(result)).toContain("recorded")
    expect(existsSync(baseline)).toBe(true)
    expect(JSON.parse(readFileSync(baseline, "utf8"))).toEqual([
      expect.objectContaining({ check: "geometry", kind: "clipped", status: "fail" }),
    ])
  })

  it("baseline record refuses a missing root and exits 2", async () => {
    const result = await run(["baseline", "record", "--config", config, "--target", "missing-root"])
    expect(result.status, output(result)).toBe(2)
    expect(output(result)).toContain("not comparable")
    expect(output(result)).toContain("not found")
    expect(existsSync(join(scratch, "baselines", "missing-root.json"))).toBe(false)
  })
})

describe("built package exports", () => {
  it.each([".", "./version"])("%s resolves to JavaScript with declarations", async (subpath) => {
    const entry = packageJson.exports[subpath as keyof typeof packageJson.exports]
    expect(typeof entry).toBe("object")
    if (typeof entry === "string") throw new Error("export must carry types")
    expect(entry.default).not.toContain(".ts")
    expect(existsSync(join(PACKAGE, entry.default))).toBe(true)
    expect(existsSync(join(PACKAGE, entry.types))).toBe(true)
    if (subpath === ".") {
      const api = await import(pathToFileURL(join(PACKAGE, entry.default)).href)
      expect(api.VERSION).toBe(packageJson.version)
      expect(typeof api.openPage).toBe("function")
      expect(typeof api.loadConfig).toBe("function")
    }
  })
})
