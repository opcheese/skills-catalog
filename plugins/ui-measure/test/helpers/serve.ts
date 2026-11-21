import { createServer, type Server } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, join, normalize } from "node:path"

export interface TestServer {
  /** e.g. http://127.0.0.1:41234 */
  origin: string
  close(): Promise<void>
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".ttf": "font/ttf",
  ".json": "application/json",
}

/** Serves `dir` on a free port. `/boom` answers 500, `/api/x` answers a JSON body,
 *  and each path in `delays` waits that many ms before answering. */
export async function serve(dir: string, delays: Record<string, number> = {}): Promise<TestServer> {
  const server: Server = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname
    const wait = delays[path]
    if (wait) await new Promise((r) => setTimeout(r, wait))
    if (path === "/boom") {
      res.writeHead(500, { "content-type": "text/plain" }).end("boom")
      return
    }
    if (path === "/api/x") {
      res.writeHead(200, { "content-type": TYPES[".json"] }).end(JSON.stringify({ label: "real" }))
      return
    }
    try {
      const file = join(dir, normalize(path))
      if (!file.startsWith(dir)) throw new Error("outside")
      const body = await readFile(file)
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body)
    } catch {
      res.writeHead(404).end("not found")
    }
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const addr = server.address()
  if (addr === null || typeof addr === "string") throw new Error("no port")
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
