// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ProposalError, propose } from "../../src/correspondence/propose"
import type {
  DesignTree,
  DomTree,
  Proposal,
} from "../../src/correspondence/types"

const design: DesignTree = {
  root: { id: "r", type: "FRAME" },
  nodes: [{ id: "r", type: "FRAME" }],
}
const dom: DomTree = {
  root: { selector: "root", tag: "div" },
  elements: [{ selector: "root", tag: "div" }],
}
const proposal: Proposal = {
  pairs: [{ nodeId: "r", selector: "root" }],
  unmapped: { design: [], impl: ["root > p"] },
}
const dir = mkdtempSync(join(tmpdir(), "ui-measure-propose-"))
const fixture = join(dir, "fixture.json")
writeFileSync(fixture, JSON.stringify(proposal))

describe("propose", () => {
  it("round-trips a recorded file", async () => {
    expect(await propose({ kind: "recorded", file: fixture }, design, dom)).toEqual(
      proposal,
    )
  })

  it("returns what a command prints", async () => {
    expect(
      await propose({ kind: "command", argv: ["cat", fixture] }, design, dom),
    ).toEqual(proposal)
  })

  it("writes {design, dom} to the command's stdin", async () => {
    const script = join(dir, "echo.mjs")
    writeFileSync(
      script,
      `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=JSON.parse(s);` +
        `console.log(JSON.stringify({pairs:[{nodeId:i.design.root.id,selector:i.dom.root.selector}],unmapped:{design:[],impl:[]}}))})`,
    )
    const got = await propose(
      { kind: "command", argv: [process.execPath, script] },
      design,
      dom,
    )
    expect(got.pairs).toEqual([{ nodeId: "r", selector: "root" }])
  })

  it("throws ProposalError when the command exits 1", async () => {
    await expect(
      propose({ kind: "command", argv: ["false"] }, design, dom),
    ).rejects.toBeInstanceOf(ProposalError)
  })

  it("throws ProposalError on output that is not JSON", async () => {
    await expect(
      propose({ kind: "command", argv: ["echo", "nope"] }, design, dom),
    ).rejects.toBeInstanceOf(ProposalError)
  })

  it("throws ProposalError when the JSON is not a Proposal", async () => {
    const bad = join(dir, "bad.json")
    writeFileSync(bad, JSON.stringify({ pairs: "x" }))
    await expect(
      propose({ kind: "recorded", file: bad }, design, dom),
    ).rejects.toBeInstanceOf(ProposalError)
  })

  it("throws ProposalError when the executable does not exist", async () => {
    await expect(
      propose({ kind: "command", argv: ["/nonexistent/ui-measure-nope"] }, design, dom),
    ).rejects.toBeInstanceOf(ProposalError)
  })

  describe("authoritative and unmappedReasons", () => {
    const write = (name: string, body: unknown) => {
      const f = join(dir, name)
      writeFileSync(f, JSON.stringify(body))
      return f
    }
    const base = { pairs: [], unmapped: { design: ["9:9"], impl: [] } }

    it("parses authoritative and unmappedReasons", async () => {
      const f = write("auth.json", {
        ...base,
        authoritative: true,
        unmappedReasons: { "9:9": "merged into background" },
      })
      const got = await propose({ kind: "recorded", file: f }, design, dom)
      expect(got.authoritative).toBe(true)
      expect(got.unmappedReasons).toEqual({ "9:9": "merged into background" })
    })

    it("rejects non-boolean authoritative", async () => {
      const f = write("auth-bad.json", { ...base, authoritative: "yes" })
      await expect(
        propose({ kind: "recorded", file: f }, design, dom),
      ).rejects.toBeInstanceOf(ProposalError)
    })

    it("rejects non-string reason values", async () => {
      const f = write("reason-bad.json", { ...base, unmappedReasons: { "9:9": 3 } })
      await expect(
        propose({ kind: "recorded", file: f }, design, dom),
      ).rejects.toBeInstanceOf(ProposalError)
    })

    it("old files still parse", async () => {
      const got = await propose(
        { kind: "recorded", file: join(__dirname, "../fixtures/card-proposal.json") },
        design,
        dom,
      )
      expect(got.authoritative).toBeUndefined()
      expect(got.unmappedReasons).toBeUndefined()
    })
  })
})
