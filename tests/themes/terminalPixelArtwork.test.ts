import assert from "node:assert/strict";
import { createArtworkQueue } from "../../src/themes/terminal/artworkQueue";
import { terminalProgressPixels, TERMINAL_PROGRESS_OUTLINE, TERMINAL_CLAIMED_GLYPH, TERMINAL_EXPIRED_GLYPH } from "../../src/themes/terminal/progressShape";
import { rasterTerminalPanorama, TERMINAL_PANORAMA } from "../../src/themes/terminal/panoramaRaster";
import { parseTerminalArtworkKey, pixelateTerminalArtwork, terminalArtworkAccent, terminalArtworkKey, TERMINAL_ARTWORK_SIZES, TERMINAL_PALETTE_LIMIT } from "../../src/themes/terminal/pixelArtwork";

assert.equal(terminalProgressPixels(0), "");
assert.equal(terminalProgressPixels(NaN), "");
assert.equal(terminalProgressPixels(100), TERMINAL_PROGRESS_OUTLINE);
assert.equal(terminalProgressPixels(150), TERMINAL_PROGRESS_OUTLINE);
const ringCells = (path: string) => path.split("M").filter(Boolean);
const full = new Set(ringCells(TERMINAL_PROGRESS_OUTLINE));
assert.ok(full.size > 100);
let last = new Set<string>();
for (const percent of [1, 25, 50, 75, 99, 100]) {
    const cells = new Set(ringCells(terminalProgressPixels(percent)));
    assert.ok([...cells].every(cell => full.has(cell)) && [...last].every(cell => cells.has(cell)));
    assert.ok(cells.size >= last.size);
    last = cells;
}
assert.notEqual(TERMINAL_CLAIMED_GLYPH, TERMINAL_EXPIRED_GLYPH);
assert.deepEqual(TERMINAL_ARTWORK_SIZES, { dashboard: 56, notification: 48 });
const source = "https://cdn.discordapp.com/quests/test/icon.png";
const dashboardKey = terminalArtworkKey(source, TERMINAL_ARTWORK_SIZES.dashboard);
const notificationKey = terminalArtworkKey(source, TERMINAL_ARTWORK_SIZES.notification);
assert.notEqual(dashboardKey, notificationKey);
assert.deepEqual(parseTerminalArtworkKey(dashboardKey), { size: 56, url: source });
assert.deepEqual(parseTerminalArtworkKey(notificationKey), { size: 48, url: source });
assert.equal(TERMINAL_PALETTE_LIMIT, 24);
assert.notEqual(dashboardKey, terminalArtworkKey(source, 28));
assert.notEqual(notificationKey, terminalArtworkKey(source, 24));
assert.equal(parseTerminalArtworkKey("65:" + source), null);
assert.equal(parseTerminalArtworkKey("invalid"), null);
const solid = new Uint8ClampedArray([255, 180, 10, 255, 255, 180, 10, 255, 255, 180, 10, 96, 255, 255, 255, 0]);
const before = solid.slice();
const accent = terminalArtworkAccent(solid);
assert.ok(accent && /^#[0-9a-f]{6}$/.test(accent));
assert.ok(parseInt(accent.slice(1, 3), 16) > parseInt(accent.slice(3, 5), 16) && parseInt(accent.slice(3, 5), 16) > parseInt(accent.slice(5, 7), 16), "warm artwork retains its hue");
assert.equal(terminalArtworkAccent(new Uint8ClampedArray([0, 0, 0, 0])), null);
assert.equal(terminalArtworkAccent(new Uint8ClampedArray([120, 120, 120, 255])), "neutral");
assert.equal(terminalArtworkAccent(solid), accent);
assert.deepEqual(solid, before);
const tile = pixelateTerminalArtwork(solid, 2, 2);
assert.deepEqual(solid, before);
assert.deepEqual([...tile.slice(0, 3)], [...tile.slice(4, 7)]);
assert.ok(tile[0] > tile[1] && tile[1] > tile[2], "warm hue must survive");
assert.equal(tile[11], 96);
assert.deepEqual([...tile.slice(12)], [0, 0, 0, 0]);
const side = TERMINAL_ARTWORK_SIZES.dashboard;
const gradient = new Uint8ClampedArray(side * side * 4);
for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) gradient.set([Math.round(x * 255 / (side - 1)), Math.round(y * 255 / (side - 1)), Math.round((x + y) * 255 / (2 * (side - 1))), 255], (y * side + x) * 4);
}
const quantized = pixelateTerminalArtwork(gradient, side, side);
assert.deepEqual(quantized, pixelateTerminalArtwork(gradient, side, side));
const colors = new Set<string>();
for (let i = 0; i < quantized.length; i += 4) {
    colors.add(quantized.slice(i, i + 3).join(","));
    assert.equal(quantized[i + 3], 255);
}
assert.ok(colors.size <= TERMINAL_PALETTE_LIMIT && colors.size >= 8);
// Hard high-contrast boundaries must remain uniform, with no dither along edges.
const stripes = new Uint8ClampedArray(8 * 4 * 4);
for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
    const v = x < 4 ? 20 : 225;
    stripes.set([v, v, v, 255], (y * 8 + x) * 4);
}
const edged = pixelateTerminalArtwork(stripes, 8, 4, 2);
for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
    const i = (y * 8 + x) * 4;
    assert.deepEqual([...edged.slice(i, i + 4)], [...edged.slice(x < 4 ? 0 : 16, x < 4 ? 4 : 20)]);
}
assert.ok(edged[16] - edged[0] > 150);
// Both active high-fidelity presets are within the engine's processing budget.
for (const size of Object.values(TERMINAL_ARTWORK_SIZES)) {
    const input = new Uint8ClampedArray(size * size * 4);
    input.fill(255);
    assert.equal(pixelateTerminalArtwork(input, size, size).length, input.length);
}
const grayscale = pixelateTerminalArtwork(new Uint8ClampedArray([40, 40, 40, 255, 220, 220, 220, 255]), 2, 1);
for (let i = 0; i < grayscale.length; i += 4) {
    assert.equal(grayscale[i], grayscale[i + 1]);
    assert.equal(grayscale[i], grayscale[i + 2]);
}
const dark = pixelateTerminalArtwork(new Uint8ClampedArray([0, 0, 0, 255, 30, 30, 30, 255, 60, 60, 60, 255, 90, 90, 90, 255]), 4, 1);
assert.deepEqual([...dark.slice(0, 4)], [0, 0, 0, 255], "black must stay black");
assert.ok(dark[8] > 60 && dark[12] > 90, "underexposed detail must become visible");
assert.deepEqual(pixelateTerminalArtwork(new Uint8ClampedArray(16), 2, 2), new Uint8ClampedArray(16));
assert.throws(() => pixelateTerminalArtwork(new Uint8ClampedArray(4), 2, 2), RangeError);
assert.throws(() => pixelateTerminalArtwork(new Uint8ClampedArray(65 * 4), 65, 1), RangeError);
assert.throws(() => pixelateTerminalArtwork(new Uint8ClampedArray(4), 1, 1, 1), RangeError);
const { columns, rows, pitch, dot } = TERMINAL_PANORAMA;
const panoramaInput = new Uint8ClampedArray(side * side * 4);
for (let i = 0; i < panoramaInput.length; i += 4) panoramaInput.set([230, 120, 30, 255], i);
const panoramaBefore = panoramaInput.slice();
const panorama = rasterTerminalPanorama(panoramaInput);
assert.deepEqual(panoramaInput, panoramaBefore);
assert.deepEqual(panorama, rasterTerminalPanorama(panoramaInput));
assert.equal(panorama.length, columns * rows * pitch * pitch * 4);
assert.ok(panorama[0] > panorama[1] && panorama[1] > panorama[2] && panorama[3] > 0);
assert.equal(panorama[dot * 4 + 3], 0, "horizontal phosphor gap");
assert.equal(panorama[dot * columns * pitch * 4 + 3], 0, "vertical phosphor gap");
assert.ok(rasterTerminalPanorama(new Uint8ClampedArray(side * side * 4)).every(value => value === 0));
assert.throws(() => rasterTerminalPanorama(new Uint8ClampedArray(4)), RangeError);
async function testQueue() {
    const pending = new Map<string, { finish: (value: string | null) => void; signal: AbortSignal; }>();
    let clock = 0, calls = 0;
    const queue = createArtworkQueue((url, signal) => {
        calls++;
        return new Promise(resolve => {
            pending.set(url, { finish: resolve, signal });
            signal.addEventListener("abort", () => resolve(null), { once: true });
        });
    }, 1, 2, () => clock);
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    const a = queue.acquire("a"), shared = queue.acquire("a"), b = queue.acquire("b");
    const overflow = queue.acquire("c");
    assert.equal(await overflow.promise, null);
    await flush();
    assert.equal(calls, 1);
    a.release();
    assert.equal(pending.get("a")!.signal.aborted, false);
    b.release();
    assert.equal(await b.promise, null);
    pending.get("a")!.finish("pixel-a");
    assert.equal(await shared.promise, "pixel-a");
    await flush();
    assert.equal(await queue.acquire("a").promise, "pixel-a");
    assert.equal(calls, 1);
    shared.release();
    const failure = queue.acquire("failure");
    await flush();
    pending.get("failure")!.finish(null);
    assert.equal(await failure.promise, null);
    await flush();
    assert.equal(await queue.acquire("failure").promise, null);
    clock = 31_000;
    const retry = queue.acquire("failure");
    await flush();
    assert.equal(calls, 3);
    retry.release();
    assert.equal(await retry.promise, null);
    await flush();
    assert.equal(pending.get("failure")!.signal.aborted, true);
    assert.equal(queue.peek("failure"), undefined);
    const separate = createArtworkQueue(async key => key, 2, 4);
    const [dashboardRaster, notificationRaster] = await Promise.all([
        separate.acquire(dashboardKey).promise, separate.acquire(notificationKey).promise
    ]);
    assert.equal(dashboardRaster, dashboardKey);
    assert.equal(notificationRaster, notificationKey);
    assert.equal(separate.peek(dashboardKey), dashboardKey);
    assert.equal(separate.peek(notificationKey), notificationKey);
    console.log("Terminal pixel artwork and queue tests passed");
}
void testQueue().catch(error => { console.error(error); process.exitCode = 1; });
