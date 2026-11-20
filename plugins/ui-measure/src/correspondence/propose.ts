// Proposers: where a node↔element mapping comes from. The package has no model
// client; a proposal is read from a recorded file or produced by a command the
// caller names. verify.ts checks it either way.

import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import type { DesignTree, DomTree, Proposal } from "./types"

export type Proposer =
  | { kind: "recorded"; file: string }
  | { kind: "command"; argv: string[] }

export class ProposalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProposalError"
  }
}

function parseProposal(text: string, source: string): Proposal {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new ProposalError(`${source} did not produce valid JSON`)
  }
  const v = value as Partial<Proposal> | null
  const strings = (a: unknown) =>
    Array.isArray(a) && a.every((s) => typeof s === "string")
  const ok =
    v !== null &&
    typeof v === "object" &&
    Array.isArray(v.pairs) &&
    v.pairs.every(
      (p) =>
        p !== null &&
        typeof p === "object" &&
        typeof p.nodeId === "string" &&
        typeof p.selector === "string",
    ) &&
    v.unmapped !== undefined &&
    v.unmapped !== null &&
    strings(v.unmapped.design) &&
    strings(v.unmapped.impl)
  if (!ok) throw new ProposalError(`${source} did not produce a Proposal`)
  return v as Proposal
}

function runCommand(argv: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (argv.length === 0) {
      reject(new ProposalError("proposer command is empty"))
      return
    }
    // No shell: argv[0] is the executable, the rest are its arguments.
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["pipe", "pipe", "pipe"],
    })
    let out = ""
    let err = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (err += d))
    child.on("error", (e) =>
      reject(new ProposalError(`could not run ${argv[0]}: ${e.message}`)),
    )
    child.on("close", (code) => {
      if (code === 0) resolve(out)
      else
        reject(
          new ProposalError(
            `${argv[0]} exited with ${code}${err ? `: ${err.trim()}` : ""}`,
          ),
        )
    })
    // A command that exits without reading stdin raises EPIPE here; its exit
    // code, not the pipe, is what reports the failure.
    child.stdin.on("error", () => {})
    child.stdin.end(input)
  })
}

export async function propose(
  p: Proposer,
  design: DesignTree,
  dom: DomTree,
): Promise<Proposal> {
  if (p.kind === "recorded") {
    let text: string
    try {
      text = await readFile(p.file, "utf8")
    } catch (e) {
      throw new ProposalError(
        `could not read ${p.file}: ${(e as Error).message}`,
      )
    }
    return parseProposal(text, p.file)
  }
  const stdout = await runCommand(p.argv, JSON.stringify({ design, dom }))
  return parseProposal(stdout, p.argv[0])
}
