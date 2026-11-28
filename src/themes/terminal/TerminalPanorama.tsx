import { useEffect, useRef, useState } from "@webpack/common";

import { ARTWORK_CACHE_BYTES, createArtworkQueue } from "./artworkQueue";
import { rasterTerminalPanorama, TERMINAL_PANORAMA } from "./panoramaRaster";
import { TERMINAL_ARTWORK_SIZES } from "./pixelArtwork";

const PNG_PREFIX = "data:image/png;base64,";
const { columns, rows, pitch } = TERMINAL_PANORAMA;

function loadPanorama(source: string, signal: AbortSignal): Promise<string | null> {
    if (!source.startsWith(PNG_PREFIX) || source.length > 65_536 || signal.aborted) return Promise.resolve(null);
    return new Promise(resolve => {
        const image = new Image();
        let finished = false;
        const finish = (value: string | null) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            signal.removeEventListener("abort", cancel);
            image.onload = image.onerror = null;
            image.removeAttribute("src");
            resolve(value);
        };
        const cancel = () => finish(null);
        const timeout = setTimeout(cancel, 3000);
        signal.addEventListener("abort", cancel, { once: true });
        image.onerror = cancel;
        image.onload = () => {
            try {
                const side = TERMINAL_ARTWORK_SIZES.dashboard;
                if (image.naturalWidth !== side || image.naturalHeight !== side) return finish(null);
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = side;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                if (!ctx) return finish(null);
                ctx.drawImage(image, 0, 0);
                const raster = rasterTerminalPanorama(ctx.getImageData(0, 0, side, side).data);
                canvas.width = columns * pitch;
                canvas.height = rows * pitch;
                const frame = ctx.createImageData(canvas.width, canvas.height);
                frame.data.set(raster);
                ctx.putImageData(frame, 0, 0);
                const result = canvas.toDataURL("image/png");
                finish(result.startsWith(PNG_PREFIX) ? result : null);
            } catch {
                finish(null);
            }
        };
        try {
            image.src = source;
        } catch {
            finish(null);
        }
    });
}

// Only local, previously processed PNGs enter this bounded queue.
const panoramas = createArtworkQueue(loadPanorama, 2, 64, Date.now, ARTWORK_CACHE_BYTES.panorama);
const panoramaOwners = new Set<object>();
export function startTerminalPanoramas(): void {
    panoramas.setCacheBudget(ARTWORK_CACHE_BYTES.inactivePanorama);
    panoramas.start();
}
export function stopTerminalPanoramas(): void {
    panoramaOwners.clear();
    panoramas.stop();
}
export function setTerminalPanoramaCacheActive(owner: object, active: boolean): void {
    if (active) panoramaOwners.add(owner);
    else panoramaOwners.delete(owner);
    panoramas.setCacheBudget(panoramaOwners.size ? ARTWORK_CACHE_BYTES.panorama : ARTWORK_CACHE_BYTES.inactivePanorama);
}

export function TerminalPanorama({ source }: { source: string | null; }) {
    const element = useRef<HTMLSpanElement>(null);
    const [near, setNear] = useState(false);
    const [sample, setSample] = useState<{ source: string; value: string | null; } | null>(null);
    useEffect(() => {
        const node = element.current;
        if (!node || typeof IntersectionObserver === "undefined") return;
        const root = node.closest(".quest-ui-dashboard-content");
        if (!root) return;
        let alive = true;
        const observer = new IntersectionObserver(entries => {
            if (!alive) return;
            setNear(entries.some(entry => entry.isIntersecting && entry.boundingClientRect.width > 0));
        }, { root, rootMargin: "120px 0px" });
        observer.observe(node);
        return () => { alive = false; observer.disconnect(); };
    }, []);
    useEffect(() => {
        if (!source || !near) { setSample(null); return; }
        let alive = true;
        const request = panoramas.acquire(source);
        void request.promise.then(value => {
            if (alive) setSample({ source, value });
        });
        return () => {
            alive = false;
            request.release();
        };
    }, [source, near]);
    const image = source && sample?.source === source && near ? sample.value : null;
    return (
        <span ref={element} className="quest-ui-card-backdrop quest-ui-terminal-panorama" aria-hidden="true">
            {image && <img src={image} alt="" draggable={false} width={columns * pitch} height={rows * pitch} />}
        </span>
    );
}
