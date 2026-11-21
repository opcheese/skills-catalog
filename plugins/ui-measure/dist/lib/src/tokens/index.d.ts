import type { Token, TokenProperty } from "./types.js";
export type { Token, TokenProperty } from "./types.js";
export declare function loadTokens(path: string, format: "rows" | "dtcg"): {
    tokens: Token[];
    errors: string[];
};
export declare function tokenFor(tokens: Token[], property: TokenProperty, value: string): Token | undefined;
