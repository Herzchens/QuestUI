/** Pure Obsidian presentation helpers. */
export type ArtworkRgb = readonly [number, number, number];

export function fractureVariant(questId: string): number {
    let hash = 2166136261;
    for (let index = 0; index < questId.length; index++) {
        hash ^= questId.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 4;
}

/** Vote for the dominant visible color cluster, retaining neutral artwork as neutral. */
export function dominantArtworkColor(pixels: ArrayLike<number>): ArtworkRgb | null {
    const buckets = Array.from({ length: 64 }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
    for (let index = 0; index + 3 < pixels.length; index += 4) {
        const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2], a = pixels[index + 3];
        if (a < 128) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max < 24 || min > 244) continue;
        const chroma = max - min;
        const weight = (a / 255) * (.35 + chroma / 255) * (.35 + max / 255);
        const bucket = buckets[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)];
        bucket.weight += weight;
        bucket.r += r * weight;
        bucket.g += g * weight;
        bucket.b += b * weight;
    }
    const best = buckets.reduce((a, b) => a.weight >= b.weight ? a : b);
    if (!best.weight) return null;
    return [
        Math.round(best.r / best.weight),
        Math.round(best.g / best.weight),
        Math.round(best.b / best.weight)
    ];
}
