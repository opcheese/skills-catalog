export type Adapter = {
    kind: "designharness";
    baseUrl: string;
    component: string;
    state?: string;
} | {
    kind: "storybook";
    baseUrl: string;
    storyId: string;
} | {
    kind: "url";
    url: string;
    root: string;
    mock?: string;
    steps?: string;
};
export interface PageSpec {
    adapter: Adapter;
    viewport: [number, number];
    screen?: [number, number];
    dpr?: number;
    /** The root font size the design was drawn at; absent when the project does not scale its root. */
    designRootFontPx?: number;
}
/** `baseUrl` of a designharness is the harness page itself; `?c=` and `state=` are appended to it.
 *  `baseUrl` of a storybook is the static build's directory; `iframe.html` is appended to it. */
export declare function adapterTarget(adapter: Adapter): {
    url: string;
    rootSelector: string;
};
