/** Sakura full-card panoramic materials, in embedded asset order. */
export const SAKURA_ORNAMENT_COUNT = 10;

export function ornamentVariant(questId: string): number {
    let hash = 2166136261;
    for (let index = 0; index < questId.length; index++) {
        hash ^= questId.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % SAKURA_ORNAMENT_COUNT;
}

/** Deterministic for a displayed order; no repeats within one full material cycle. */
export function ornamentVariantSequence(questIds: readonly string[]): number[] {
    const recent: number[] = [];
    return questIds.map(id => {
        let variant = ornamentVariant(id);
        while (recent.includes(variant)) variant = (variant + 1) % SAKURA_ORNAMENT_COUNT;
        recent.push(variant);
        if (recent.length >= SAKURA_ORNAMENT_COUNT) recent.shift();
        return variant;
    });
}
