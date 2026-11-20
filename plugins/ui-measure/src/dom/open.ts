import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type { Browser, BrowserContext, Page } from "playwright"
import { SetupError } from "../errors"
import type { Report } from "../report/types"
import { adapterTarget, type PageSpec } from "./adapters"

export interface OpenPage {
  page: Page
  rootSelector: string
  /** CSS px per design px: the live root font size over the design root font size. */
  scale: number
  info: Report["page"]
  close(): Promise<void>
}

export interface NotComparable {
  notComparable: string
}

type Playwright = typeof import("playwright")

/** Playwright is a peer dependency and is never bundled: resolve it from wherever the CLI was
 *  loaded, then from the consuming project's working directory. */
async function loadPlaywright(): Promise<Playwright> {
  try {
    return await import("playwright")
  } catch {
    try {
      const resolved = createRequire(join(process.cwd(), "noop.js")).resolve("playwright")
      return (await import(pathToFileURL(resolved).href)) as Playwright
    } catch {
      throw new SetupError("Playwright is not installed. Run: pnpm add -D playwright && pnpm exec playwright install chromium")
    }
  }
}

async function runModule(path: string, arg: BrowserContext | Page): Promise<void> {
  const mod = (await import(pathToFileURL(path).href)) as { default?: (a: unknown) => Promise<unknown> }
  if (typeof mod.default !== "function") {
    throw new SetupError(`${path} must default-export a function`)
  }
  await mod.default(arg)
}

/** Opens the target and waits until it is measurable. `opts.browser` lets a caller share one
 *  browser across many pages; then `close()` closes only this page's context. */
export async function openPage(
  spec: PageSpec,
  opts: { browser?: Browser } = {},
): Promise<OpenPage | NotComparable> {
  const { url, rootSelector } = adapterTarget(spec.adapter)
  const [vw, vh] = spec.viewport
  const screen = spec.screen ?? spec.viewport
  const dpr = spec.dpr ?? 1

  let browser = opts.browser
  const ownsBrowser = browser === undefined
  if (browser === undefined) {
    const pw = await loadPlaywright()
    try {
      browser = await pw.chromium.launch()
    } catch (e) {
      throw new SetupError(
        `Could not launch Chromium (${e instanceof Error ? e.message.split("\n")[0] : String(e)}). Run: pnpm exec playwright install chromium`,
      )
    }
  }
  const context = await browser.newContext({
    viewport: { width: vw, height: vh },
    screen: { width: screen[0], height: screen[1] },
    deviceScaleFactor: dpr,
    reducedMotion: "reduce",
  })
  const close = async () => {
    await context.close()
    if (ownsBrowser) await browser.close()
  }
  try {
    // The mock installs routes, so it must run before any page exists to load through them.
    if (spec.adapter.kind === "url" && spec.adapter.mock) await runModule(spec.adapter.mock, context)
    const page = await context.newPage()
    let response
    try {
      response = await page.goto(url, { waitUntil: "load" })
    } catch (e) {
      await close()
      return { notComparable: `page did not load: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` }
    }
    if (response === null || response.status() >= 400) {
      await close()
      return { notComparable: `page answered HTTP ${response === null ? "none" : response.status()} for ${url}` }
    }
    // A font that is still downloading changes every text width, so measure after it is in.
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    const found = await page
      .waitForSelector(rootSelector, { state: "attached", timeout: 3000 })
      .then(() => true, () => false)
    if (!found) {
      await close()
      return { notComparable: `root ${rootSelector} not found` }
    }
    // Steps run after load and before measuring; they may change layout or fonts.
    if (spec.adapter.kind === "url" && spec.adapter.steps) {
      await runModule(spec.adapter.steps, page)
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
    }
    const liveRootFontPx = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize),
    )
    const scale = liveRootFontPx / (spec.designRootFontPx ?? liveRootFontPx)
    return {
      page,
      rootSelector,
      scale,
      info: { url: page.url(), viewport: [vw, vh], screen: [screen[0], screen[1]], dpr },
      close,
    }
  } catch (e) {
    await close()
    throw e
  }
}
