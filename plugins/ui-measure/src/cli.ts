#!/usr/bin/env node
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { classify, readBaseline, recordBaseline } from "./baseline/baseline.js"
import { loadConfig, type Config, type Target } from "./config.js"
import { propose, type Proposer } from "./correspondence/propose.js"
import { verifyMapping } from "./correspondence/verify.js"
import { adapterTarget } from "./dom/adapters.js"
import { openPage, type OpenPage } from "./dom/open.js"
import { domTree } from "./dom/tree.js"
import { SetupError, PartialRunError, NotComparableError } from "./errors.js"
import { fetchNode } from "./figma/fetch.js"
import { flatten, readNode } from "./figma/read.js"
import { detectGeometry } from "./geometry/detect.js"
import type { Finding, Report } from "./report/types.js"
import { reportSummary, writeReport } from "./report/write.js"
import { compareSpec } from "./spec/compare.js"
import { loadTokens } from "./tokens/index.js"
import { VERSION } from "./version.js"

const USAGE = `Usage:
  ui-measure geometry --config C --target T [--json OUT]
  ui-measure spec --config C --target T [--node FILE | --figma NODE_ID]
    [--proposer recorded --proposal FILE | --proposer command -- ARGV...] [--json OUT]
  ui-measure baseline record|check --config C --target T [--mode geometry|spec]
    [--node FILE | --figma NODE_ID] [--proposer recorded --proposal FILE | --proposer command -- ARGV...]
    [--force] [--json OUT]`

interface Options {
  config?: string
  target?: string
  json?: string
  node?: string
  figma?: string
  proposer?: string
  proposal?: string
  mode?: string
  force?: boolean
  help?: boolean
  command: string[]
}

function parseOptions(args: string[]): Options {
  const out: Options = { command: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--") {
      out.command = args.slice(i + 1)
      break
    }
    if (arg === "--force") {
      out.force = true
      continue
    }
    if (arg === "--help" || arg === "-h") {
      out.help = true
      continue
    }
    const key = arg.replace(/^--/, "")
    if (!["config", "target", "json", "node", "figma", "proposer", "proposal", "mode"].includes(key)) {
      throw new SetupError(`unknown option ${arg}\n${USAGE}`)
    }
    const value = args[++i]
    if (value === undefined || value === "") throw new SetupError(`${arg} needs a value`)
    out[key as "config" | "target" | "json" | "node" | "figma" | "proposer" | "proposal" | "mode"] = value
  }
  return out
}

function selected(config: Config, options: Options): Target {
  if (!options.config) throw new SetupError(`--config is required\n${USAGE}`)
  if (!options.target) throw new SetupError(`--target is required\n${USAGE}`)
  const target = config.targets[options.target]
  if (!target) throw new SetupError(`unknown target ${JSON.stringify(options.target)}`)
  return target
}

function report(
  target: Target,
  opened: OpenPage | undefined,
  findings: Finding[],
  coverage: Report["coverage"],
  verdict: Report["verdict"],
): Report {
  return {
    tool: "ui-measure",
    version: VERSION,
    ranAt: new Date().toISOString(),
    page: opened?.info ?? {
      url: adapterTarget(target.adapter).url,
      viewport: target.viewport,
      screen: target.screen ?? target.viewport,
      dpr: target.dpr ?? 1,
    },
    scale: opened?.scale ?? 1,
    findings,
    coverage,
    verdict,
  }
}

function notComparable(target: Target, check: Finding["check"], reason: string): Report {
  return report(
    target,
    undefined,
    [{ check, kind: "page", status: "not_comparable", target: { selector: target.adapter.kind === "url" ? target.adapter.root : "root" }, reason }],
    { pairsProposed: 0, pairsAccepted: 0, dropped: 0 },
    "not_comparable",
  )
}

function verdict(findings: Finding[], coverage: Report["coverage"]): Report["verdict"] {
  if (findings.some((f) => f.status === "fail")) return "mismatches"
  if (
    findings.some((f) => f.status === "not_comparable") ||
    coverage.pairsProposed === 0 && coverage.pairsAccepted === 0 && findings.some((f) => f.check === "spec") ||
    coverage.dropped > coverage.pairsProposed / 2
  ) {
    return "not_comparable"
  }
  return "clean"
}

async function geometry(target: Target, config: Config): Promise<Report> {
  const opened = await openPage(target)
  if ("notComparable" in opened) return notComparable(target, "geometry", opened.notComparable)
  try {
    const findings = await detectGeometry(opened, config.geometry ?? { insetPx: 4, nonScrolling: [] })
    const coverage = { pairsProposed: 0, pairsAccepted: 0, dropped: 0 }
    return report(target, opened, findings, coverage, verdict(findings, coverage))
  } finally {
    await opened.close()
  }
}

async function proposer(options: Options): Promise<Proposer | undefined> {
  const kind = options.proposer ?? (options.proposal ? "recorded" : options.command.length ? "command" : undefined)
  if (kind === undefined) return undefined
  if (kind === "recorded") {
    if (!options.proposal) throw new SetupError("recorded proposer needs --proposal FILE")
    return { kind, file: resolve(options.proposal) }
  }
  if (kind === "command") {
    if (options.command.length === 0) throw new SetupError("command proposer needs arguments after --")
    return { kind, argv: options.command }
  }
  throw new SetupError("--proposer must be recorded or command")
}

async function design(target: Target, options: Options) {
  if (options.node && options.figma) throw new SetupError("--node and --figma are mutually exclusive")
  const nodeFile = options.node ?? (options.figma ? undefined : target.node)
  if (nodeFile) {
    const json = JSON.parse(await readFile(resolve(nodeFile), "utf8")) as unknown
    return flatten(readNode(json, target.figma?.nodeId))
  }
  const nodeId = options.figma ?? target.figma?.nodeId
  if (!nodeId) throw new SetupError("spec needs --node FILE, --figma NODE_ID, or a configured design")
  const fileKey = target.figma?.fileKey ?? process.env.FIGMA_FILE_KEY
  const token = process.env.FIGMA_TOKEN
  if (!fileKey) throw new SetupError("Figma file key is required in target config or FIGMA_FILE_KEY")
  if (!token) throw new SetupError("FIGMA_TOKEN is required to fetch a design")
  const json = await fetchNode(fileKey, nodeId, token)
  return flatten(readNode(json, nodeId))
}

async function spec(target: Target, config: Config, options: Options): Promise<Report> {
  let designTree
  let mappingProposer
  try {
    ;[designTree, mappingProposer] = await Promise.all([design(target, options), proposer(options)])
  } catch (error) {
    if (error instanceof NotComparableError) return notComparable(target, "spec", error.message)
    throw error
  }
  let tokens
  if (config.tokens) {
    const loaded = loadTokens(config.tokens.path, config.tokens.format)
    if (loaded.errors.length) throw new SetupError(loaded.errors.join("\n"))
    tokens = loaded.tokens
  }
  const opened = await openPage(target)
  if ("notComparable" in opened) return notComparable(target, "spec", opened.notComparable)
  try {
    if (!mappingProposer) {
      return report(
        target,
        opened,
        [{ check: "spec", kind: "correspondence", status: "not_comparable", target: { selector: opened.rootSelector }, reason: "no correspondence proposer was selected" }],
        { pairsProposed: 0, pairsAccepted: 0, dropped: 0 },
        "not_comparable",
      )
    }
    const dom = await domTree(opened)
    const proposal = await propose(mappingProposer, designTree, dom)
    const verification = verifyMapping(proposal, designTree, dom, { scale: opened.scale })
    const compared = compareSpec(designTree, dom, verification, {
      scale: opened.scale,
      tokens,
      unthemed: config.unthemed,
    })
    return report(target, opened, compared.findings, compared.coverage, verdict(compared.findings, compared.coverage))
  } finally {
    await opened.close()
  }
}

function exitCode(result: Report): number {
  return result.verdict === "clean" ? 0 : result.verdict === "mismatches" ? 1 : 2
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const command = argv[0]
    if (!command || command === "--help" || command === "-h") {
      console.log(USAGE)
      return command ? 0 : 3
    }
    const isBaseline = command === "baseline"
    const action = isBaseline ? argv[1] : undefined
    if (!["geometry", "spec", "baseline"].includes(command) || (isBaseline && action !== "record" && action !== "check")) {
      throw new SetupError(USAGE)
    }
    const options = parseOptions(argv.slice(isBaseline ? 2 : 1))
    if (options.help) {
      console.log(USAGE)
      return 0
    }
    if (!options.config) throw new SetupError(`--config is required\n${USAGE}`)
    if (!options.target) throw new SetupError(`--target is required\n${USAGE}`)
    const config = loadConfig(options.config)
    const target = selected(config, options)
    if (!isBaseline && options.force) throw new SetupError("--force is only valid for baseline record")
    if (!isBaseline && options.mode) throw new SetupError("--mode is only valid for baseline commands")
    const mode = options.mode ?? "geometry"
    if (mode !== "geometry" && mode !== "spec") throw new SetupError("--mode must be geometry or spec")
    let result = command === "spec" || isBaseline && mode === "spec"
      ? await spec(target, config, options)
      : await geometry(target, config)
    if (options.json) await writeReport(resolve(options.json), result)
    if (isBaseline) {
      if (!config.baselineDir) throw new SetupError("baselineDir is required for baseline commands")
      if (action === "record") {
        if (result.verdict === "not_comparable") console.log(reportSummary(result))
        recordBaseline(config.baselineDir, options.target as string, result, { force: options.force })
        console.log(reportSummary(result, 19))
        console.log(`recorded baseline for ${options.target}`)
        return exitCode(result)
      }
      const findings = classify(result.findings, readBaseline(config.baselineDir, options.target as string))
      result = {
        ...result,
        findings,
        verdict: verdict(findings.filter((f) => f.origin !== "inherited"), result.coverage),
      }
      if (options.json) await writeReport(resolve(options.json), result)
    }
    console.log(reportSummary(result))
    return exitCode(result)
  } catch (error) {
    console.error(`ui-measure: ${error instanceof Error ? error.message : String(error)}`)
    return error instanceof PartialRunError ? 2 : 3
  }
}

process.exitCode = await main()
