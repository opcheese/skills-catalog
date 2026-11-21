export type TokenProperty = "color" | "spacing" | "radius" | "fontSize" | "lineHeight" | "fontWeight" | "fontFamily" | "effect" | "borderWidth";
export interface Token {
    name: string;
    property: TokenProperty;
    value: string;
}
