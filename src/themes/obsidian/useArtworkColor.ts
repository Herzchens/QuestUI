import { useEffect, useState } from "@webpack/common";

import { dominantArtworkColor, type ArtworkRgb } from "./fracture";

const SAMPLE_SIZE = 24;
interface ArtworkColorEntry {
    pending: Promise<ArtworkRgb | null>;
    color?: ArtworkRgb | null;
}

const cache = new Map<string, ArtworkColorEntry>();

function readArtworkColor(url: string): Promise<ArtworkRgb | null> {
    const cached = cache.get(url);
    if (cached) return cached.pending;

    const pending = new Promise<ArtworkRgb | null>(resolve => {
        const image = new Image();
        const finish = (value: ArtworkRgb | null) => {
            clearTimeout(timeout);
            image.onload = image.onerror = null;
            resolve(value);
        };
        const timeout = setTimeout(() => finish(null), 5000);
        image.crossOrigin = "anonymous";
        image.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = SAMPLE_SIZE;
                const context = canvas.getContext("2d", { willReadFrequently: true });
                if (!context) return finish(null);
                context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
                finish(dominantArtworkColor(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data));
            } catch {
                finish(null);
            }
        };
        image.onerror = () => finish(null);
        try {
            image.src = url;
        } catch {
            finish(null);
        }
    });
    const entry: ArtworkColorEntry = { pending };
    cache.set(url, entry);
    void pending.then(color => { entry.color = color; });
    return pending;
}

/** Prewarm the entire Quest catalogue, including cards excluded by filters. */
export function preloadObsidianArtworkColors(urls: Iterable<string | null>): void {
    const catalogue = new Set(Array.from(urls).filter((url): url is string => Boolean(url)));
    // Retain the current catalogue and discard obsolete asset URLs.
    for (const url of cache.keys()) {
        if (!catalogue.has(url)) cache.delete(url);
    }
    for (const url of catalogue) void readArtworkColor(url);
}

/** Sample immediately on mount or artwork changes; scrolling is not a trigger. */
export function useObsidianArtworkColor(active: boolean, url: string | null): ArtworkRgb | null {
    const [sample, setSample] = useState<{ url: string; color: ArtworkRgb | null; } | null>(null);

    useEffect(() => {
        if (!active || !url) return;
        let alive = true;
        void readArtworkColor(url).then(color => {
            if (alive) setSample({ url, color });
        });
        return () => { alive = false; };
    }, [active, url]);

    if (!active || !url) return null;
    // Preloaded colors are available on the very first render after filtering or remounting.
    const cached = cache.get(url);
    if (cached?.color !== undefined) return cached.color;
    return sample?.url === url ? sample.color : null;
}
