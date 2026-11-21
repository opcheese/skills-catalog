import { readFile, mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { SetupError } from "../errors.js"
import { VERSION } from "../version.js"
import { decodePng } from "./png.js"
import { probe, type Box, type ProbeResult } from "./probe.js"

export const PROBE_USAGE = `  ui-measure probe IMAGE.png --box X,Y,W,H [--box ...] [--scale S | --frame-width W]
    [--tolerance N] [--json OUT]
    (boxes in image pixels; results in CSS pixels = image pixels / scale)`

export interface ProbeReport {
  tool: "ui-measure"
  version: string
  kind: "probe"
  image: { path: string; width: number; height: number }
  scale: number
  scaleSource: "flag" | "frame-width" | "assumed"
  warnings: string[]
  probes: ProbeResult[]
}

function positive(flag: string, value: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new SetupError(`${flag} must be a positive number, got ${value}`)
  return n
}

function parseBox(value: string): Box {
  const parts = value.split(",").map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[2]! <= 0 || parts[3]! <= 0) {
    throw new SetupError(`--box must be X,Y,W,H with a positive width and height, got ${value}`)
  }
  const [x, y, width, height] = parts as [number, number, number, number]
  return { x, y, width, height }
}

const size = (b: Box) => `${b.width}x${b.height} at ${b.x},${b.y}`

function line(index: number, r: ProbeResult): string {
  if (r.status === "nothing") return `box ${index}: nothing - ${r.reason}`
  const parts = [`box ${index}: ${size(r.bounds!)}`, `on ${r.background}`]
  parts.push(r.fill ? `fill ${r.fill.hex}` : "no fill")
  if (r.ink) parts.push(`ink ${r.ink.hex}${r.ink.exact ? "" : " (approximate)"}`)
  if (r.insets) parts.push(`insets ${r.insets.top}/${r.insets.right}/${r.insets.bottom}/${r.insets.left}`)
  if (r.lines.length) parts.push(`${r.lines.length} line${r.lines.length > 1 ? "s" : ""}${r.linePitch !== null ? ` pitch ${r.linePitch}` : ""}`)
  const rim = r.rim && (["top", "right", "bottom", "left"] as const).filter((s) => r.rim![s].kind !== "none")
  if (rim?.length) parts.push(`rim ${rim.map((s) => `${s} ${r.rim![s].width} ${r.rim![s].kind}`).join(", ")}`)
  if (r.clipped.length) parts.push(`CLIPPED ${r.clipped.join(",")} - enlarge the box`)
  for (const w of r.warnings) if (!w.startsWith("the ink colour")) parts.push(`WARNING ${w}`)
  return parts.join(" ")
}

/** Run `ui-measure probe`; returns the exit code (0 measured, 2 a box measured nothing). */
export async function probeCommand(args: string[]): Promise<number> {
  let image: string | undefined
  const boxes: Box[] = []
  let scale: number | undefined
  let frameWidth: number | undefined
  let tolerance: number | undefined
  let json: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (!arg.startsWith("--")) {
      if (image) throw new SetupError(`unexpected argument ${arg}\nUsage:\n${PROBE_USAGE}`)
      image = arg
      continue
    }
    const value = args[++i]
    if (value === undefined || value === "") throw new SetupError(`${arg} needs a value`)
    if (arg === "--box") boxes.push(parseBox(value))
    else if (arg === "--scale") scale = positive(arg, value)
    else if (arg === "--frame-width") frameWidth = positive(arg, value)
    else if (arg === "--tolerance") tolerance = positive(arg, value)
    else if (arg === "--json") json = value
    else throw new SetupError(`unknown option ${arg}\nUsage:\n${PROBE_USAGE}`)
  }
  if (!image) throw new SetupError(`probe needs an image\nUsage:\n${PROBE_USAGE}`)
  if (boxes.length === 0) throw new SetupError(`probe needs at least one --box\nUsage:\n${PROBE_USAGE}`)
  if (scale !== undefined && frameWidth !== undefined) throw new SetupError("give --scale or --frame-width, not both")

  let buf: Buffer
  try {
    buf = await readFile(image)
  } catch {
    throw new SetupError(`cannot read image ${image}`)
  }
  const decoded = decodePng(buf)
  const warnings: string[] = []
  let scaleSource: ProbeReport["scaleSource"] = "flag"
  if (frameWidth !== undefined) {
    scale = decoded.width / frameWidth
    scaleSource = "frame-width"
  } else if (scale === undefined) {
    scale = 1
    scaleSource = "assumed"
    warnings.push("scale assumed 1: pass --scale or --frame-width, or CSS values may be off by the export scale")
  }
  const report: ProbeReport = {
    tool: "ui-measure",
    version: VERSION,
    kind: "probe",
    image: { path: image, width: decoded.width, height: decoded.height },
    scale,
    scaleSource,
    warnings,
    probes: boxes.map((box) => probe(decoded, box, { scale, tolerance })),
  }
  if (json) {
    const file = resolve(json)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  }
  for (const w of warnings) console.log(`warning: ${w}`)
  report.probes.forEach((r, i) => console.log(line(i + 1, r)))
  return report.probes.some((r) => r.status === "nothing") ? 2 : 0
}
