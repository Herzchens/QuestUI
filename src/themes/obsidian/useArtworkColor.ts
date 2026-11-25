import { useEffect, useRef, useState } from "@webpack/common";

import { dominantArtworkColor, type ArtworkRgb } from "./fracture";

const CACHE_LIMIT = 128;
const SAMPLE_SIZE = 24;
const cache = new Map<string, Promise<ArtworkRgb | null>>();

function readArtworkColor(url: string): Promise<ArtworkRgb | null> {
    const cached = cache.get(url);
    if (cached) {
        cache.delete(url);
        cache.set(url, cached);
        return cached;
    }

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
    cache.set(url, pending);
    if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    return pending;
}

/** Only sample visible/nearby artwork while Obsidian is active. */
export function useObsidianArtworkColor(active: boolean, url: string | null) {
    const cardRef = useRef<HTMLElement | null>(null);
    const [sample, setSample] = useState<{ url: string; color: ArtworkRgb | null; } | null>(null);

    useEffect(() => {
        if (!active || !url || !cardRef.current) return;
        let alive = true;
        const load = () => {
            void readArtworkColor(url).then(color => {
                if (alive) setSample({ url, color });
            });
        };
        let observer: IntersectionObserver | undefined;
        if (typeof IntersectionObserver === "undefined") load();
        else {
            observer = new IntersectionObserver(entries => {
                if (!entries.some(entry => entry.isIntersecting)) return;
                observer?.disconnect();
                load();
            }, { rootMargin: "120px" });
            observer.observe(cardRef.current);
        }
        return () => {
            alive = false;
            observer?.disconnect();
        };
    }, [active, url]);

    return { cardRef, color: active && sample?.url === url ? sample?.color ?? null : null };
}
