import { inflateSync } from "node:zlib";
import { SetupError } from "../errors.js";
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
/**
 * Decode a PNG with node's zlib and no other dependency. Covers what design exports and browser
 * screenshots produce: 8-bit, non-interlaced, greyscale, RGB, palette, grey+alpha or RGBA.
 */
export function decodePng(buf) {
    if (buf.length < 8 || SIGNATURE.some((b, i) => buf[i] !== b))
        throw new SetupError("not a PNG file");
    let offset = 8;
    let width = 0;
    let height = 0;
    let colorType = -1;
    let palette;
    let paletteAlpha;
    const idat = [];
    while (offset + 8 <= buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.toString("ascii", offset + 4, offset + 8);
        const data = buf.subarray(offset + 8, offset + 8 + length);
        offset += 12 + length;
        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            const bitDepth = data[8];
            colorType = data[9];
            if (data[12] !== 0)
                throw new SetupError("interlaced PNG is not supported; re-export it non-interlaced");
            if (bitDepth !== 8)
                throw new SetupError(`PNG bit depth ${bitDepth} is not supported; re-export as 8-bit`);
            if (!(colorType in CHANNELS))
                throw new SetupError(`PNG colour type ${colorType} is not supported`);
        }
        else if (type === "PLTE")
            palette = data;
        else if (type === "tRNS")
            paletteAlpha = data;
        else if (type === "IDAT")
            idat.push(data);
        else if (type === "IEND")
            break;
    }
    if (!width || !height || idat.length === 0)
        throw new SetupError("PNG has no image data");
    if (colorType === 3 && !palette)
        throw new SetupError("palette PNG has no palette");
    const channels = CHANNELS[colorType];
    const stride = width * channels;
    let raw;
    try {
        raw = inflateSync(Buffer.concat(idat));
    }
    catch {
        throw new SetupError("PNG image data is corrupt");
    }
    if (raw.length < height * (stride + 1))
        throw new SetupError("PNG image data is truncated");
    const pixels = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const src = y * (stride + 1) + 1;
        const row = y * stride;
        for (let i = 0; i < stride; i++) {
            const a = i >= channels ? pixels[row + i - channels] : 0;
            const b = y > 0 ? pixels[row - stride + i] : 0;
            const c = i >= channels && y > 0 ? pixels[row - stride + i - channels] : 0;
            const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : -1;
            if (predictor < 0)
                throw new SetupError(`PNG row filter ${filter} is invalid`);
            pixels[row + i] = (raw[src + i] + predictor) & 0xff;
        }
    }
    const data = new Uint8Array(width * height * 4);
    for (let p = 0; p < width * height; p++) {
        const s = p * channels;
        let r, g, b, alpha = 255;
        if (colorType === 6)
            [r, g, b, alpha] = [pixels[s], pixels[s + 1], pixels[s + 2], pixels[s + 3]];
        else if (colorType === 2)
            [r, g, b] = [pixels[s], pixels[s + 1], pixels[s + 2]];
        else if (colorType === 0)
            r = g = b = pixels[s];
        else if (colorType === 4) {
            r = g = b = pixels[s];
            alpha = pixels[s + 1];
        }
        else {
            const index = pixels[s];
            r = palette[index * 3] ?? 0;
            g = palette[index * 3 + 1] ?? 0;
            b = palette[index * 3 + 2] ?? 0;
            alpha = paletteAlpha?.[index] ?? 255;
        }
        const over = (v) => Math.round((v * alpha + 255 * (255 - alpha)) / 255);
        data.set([over(r), over(g), over(b), 255], p * 4);
    }
    return { width, height, data };
}
