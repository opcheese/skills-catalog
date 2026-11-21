import type { Token, TokenProperty } from "./types.js";
/**
 * The properties a row may declare. Enumerated rather than derived from the
 * type, because the check runs against JSON at runtime and a type gives no
 * value list to compare against.
 */
export declare const KNOWN_PROPERTIES: TokenProperty[];
export declare function parseRows(text: string): {
    tokens: Token[];
    errors: string[];
};
