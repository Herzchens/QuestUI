/** Area-weighted modal color cluster for the actual visible thumbnail.
 * A perceptual radius joins compression/lighting variants of one color;
 * near-black, near-white and grayscale pixels are excluded before voting.
 * Eligible colors still vote only by visible area; no saturation weighting.
 */
export type OrigamiRgb = readonly [number, number, number];

const RADIUS = .075;
type Bin = { count: number; r: number; g: number; b: number; };
type Sample = Bin & { lab: OrigamiRgb; cell: OrigamiRgb; };
const linear = (value: number) => {
    const v = value / 255;
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
};
function oklab(r: number, g: number, b: number): OrigamiRgb {
    const x = linear(r), y = linear(g), z = linear(b);
    const l = Math.cbrt(.4122214708 * x + .5363325363 * y + .0514459929 * z);
    const m = Math.cbrt(.2119034982 * x + .6806995451 * y + .1073969566 * z);
    const s = Math.cbrt(.0883024619 * x + .2817188376 * y + .6299787005 * z);
    return [
        .2104542553 * l + .7936177850 * m - .0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + .4505937099 * s,
        .0259040371 * l + .7827717662 * m - .8086757660 * s
    ];
}
const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

export function dominantThumbnailColor(pixels: ArrayLike<number>): OrigamiRgb | null {
    const bins = new Map<number, Bin>();
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
        if (a === 0) continue;
        const low = Math.min(r, g, b), high = Math.max(r, g, b);
        // Reject neutral paper/black backgrounds and compression noise.
        // Keep dark or pastel colors if they have meaningful channel separation.
        if (high <= 32 || low >= 235 || high - low < 24) continue;
        // Eligible pixels vote only by visible coverage.
        const key = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3);
        let bin = bins.get(key);
        if (!bin) bins.set(key, bin = { count: 0, r: 0, g: 0, b: 0 });
        bin.count += a;
        bin.r += r * a;
        bin.g += g * a;
        bin.b += b * a;
    }
    if (!bins.size) return null;

    const cells = new Map<string, Sample[]>();
    const samples: Sample[] = [];
    // Deterministic tie-break: fixed RGB bucket order, independent of pixel traversal.
    for (const [, bin] of [...bins].sort(([a], [b]) => a - b)) {
        const lab = oklab(bin.r / bin.count, bin.g / bin.count, bin.b / bin.count);
        const cell: OrigamiRgb = [
            Math.floor(lab[0] / RADIUS), Math.floor(lab[1] / RADIUS), Math.floor(lab[2] / RADIUS)
        ];
        const sample: Sample = { ...bin, lab, cell };
        samples.push(sample);
        const key = cellKey(...cell);
        const group = cells.get(key);
        if (group) group.push(sample);
        else cells.set(key, [sample]);
    }

    let best: Bin = { count: 0, r: 0, g: 0, b: 0 };
    for (const sample of samples) {
        const [cx, cy, cz] = sample.cell;
        const cluster: Bin = { count: 0, r: 0, g: 0, b: 0 };
        for (let x = cx - 1; x <= cx + 1; x++) {
            for (let y = cy - 1; y <= cy + 1; y++) {
                for (let z = cz - 1; z <= cz + 1; z++) {
                    const nearby = cells.get(cellKey(x, y, z));
                    if (!nearby) continue;
                    for (const candidate of nearby) {
                        const dl = sample.lab[0] - candidate.lab[0];
                        const da = sample.lab[1] - candidate.lab[1];
                        const db = sample.lab[2] - candidate.lab[2];
                        if (dl * dl + da * da + db * db > RADIUS * RADIUS) continue;
                        cluster.count += candidate.count;
                        cluster.r += candidate.r;
                        cluster.g += candidate.g;
                        cluster.b += candidate.b;
                    }
                }
            }
        }
        if (cluster.count > best.count) best = cluster;
    }
    return best.count ? [
        Math.round(best.r / best.count),
        Math.round(best.g / best.count),
        Math.round(best.b / best.count)
    ] : null;
}
