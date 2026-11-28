import { useEffect, useState } from "@webpack/common";

import { safeQuestArtworkUrl } from "../../quests/presentationLogic";
import { ARTWORK_CACHE_BYTES, artworkStringBytes, createArtworkQueue } from "./artworkQueue";
import type { CSSProperties } from "react";

import { parseTerminalArtworkKey, pixelateTerminalArtwork, terminalArtworkAccent, terminalArtworkKey, TERMINAL_ARTWORK_SIZES, type TerminalArtworkContext } from "./pixelArtwork";

const TIMEOUT_MS = 5000;
export interface TerminalArtwork {
    readonly png: string;
    readonly frame: string | undefined;
}

function artworkFrame(color: string | null): string | undefined {
    if (!color) return undefined;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="${color}" fill-rule="evenodd" d="M4 0H12V2H14V4H16V12H14V14H12V16H4V14H2V12H0V4H2V2H4ZM5 1H11V3H13V5H15V11H13V13H11V15H5V13H3V11H1V5H3V3H5Z"/></svg>`;
    return color === "neutral" ? "var(--terminal-frame-silver)" : `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function loadPixelArtwork(key: string, signal: AbortSignal): Promise<TerminalArtwork | null> {
    const parsed = parseTerminalArtworkKey(key);
    const url = parsed && safeQuestArtworkUrl(parsed.url);
    if (!parsed || !url) return Promise.resolve(null);
    const { size } = parsed;
    return new Promise(resolve => {
        if (signal.aborted) return resolve(null);
        const image = new Image();
        let finished = false;
        const finish = (value: TerminalArtwork | null) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            signal.removeEventListener("abort", cancel);
            image.onload = image.onerror = null;
            image.removeAttribute("src");
            resolve(value);
        };
        const cancel = () => finish(null);
        const timeout = setTimeout(cancel, TIMEOUT_MS);
        signal.addEventListener("abort", cancel, { once: true });
        image.crossOrigin = "anonymous";
        image.onload = () => {
            try {
                const side = Math.min(image.naturalWidth, image.naturalHeight);
                if (!side) return finish(null);
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = size;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (!ctx) return finish(null);
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
                const frame = ctx.getImageData(0, 0, size, size);
                frame.data.set(pixelateTerminalArtwork(frame.data, size, size));
                ctx.putImageData(frame, 0, 0);
                const result = canvas.toDataURL("image/png");
                if (!result.startsWith("data:image/png;base64,")) return finish(null);
                finish({ png: result, frame: artworkFrame(terminalArtworkAccent(frame.data)) });
            } catch {
                finish(null);
            }
        };
        image.onerror = cancel;
        try {
            image.src = url;
        } catch {
            finish(null);
        }
    });
}

const artwork = createArtworkQueue(loadPixelArtwork, 4, 128, Date.now, ARTWORK_CACHE_BYTES.pixel,
    value => artworkStringBytes(value.png) + artworkStringBytes(value.frame ?? ""));
export const startTerminalArtwork = artwork.start;
export const stopTerminalArtwork = artwork.stop;

/** Only active Terminal views subscribe. A stale result never crosses URLs, sizes or themes. */
export function useTerminalArtwork(active: boolean, source: string | null, context: TerminalArtworkContext): TerminalArtwork | null {
    const url = active ? safeQuestArtworkUrl(source) : null;
    const key = url ? terminalArtworkKey(url, TERMINAL_ARTWORK_SIZES[context]) : null;
    const [sample, setSample] = useState<{ key: string; value: TerminalArtwork | null; } | null>(null);
    useEffect(() => {
        if (!key) { setSample(null); return; }
        let alive = true;
        const request = artwork.acquire(key);
        void request.promise.then(value => {
            if (alive) setSample({ key, value });
        });
        return () => {
            alive = false;
            request.release();
        };
    }, [key]);
    if (!key) return null;
    const cached = artwork.peek(key);
    if (cached !== undefined) return cached;
    return sample?.key === key ? sample.value : null;
}

/** Sync the phosphor texture with the actual raster without duplicating sizes in CSS. */
export function terminalArtworkGrid(pixel: TerminalArtwork | null, context: TerminalArtworkContext): CSSProperties | undefined {
    if (!pixel) return undefined;
    return {
        "--terminal-artwork-cell": `${100 / TERMINAL_ARTWORK_SIZES[context]}%`,
        "--terminal-artwork-frame": pixel.frame
    } as CSSProperties;
}
