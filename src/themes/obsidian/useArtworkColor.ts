import { useEffect, useState } from "@webpack/common";
import { createArtworkColorPool } from "../artworkColorPool";

import { dominantArtworkColor, type ArtworkRgb } from "./fracture";

const SAMPLE_SIZE = 24;
function loadColor(url: string, signal: AbortSignal): Promise<ArtworkRgb | null> {
    return new Promise(resolve => {
        const image = new Image();
        let settled = false;
        const finish = (color: ArtworkRgb | null, cancel = false) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            signal.removeEventListener("abort", abort);
            image.onload = image.onerror = null;
            if (cancel) {
                try { image.removeAttribute("src"); } catch { }
            }
            resolve(color);
        };
        const abort = () => finish(null, true);
        const timeout = setTimeout(abort, 5000);
        if (signal.aborted) return abort();
        signal.addEventListener("abort", abort, { once: true });
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
}

const pool = createArtworkColorPool(loadColor);

export function preloadObsidianArtworkColors(owner: object, urls: Iterable<string | null>): void {
    pool.replaceCatalogue(owner, urls);
}

export function useObsidianArtworkColor(active: boolean, url: string | null): ArtworkRgb | null {
    const [sample, setSample] = useState<{ url: string; color: ArtworkRgb | null; } | null>(null);

    useEffect(() => {
        if (!active || !url) return;
        let alive = true;
        const request = pool.acquire(url);
        void request.promise.then(color => {
            if (alive) setSample({ url, color });
        });
        return () => { alive = false; request.release(); };
    }, [active, url]);

    if (!active || !url) return null;
    // Preloaded colors are available on the very first render after filtering or remounting.
    const color = pool.peek(url);
    if (color !== undefined) return color;
    return sample?.url === url ? sample.color : null;
}
