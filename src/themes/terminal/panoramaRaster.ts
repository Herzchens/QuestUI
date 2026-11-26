import { pixelateTerminalArtwork, TERMINAL_ARTWORK_SIZES } from "./pixelArtwork";

export const TERMINAL_PANORAMA = { columns: 224, rows: 32, pitch: 4, dot: 3 } as const;

/** Re-rasterize the processed thumbnail, preserving the source aspect ratio. */
export function rasterTerminalPanorama(source: Uint8ClampedArray): Uint8ClampedArray {
    const side = TERMINAL_ARTWORK_SIZES.dashboard;
    if (source.length !== side * side * 4) throw new RangeError("Invalid Terminal panorama source");
    const { columns, rows, pitch, dot } = TERMINAL_PANORAMA;
    // Quantize once at the original bounded size. The wide composition combines
    // a full-width aspect-preserving crop with a less-cropped focal region.
    const palette = pixelateTerminalArtwork(source, side, side, 12);
    const cropHeight = side * rows / columns;
    const cropTop = (side - cropHeight) / 2;
    const focalWidth = rows * 1.8;
    const focalCenter = columns * .62;
    const sample = (sx: number, sy: number) => {
        const x = Math.max(0, Math.min(side - 1, Math.floor(sx)));
        const y = Math.max(0, Math.min(side - 1, Math.floor(sy)));
        return (y * side + x) * 4;
    };
    const width = columns * pitch;
    const output = new Uint8ClampedArray(width * rows * pitch * 4);
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
        const ambient = sample((x + .5) * side / columns, cropTop + (y + .5) * cropHeight / rows);
        const focalX = (x + .5 - focalCenter) / focalWidth + .5;
        const focalY = (y + .5 - rows / 2) / focalWidth + .5;
        const focal = sample(focalX * side, focalY * side);
        const edge = Math.max(0, Math.min(1, (0.5 - Math.abs(focalX - .5)) * 5));
        const blend = edge * edge * (3 - 2 * edge);
        const ambientAlpha = palette[ambient + 3] / 255 * (1 - blend);
        const focalAlpha = palette[focal + 3] / 255 * blend;
        const a = ambientAlpha + focalAlpha;
        if (!a) continue;
        const r = Math.round((palette[ambient] * ambientAlpha + palette[focal] * focalAlpha) / a);
        const g = Math.round((palette[ambient + 1] * ambientAlpha + palette[focal + 1] * focalAlpha) / a);
        const b = Math.round((palette[ambient + 2] * ambientAlpha + palette[focal + 2] * focalAlpha) / a);
        const light = .2126 * r + .7152 * g + .0722 * b;
        if (light < 20) continue;
        const alpha = Math.round(255 * a * Math.min(.9, (light / 255) ** .72) * (.65 + .35 * blend));
        for (let dy = 0; dy < dot; dy++) for (let dx = 0; dx < dot; dx++) {
            output.set([r, g, b, alpha], ((y * pitch + dy) * width + x * pitch + dx) * 4);
        }
    }
    return output;
}
