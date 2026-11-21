// Harness adapters: how a target maps to a page URL and the root element's selector.
/** `baseUrl` of a designharness is the harness page itself; `?c=` and `state=` are appended to it.
 *  `baseUrl` of a storybook is the static build's directory; `iframe.html` is appended to it. */
export function adapterTarget(adapter) {
    switch (adapter.kind) {
        case "designharness": {
            const u = new URL(adapter.baseUrl);
            u.searchParams.set("c", adapter.component);
            if (adapter.state !== undefined)
                u.searchParams.set("state", adapter.state);
            return { url: u.toString(), rootSelector: "#harness-root > :nth-child(1)" };
        }
        case "storybook": {
            const base = adapter.baseUrl.replace(/\/+$/, "");
            const u = new URL(`${base}/iframe.html`);
            u.searchParams.set("id", adapter.storyId);
            u.searchParams.set("viewMode", "story");
            return { url: u.toString(), rootSelector: "#storybook-root > :nth-child(1)" };
        }
        case "url":
            return { url: adapter.url, rootSelector: adapter.root };
    }
}
