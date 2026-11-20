/** The subset of a Figma node this reads. Every field optional, as on the real
 *  type — a non-optional mirror compiles here and throws on real data. */
export interface FigmaNodeish {
    id?: string;
    name?: string;
    type?: string;
    cornerRadius?: number;
    /** Present INSTEAD of `cornerRadius` when the four corners differ. */
    rectangleCornerRadii?: number[];
    strokeWeight?: number;
    strokes?: unknown[];
    absoluteBoundingBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    boundVariables?: Record<string, unknown>;
    children?: FigmaNodeish[];
}
export interface DesignFacts {
    /** Resolved values. A property the node lacks is ABSENT, never zero —
     *  except where Figma's silence itself carries the value; see `designFacts`. */
    geometry: Partial<{
        cornerRadius: number;
        strokeWeight: number;
        width: number;
        height: number;
    }>;
    /** Property name → the VariableID it is bound to, when it is bound. */
    bound: Partial<Record<"cornerRadius" | "strokeWeight", string>>;
    /** Node type → how many descendants have it. */
    counts: Record<string, number>;
}
export declare function designFacts(node: FigmaNodeish): DesignFacts;
