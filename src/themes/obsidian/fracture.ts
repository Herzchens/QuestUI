import { OBSIDIAN_FRACTURE_VARIANT_COUNT } from "./fractureVariantCount";

/** Pure Obsidian presentation helpers. */
export type ArtworkRgb = readonly [number, number, number];

export function fractureVariant(questId: string): number {
    let hash = 2166136261;
    for (let index = 0; index < questId.length; index++) {
        hash ^= questId.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % OBSIDIAN_FRACTURE_VARIANT_COUNT;
}

/** Assign materials in displayed order, excluding the four preceding cards. */
export function fractureVariantSequence(questIds: readonly string[]): number[] {
    const variants: number[] = [];
    const recent: number[] = [];

    for (const questId of questIds) {
        let variant = fractureVariant(questId);
        while (recent.includes(variant)) {
            variant = (variant + 1) % OBSIDIAN_FRACTURE_VARIANT_COUNT;
        }
        variants.push(variant);
        recent.push(variant);
        if (recent.length > 4) recent.shift();
    }
    return variants;
}

type ColorVote = { weight: number; r: number; g: number; b: number; };

function vote(bucket: ColorVote, r: number, g: number, b: number, weight: number): void {
    bucket.weight += weight;
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
}

function average(bucket: ColorVote): ArtworkRgb {
    return [Math.round(bucket.r / bucket.weight), Math.round(bucket.g / bucket.weight), Math.round(bucket.b / bucket.weight)];
}

/** Prefer actual chromatic artwork over neutral backing and white lettering.
 * Preserve a neutral result when no meaningful color is present. */
export function dominantArtworkColor(pixels: ArrayLike<number>): ArtworkRgb | null {
    const neutral = Array.from({ length: 64 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
    const chromatic = new Map<number, ColorVote>();
    for (let index = 0; index + 3 < pixels.length; index += 4) {
        const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2], a = pixels[index + 3];
        if (a < 128) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max < 24 || min > 244) continue;
        const chroma = max - min;
        if (chroma >= 16) {
            // Visible area, not saturation, determines the winning color.
            // Finer buckets retain pastel shades rather than merging them with whites.
            const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
            let bucket = chromatic.get(key);
            if (!bucket) chromatic.set(key, bucket = { weight: 0, r: 0, g: 0, b: 0 });
            vote(bucket, r, g, b, a / 255);
        } else {
            const weight = (a / 255) * (.35 + chroma / 255) * (.35 + max / 255);
            vote(neutral[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)], r, g, b, weight);
        }
    }
    if (chromatic.size) {
        // Join nearby shades across quantization boundaries, with deterministic ties.
        const samples = [...chromatic].sort(([a], [b]) => a - b).map(([, bucket]) => ({
            bucket, color: average(bucket)
        }));
        let best: ColorVote = { weight: 0, r: 0, g: 0, b: 0 };
        for (const { color } of samples) {
            const cluster: ColorVote = { weight: 0, r: 0, g: 0, b: 0 };
            for (const candidate of samples) {
                const distance = color.reduce((sum, channel, i) => sum + (channel - candidate.color[i]) ** 2, 0);
                if (distance > 48 ** 2) continue;
                const { bucket } = candidate;
                cluster.weight += bucket.weight;
                cluster.r += bucket.r;
                cluster.g += bucket.g;
                cluster.b += bucket.b;
            }
            if (cluster.weight > best.weight) best = cluster;
        }
        return average(best);
    }
    const best = neutral.reduce((a, b) => a.weight >= b.weight ? a : b);
    return best.weight ? average(best) : null;
}
