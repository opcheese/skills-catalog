/** Decoded image: 8-bit RGBA, transparent pixels already composited over white. */
export interface RgbaImage {
    width: number;
    height: number;
    data: Uint8Array;
}
/**
 * Decode a PNG with node's zlib and no other dependency. Covers what design exports and browser
 * screenshots produce: 8-bit, non-interlaced, greyscale, RGB, palette, grey+alpha or RGBA.
 */
export declare function decodePng(buf: Buffer): RgbaImage;
