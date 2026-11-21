import type { DomTree } from "../correspondence/types.js";
import type { OpenPage } from "./open.js";
/** Walk the live DOM under the page's root element.
 *
 *  NOTE the `__name` trap: `tsx` compiles with esbuild's keepNames, which
 *  rewrites named functions into `__name(fn, "...")` — a helper that does not
 *  exist inside the page, so a named function declared in `page.evaluate`
 *  throws `ReferenceError: __name is not defined`. The walk below is therefore
 *  an explicit stack with no declared functions of any kind.
 *
 *  Elements hidden by `display`, `visibility` or zero opacity are left out: a box that is
 *  not drawn is not something to compare. The root is always kept. */
export declare function domTree(p: OpenPage): Promise<DomTree>;
