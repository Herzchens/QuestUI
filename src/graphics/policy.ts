import { readGraphicsPreference } from "../dashboard/graphicsLogic";

export type GraphicsQuality = "low" | "medium" | "high" | "max";
export interface GraphicsQualityPolicy {
    readonly id: GraphicsQuality;
    readonly ambientArtwork: boolean;
    readonly artworkColor: boolean;
    readonly prewarmLimit: number;
    readonly terminalPanorama: boolean;
    readonly sakuraOrnaments: boolean;
}

const PRESETS: readonly GraphicsQualityPolicy[] = Object.freeze([
    Object.freeze({ id: "low", ambientArtwork: false, artworkColor: false, prewarmLimit: 0, terminalPanorama: false, sakuraOrnaments: false } as const),
    Object.freeze({ id: "medium", ambientArtwork: true, artworkColor: true, prewarmLimit: 0, terminalPanorama: false, sakuraOrnaments: true } as const),
    Object.freeze({ id: "high", ambientArtwork: true, artworkColor: true, prewarmLimit: 64, terminalPanorama: true, sakuraOrnaments: true } as const),
    Object.freeze({ id: "max", ambientArtwork: true, artworkColor: true, prewarmLimit: 256, terminalPanorama: true, sakuraOrnaments: true } as const)
]);

export function graphicsQualityPolicy(preference: unknown): GraphicsQualityPolicy {
    return PRESETS[readGraphicsPreference(preference).quality];
}

export function effectiveReducedMotion(preference: unknown, systemReduced: boolean): boolean {
    return readGraphicsPreference(preference).reduceMotion || systemReduced;
}

export function graphicsRootClasses(preference: unknown, systemReduced: boolean): string[] {
    const quality = graphicsQualityPolicy(preference);
    return ["quest-ui-quality-" + quality.id, ...(effectiveReducedMotion(preference, systemReduced) ? ["quest-ui-reduced-motion"] : [])];
}

/** Avoid walking the entire catalogue when the selected budget is small. */
export function artworkPrewarmUrls<T>(items: Iterable<T>, resolve: (item: T) => string | null, limit: number): string[] {
    const result = new Set<string>();
    if (!Number.isInteger(limit) || limit <= 0) return [];
    for (const item of items) {
        const url = resolve(item);
        if (url) result.add(url);
        if (result.size >= limit) break;
    }
    return [...result];
}
