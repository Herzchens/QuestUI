import assert from "node:assert/strict";
import { parseTerminalArtworkKey, pixelateTerminalArtwork, terminalArtworkAccent, terminalArtworkKey, TERMINAL_ARTWORK_SIZES, TERMINAL_PALETTE_LIMIT } from "../../src/themes/terminal/pixelArtwork";

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
console.log("Terminal pixel artwork tests passed");
