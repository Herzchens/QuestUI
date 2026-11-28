export const GRAPHICS_PRESETS = [
    { name: "Low", subtitle: "Performance" },
    { name: "Medium", subtitle: "Balanced" },
    { name: "High", subtitle: "High Quality" },
    { name: "Max", subtitle: "Maximum Quality" },
    { name: "Ultra", subtitle: "Coming Soon" }
] as const;

export const DEFAULT_GRAPHICS_PREFERENCE = "3";
export const LAST_UNLOCKED_GRAPHICS_INDEX = 3;
export interface GraphicsPreference { quality: number; reduceMotion: boolean; light: boolean; }

export function readGraphicsPreference(value: unknown): GraphicsPreference {
    if (value === "light") return { quality: 0, reduceMotion: true, light: true };
    if (typeof value === "string" && /^[0-3](?::reduced)?$/.test(value)) {
        return { quality: Number(value[0]), reduceMotion: value.endsWith(":reduced"), light: false };
    }
    return { quality: 3, reduceMotion: false, light: false };
}

export function writeGraphicsPreference(value: GraphicsPreference): string {
    if (value.light && value.quality === 0 && value.reduceMotion) return "light";
    const quality = Number.isInteger(value.quality) && value.quality >= 0 && value.quality <= LAST_UNLOCKED_GRAPHICS_INDEX ? value.quality : 3;
    return String(quality) + (value.reduceMotion ? ":reduced" : "");
}

export function selectGraphicsQuality(value: GraphicsPreference, index: number): GraphicsPreference {
    if (!Number.isInteger(index) || index < 0 || index > LAST_UNLOCKED_GRAPHICS_INDEX) return value.light ? { ...value, light: false } : value;
    return { quality: index, reduceMotion: value.reduceMotion, light: false };
}

export function toggleGraphicsLight(value: GraphicsPreference): GraphicsPreference {
    return { quality: 0, reduceMotion: !value.light, light: !value.light };
}

export function toggleGraphicsMotion(value: GraphicsPreference): GraphicsPreference {
    return { quality: value.quality, reduceMotion: !value.reduceMotion, light: false };
}

export function graphicsPointerIndex(x: number, width: number, inset = 14): number {
    if (!Number.isFinite(x) || !Number.isFinite(width) || width <= inset * 2) return -1;
    return Math.max(0, Math.min(4, Math.round((x - inset) / (width - inset * 2) * 4)));
}

/** Ultra can be inspected but never persisted as an effective quality. */
export function chooseGraphicsDetent(value: GraphicsPreference, index: number): { preference: GraphicsPreference; preview: boolean; } {
    return { preference: selectGraphicsQuality(value, index), preview: index === 4 };
}

export function showReducedGraphicsSubtitle(value: GraphicsPreference, preview: boolean): boolean {
    return value.reduceMotion && !value.light && !preview;
}

export function graphicsKeyboardDetent(index: number, key: string): number | null {
    if (key === "Home") return 0;
    if (key === "End") return 4;
    if (key === "ArrowLeft" || key === "ArrowDown") return Math.max(0, index - 1);
    if (key === "ArrowRight" || key === "ArrowUp") return Math.min(4, index + 1);
    return null;
}
