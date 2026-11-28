import { useEffect, useState } from "@webpack/common";
import { safeQuestArtworkUrl } from "../../quests/presentationLogic";
import { createArtworkColorPool } from "../artworkColorPool";

import { dominantThumbnailColorAsync, type OrigamiRgb } from "./thumbnailColor";

const SAMPLE_LIMIT = 256;
const CACHE_LIMIT = 256;
function loadColor(url: string, signal: AbortSignal): Promise<OrigamiRgb | null> {
    return new Promise(resolve => {
        const image = new Image();
        let settled = false;
        const finish = (color: OrigamiRgb | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            signal.removeEventListener("abort", abort);
            image.onload = image.onerror = null;
            try { image.removeAttribute("src"); } catch { }
            resolve(color);
        };
        const abort = () => finish(null);
        const timeout = setTimeout(abort, 5000);
        if (signal.aborted) return abort();
        signal.addEventListener("abort", abort, { once: true });
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
                void dominantThumbnailColorAsync(context.getImageData(0, 0, canvas.width, canvas.height).data, () => settled || signal.aborted)
                    .then(color => finish(color), () => finish(null));
            } catch {
                // Tainted canvas, failed decoding and other client errors are cosmetic.
                finish(null);
            }
        };
        image.onerror = () => finish(null);
        try { image.src = url; } catch { finish(null); }
    });
}

const pool = createArtworkColorPool(loadColor, CACHE_LIMIT, 4, 64);

export function preloadOrigamiArtworkColors(owner: object, urls: Iterable<string | null>): void {
    pool.replaceCatalogue(owner, (function* () { for (const url of urls) yield safeQuestArtworkUrl(url) ? url : null; })());
}

export const startOrigamiArtwork = pool.start;
export const stopOrigamiArtwork = pool.stop;

export function useOrigamiArtworkColor(active: boolean, source: string | null): OrigamiRgb | null {
    const url = active && safeQuestArtworkUrl(source) ? source : null;
    const [sample, setSample] = useState<{ url: string; color: OrigamiRgb | null; } | null>(null);
    useEffect(() => {
        if (!active || !url) { setSample(null); return; }
        let alive = true;
        const request = pool.acquire(url);
        void request.promise.then(color => {
            if (alive) setSample({ url, color });
        });
        return () => { alive = false; request.release(); };
    }, [active, url]);

    if (!active || !url) return null;
    const color = pool.peek(url);
    if (color !== undefined) return color;
    return sample?.url === url ? sample.color : null;
}
