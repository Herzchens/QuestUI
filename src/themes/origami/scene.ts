/** Presentation-only artwork. The initial preference depends only on Quest ID. */
export const ORIGAMI_ANIMALS = [
    "crane", "whale", "wolf", "rabbit", "fox", "butterfly", "elephant", "turtle", "koi", "owl"
] as const;
export type OrigamiAnimal = typeof ORIGAMI_ANIMALS[number];

export function origamiScene(id: string): OrigamiAnimal {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
    return ORIGAMI_ANIMALS[(hash >>> 0) % ORIGAMI_ANIMALS.length];
}

/** Deterministic for a displayed order; no repeats in a full ten-scene cycle. */
export function origamiSceneSequence(questIds: readonly string[]): OrigamiAnimal[] {
    const recent: OrigamiAnimal[] = [];
    return questIds.map(id => {
        let index = ORIGAMI_ANIMALS.indexOf(origamiScene(id));
        while (recent.includes(ORIGAMI_ANIMALS[index])) index = (index + 1) % ORIGAMI_ANIMALS.length;
        const scene = ORIGAMI_ANIMALS[index];
        recent.push(scene);
        if (recent.length >= ORIGAMI_ANIMALS.length) recent.shift();
        return scene;
    });
}

export function normalizeOrigamiProgress(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}
