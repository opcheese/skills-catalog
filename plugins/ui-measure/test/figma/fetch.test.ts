// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchNode } from "../../src/figma/fetch"

afterEach(() => vi.unstubAllGlobals())

describe("fetchNode", () => {
  it("sends the token as a header and returns the parsed body", async () => {
    const stub = vi.fn(async () => new Response(JSON.stringify({ ok: 1 })))
    vi.stubGlobal("fetch", stub)
    const body = await fetchNode("KEY", "1:2", "tok-123")
    expect(body).toEqual({ ok: 1 })
    const [url, init] = stub.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.figma.com/v1/files/KEY/nodes?ids=1%3A2")
    expect(init.headers).toEqual({ "X-Figma-Token": "tok-123" })
  })

  it("fails with the status and without the token or file key", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 403 }))
    const err = (await fetchNode("KEY", "1:2", "tok-123").catch((e: unknown) => e)) as Error
    expect(err.message).toContain("403")
    expect(err.message).not.toContain("tok-123")
    expect(err.message).not.toContain("KEY")
  })
})
