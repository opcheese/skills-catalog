import type { Browser, Page } from "playwright";
import type { Report } from "../report/types.js";
import { type PageSpec } from "./adapters.js";
export interface OpenPage {
    page: Page;
    rootSelector: string;
    /** CSS px per design px: the live root font size over the design root font size. */
    scale: number;
    info: Report["page"];
    close(): Promise<void>;
}
export interface NotComparable {
    notComparable: string;
}
/** Opens the target and waits until it is measurable. `opts.browser` lets a caller share one
 *  browser across many pages; then `close()` closes only this page's context. */
export declare function openPage(spec: PageSpec, opts?: {
    browser?: Browser;
}): Promise<OpenPage | NotComparable>;
