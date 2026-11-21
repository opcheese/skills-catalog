// Harness adapters: how a target maps to a page URL and the root element's selector.

export type Adapter =
  | { kind: "designharness"; baseUrl: string; component: string; state?: string }
  | { kind: "storybook"; baseUrl: string; storyId: string }
  | { kind: "url"; url: string; root: string; mock?: string; steps?: string }

export interface PageSpec {
  adapter: Adapter
  viewport: [number, number]
  screen?: [number, number]
  dpr?: number
  /** The root font size the design was drawn at; absent when the project does not scale its root. */
  designRootFontPx?: number
}

/** `baseUrl` of a designharness is the harness page itself; `?c=` and `state=` are appended to it.
 *  `baseUrl` of a storybook is the static build's directory; `iframe.html` is appended to it. */
export function adapterTarget(adapter: Adapter): { url: string; rootSelector: string } {
  switch (adapter.kind) {
    case "designharness": {
      const u = new URL(adapter.baseUrl)
      u.searchParams.set("c", adapter.component)
      if (adapter.state !== undefined) u.searchParams.set("state", adapter.state)
      return { url: u.toString(), rootSelector: "#harness-root > :nth-child(1)" }
    }
    case "storybook": {
      const base = adapter.baseUrl.replace(/\/+$/, "")
      const u = new URL(`${base}/iframe.html`)
      u.searchParams.set("id", adapter.storyId)
      u.searchParams.set("viewMode", "story")
      return { url: u.toString(), rootSelector: "#storybook-root > :nth-child(1)" }
    }
    case "url":
      return { url: adapter.url, rootSelector: adapter.root }
  }
}
