/** Pure bounded pixel artwork processing for Terminal. */
export const TERMINAL_ARTWORK_SIZES = { dashboard: 56, notification: 48 } as const;
export type TerminalArtworkContext = keyof typeof TERMINAL_ARTWORK_SIZES;
export const TERMINAL_PALETTE_LIMIT = 24;
const BASE_PALETTE_LIMIT = 20;

export function terminalArtworkKey(url: string, size: number): string {
    return `${size}:${url}`;
}

export function parseTerminalArtworkKey(key: string): { size: number; url: string; } | null {
    const separator = key.indexOf(":");
    const size = Number(key.slice(0, separator));
    if (separator <= 0 || !Number.isInteger(size) || size < 1 || size > 64) return null;
    const url = key.slice(separator + 1);
    return url ? { size, url } : null;
}

type RGB = [number, number, number];
type Sample = { rgb: RGB; count: number; };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const WEIGHTS = [2, 4, 3];

function clamp(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function distance(a: RGB, b: RGB): number {
    return 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;
}

function luma(r: number, g: number, b: number): number {
    return .2126 * r + .7152 * g + .0722 * b;
}

/** Lift only underexposed artwork; retain black pixels and avoid lifting transparent noise. */
function exposure(rgba: Uint8ClampedArray): number {
    const histogram = new Uint32Array(256);
    let total = 0;
    for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3];
        if (!alpha) continue;
        histogram[Math.round(luma(rgba[i], rgba[i + 1], rgba[i + 2]))] += alpha;
        total += alpha;
    }
    if (!total) return 1;
    let seen = 0;
    for (let i = 0; i < histogram.length; i++) {
        seen += histogram[i];
        if (seen >= total * .9) return Math.min(1.8, Math.max(1, 190 / Math.max(1, i)));
    }
    return 1;
}

function tone(r: number, g: number, b: number, gain: number): RGB {
    const light = luma(r, g, b);
    const lifted = Math.min(255, light * gain);
    const target = lifted < 128 ? lifted * .96 : 122.88 + (lifted - 128) * 1.04;
    const chroma = Math.min(1.35, 1.10 * gain);
    return [clamp(target + (r - light) * chroma), clamp(target + (g - light) * chroma), clamp(target + (b - light) * chroma)];
}

function paletteFor(samples: Sample[], limit: number): RGB[] {
    const boxes: Sample[][] = samples.length ? [samples] : [];
    while (boxes.length < limit) {
        let best = -1, bestAxis = 0, bestScore = 0;
        for (let i = 0; i < boxes.length; i++) {
            if (boxes[i].length < 2) continue;
            const low = [255, 255, 255], high = [0, 0, 0];
            let population = 0;
            for (const { rgb, count } of boxes[i]) {
                population += count;
                for (let axis = 0; axis < 3; axis++) {
                    low[axis] = Math.min(low[axis], rgb[axis]);
                    high[axis] = Math.max(high[axis], rgb[axis]);
                }
            }
            for (let axis = 0; axis < 3; axis++) {
                const score = (high[axis] - low[axis]) ** 2 * WEIGHTS[axis] * Math.sqrt(population);
                if (score > bestScore) {
                    best = i;
                    bestAxis = axis;
                    bestScore = score;
                }
            }
        }
        if (best < 0) break;
        const box = boxes[best].slice().sort((a, b) => a.rgb[bestAxis] - b.rgb[bestAxis]);
        const half = box.reduce((sum, sample) => sum + sample.count, 0) / 2;
        let split = 1, seen = box[0].count;
        while (split < box.length - 1 && seen < half) seen += box[split++].count;
        boxes.splice(best, 1, box.slice(0, split), box.slice(split));
    }
    return boxes.map((box): RGB => {
        const total = box.reduce((sum, sample) => sum + sample.count, 0);
        const sum = [0, 0, 0];
        for (const { rgb, count } of box) {
            for (let i = 0; i < 3; i++) sum[i] += rgb[i] * count;
        }
        return [clamp(sum[0] / total), clamp(sum[1] / total), clamp(sum[2] / total)];
    });
}

function nearestColor(rgb: RGB, palette: RGB[], threshold: number, edge: boolean): RGB {
    let first = palette[0], second = palette[0];
    let d1 = Infinity, d2 = Infinity;
    for (const candidate of palette) {
        const d = distance(rgb, candidate);
        if (d < d1) {
            second = first;
            d2 = d1;
            first = candidate;
            d1 = d;
        } else if (d < d2) {
            second = candidate;
            d2 = d;
        }
    }
    if (edge || d1 === 0 || !Number.isFinite(d2)) return first;
    const span = distance(first, second);
    // Restrict ordered dithering to similar colors on low-contrast surfaces.
    if (span === 0 || span > 9000 || d2 > d1 * 2.15) return first;
    const projection = (span + d1 - d2) / (2 * span);
    return projection > threshold ? second : first;
}

/** Detect strong boundaries on the immutable toned tile, not quantized output. */
function isArtworkEdge(tile: Uint8ClampedArray, x: number, y: number, width: number, height: number, rgb: RGB): boolean {
    const i = (y * width + x) * 4;
    const alpha = tile[i + 3];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = (ny * width + nx) * 4;
        if (Math.abs(alpha - tile[n + 3]) > 64 || distance(rgb, [tile[n], tile[n + 1], tile[n + 2]]) > 9000) return true;
    }
    return false;
}

/** Process an already downsampled RGBA tile. Preserve alpha and image identity. */
export function pixelateTerminalArtwork(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    limit?: number
): Uint8ClampedArray {
    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width > 64 || height > 64 ||
        rgba.length !== width * height * 4 ||
        (limit !== undefined && (!Number.isInteger(limit) || limit < 2 || limit > 32))) {
        throw new RangeError("Invalid Terminal artwork tile");
    }
    const output = new Uint8ClampedArray(rgba.length);
    const histogram = new Map<number, Sample>();
    const gain = exposure(rgba);
    for (let i = 0; i < rgba.length; i += 4) {
        const alpha = rgba[i + 3];
        output[i + 3] = alpha;
        if (!alpha) continue;
        const rgb = tone(rgba[i], rgba[i + 1], rgba[i + 2], gain);
        output.set(rgb, i);
        const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
        const sample = histogram.get(key);
        if (sample) sample.count += alpha;
        else histogram.set(key, { rgb, count: alpha });
    }
    const palette = paletteFor([...histogram.values()], limit ?? (histogram.size > 128 ? TERMINAL_PALETTE_LIMIT : BASE_PALETTE_LIMIT));
    const toned = output.slice();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            if (!output[i + 3]) continue;
            const rgb: RGB = [toned[i], toned[i + 1], toned[i + 2]];
            const threshold = .30 + .70 * (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16;
            output.set(nearestColor(rgb, palette, threshold, isArtworkEdge(toned, x, y, width, height, rgb)), i);
        }
    }
    return output;
}

/** Prefer a populated chromatic hue over white highlights or dark background pixels. */
export function terminalArtworkAccent(rgba: Uint8ClampedArray): string | null {
    if (rgba.length % 4 !== 0 || rgba.length > 64 * 64 * 4) return null;
    const bins = Array.from({ length: 12 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
    let visible = 0, chromatic = 0;
    for (let i = 0; i < rgba.length; i += 4) {
        const [r, g, b, a] = rgba.subarray(i, i + 4);
        const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
        if (a < 96 || high < 35) continue;
        visible++;
        if (delta < 24 || delta / high < .20) continue;
        chromatic++;
        const hue = ((high === r ? (g - b) / delta : high === g ? 2 + (b - r) / delta : 4 + (r - g) / delta) + 6) % 6;
        const bin = bins[Math.floor(hue * 2)];
        const weight = (a / 255) * (delta / high) * (.4 + .6 * high / 255);
        bin.weight += weight;
        bin.r += r * weight;
        bin.g += g * weight;
        bin.b += b * weight;
    }
    if (!visible) return null;
    if (chromatic / visible < .04) return "neutral";
    const best = bins.reduce((a, b) => b.weight > a.weight ? b : a);
    const rgb = [best.r, best.g, best.b].map(value => value / best.weight);
    const peak = Math.max(...rgb);
    // Keep the hue while lifting the frame to readable phosphor brightness.
    return "#" + rgb.map(value => Math.round(75 + 180 * value / peak).toString(16).padStart(2, "0")).join("");
}
