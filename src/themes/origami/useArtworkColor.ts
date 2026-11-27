import { useEffect, useState } from "@webpack/common";

import { dominantThumbnailColor, type OrigamiRgb } from "./thumbnailColor";

const SAMPLE_LIMIT = 256;
const CACHE_LIMIT = 256;
type ColorEntry = { pending: Promise<OrigamiRgb | null>; color?: OrigamiRgb | null; };
const cache = new Map<string, ColorEntry>();

function readColor(url: string): Promise<OrigamiRgb | null> {
    const previous = cache.get(url);
    if (previous) return previous.pending;

    const pending = new Promise<OrigamiRgb | null>(resolve => {
        const image = new Image();
        const finish = (color: OrigamiRgb | null) => {
            clearTimeout(timeout);
            image.onload = image.onerror = null;
            resolve(color);
        };
        const timeout = setTimeout(() => finish(null), 5000);
        image.crossOrigin = "anonymous";
        image.onload = () => {
            try {
                const { naturalWidth: width, naturalHeight: height } = image;
                if (!width || !height) return finish(null);
                const scale = Math.min(1, SAMPLE_LIMIT / Math.max(width, height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(width * scale));
                canvas.height = Math.max(1, Math.round(height * scale));
                const context = canvas.getContext("2d", { willReadFrequently: true });
                if (!context) return finish(null);
                // Do not introduce new interpolated colors into the area vote.
                context.imageSmoothingEnabled = false;
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                finish(dominantThumbnailColor(context.getImageData(0, 0, canvas.width, canvas.height).data));
            } catch {
                // Tainted canvas, failed decoding and other client errors are cosmetic.
                finish(null);
            }
        };
        image.onerror = () => finish(null);
        try { image.src = url; } catch { finish(null); }
    });

    const entry: ColorEntry = { pending };
    cache.set(url, entry);
    while (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
    void pending.then(color => { entry.color = color; });
    return pending;
}

export function preloadOrigamiArtworkColors(urls: Iterable<string | null>): void {
    const current = new Set(Array.from(urls).filter((url): url is string => Boolean(url)));
    for (const url of cache.keys()) {
        if (!current.has(url)) cache.delete(url);
    }
    for (const url of current) void readColor(url);
}

export function useOrigamiArtworkColor(active: boolean, url: string | null): OrigamiRgb | null {
    const [sample, setSample] = useState<{ url: string; color: OrigamiRgb | null; } | null>(null);
    useEffect(() => {
        if (!active || !url) return;
        let alive = true;
        void readColor(url).then(color => {
            if (alive) setSample({ url, color });
        });
        return () => { alive = false; };
    }, [active, url]);

    if (!active || !url) return null;
    const entry = cache.get(url);
    if (entry?.color !== undefined) return entry.color;
    return sample?.url === url ? sample.color : null;
}
