import { ORIGAMI_ANIMALS, origamiScene, normalizeOrigamiProgress } from "../../src/themes/origami/scene";
import { dominantThumbnailColor } from "../../src/themes/origami/thumbnailColor";
import { ornamentVariantSequence, SAKURA_ORNAMENT_COUNT } from "../../src/themes/sakura/ornament";
import assert from "node:assert/strict";
import { createDashboardThemeController } from "../../src/themes/controller";
import { dominantArtworkColor, fractureVariant, fractureVariantSequence } from "../../src/themes/obsidian/fracture";
import { OBSIDIAN_FRACTURE_VARIANT_COUNT } from "../../src/themes/obsidian/fractureVariantCount";

const themes = [
    { id: "default", label: "Default", styles: ["default/a", "default/b"] },
    { id: "fixture", label: "Fixture", styles: ["fixture/a", "fixture/b"] }
];
const enabled = new Set<string>();
const operations: string[] = [];
let fail: string | null = null;
const controller = createDashboardThemeController(themes, "default", {
    validate: style => assert.ok(themes.some(theme => theme.styles.includes(style))),
    enable: style => {
        if (style === fail) throw new Error("fixture enable failure");
        assert.ok(!enabled.has(style));
        assert.ok([...enabled].every(value => value.split("/")[0] === style.split("/")[0]));
        enabled.add(style);
        operations.push("+" + style);
    },
    disable: style => { enabled.delete(style); operations.push("-" + style); }
});
let changes = 0;
const unsubscribe = controller.subscribe(() => changes++);
assert.equal(controller.getSnapshot(), "default");
assert.equal(controller.select("removed-theme"), "default");
assert.deepEqual([...enabled], ["default/a", "default/b"]);
assert.equal(controller.select("default"), "default");
assert.equal(operations.length, 2);
assert.equal(changes, 1);
assert.equal(controller.select("fixture"), "fixture");
assert.deepEqual([...enabled], ["fixture/a", "fixture/b"]);
assert.deepEqual(operations.slice(2), ["-default/b", "-default/a", "+fixture/a", "+fixture/b"]);
assert.equal(controller.getSnapshot(), "fixture");
assert.equal(controller.select("default"), "default");
fail = "fixture/b";
assert.throws(() => controller.select("fixture"), /fixture enable failure/);
assert.equal(controller.getSnapshot(), "default");
assert.deepEqual([...enabled], ["default/a", "default/b"]);
fail = null;
controller.stop();
assert.equal(enabled.size, 0);
controller.stop();
assert.equal(controller.select("fixture"), "fixture");
assert.deepEqual([...enabled], ["fixture/a", "fixture/b"]);
controller.stop();
unsubscribe();
assert.throws(() => createDashboardThemeController([
    ...themes, { id: "duplicate", label: "Duplicate", styles: ["default/a"] }
], "default", { validate() {}, enable() {}, disable() {} }), /multiple owners/);
const ids = Array.from({ length: 100 }, (_, index) => String(123456789012345000n + BigInt(index)));
const variants = ids.map(fractureVariant);
assert.equal(OBSIDIAN_FRACTURE_VARIANT_COUNT, 10);
assert.deepEqual([...new Set(variants)].sort((a, b) => a - b), Array.from({ length: OBSIDIAN_FRACTURE_VARIANT_COUNT }, (_, index) => index));
assert.deepEqual(ids.map(fractureVariant), variants);

// Every sliding window of five displayed cards must have distinct materials.
function assertFractureSequence(orderedIds: readonly string[]) {
    const assigned = fractureVariantSequence(orderedIds);
    assert.equal(assigned.length, orderedIds.length);
    assert.deepEqual(fractureVariantSequence(orderedIds), assigned);
    for (let index = 0; index < assigned.length; index++) {
        assert.ok(Number.isInteger(assigned[index]));
        assert.ok(assigned[index] >= 0 && assigned[index] < OBSIDIAN_FRACTURE_VARIANT_COUNT);
        assert.ok(!assigned.slice(Math.max(0, index - 4), index).includes(assigned[index]));
    }
}
assertFractureSequence([]);
assertFractureSequence(ids.slice(0, 1));
assertFractureSequence(ids.slice(0, 4));
assertFractureSequence(ids);
assertFractureSequence([...ids].reverse());
assertFractureSequence(ids.filter((_, index) => index % 3 === 0));
const collidingIds = ids.filter(id => fractureVariant(id) === 9);
assert.ok(collidingIds.length >= 6);
assertFractureSequence(collidingIds);
assert.deepEqual(fractureVariantSequence(collidingIds.slice(0, 6)), [9, 0, 1, 2, 3, 9]);
assert.equal(dominantArtworkColor([]), null);
assert.equal(dominantArtworkColor([255, 0, 0, 0, 0, 0, 0, 255]), null);
assert.deepEqual(dominantArtworkColor([230, 150, 40, 255, 230, 150, 40, 255, 40, 70, 200, 255]), [230, 150, 40]);
assert.deepEqual(dominantArtworkColor([100, 100, 100, 255]), [100, 100, 100]);
const sakuraAssigned = ornamentVariantSequence(ids);
assert.deepEqual(sakuraAssigned, ornamentVariantSequence(ids));
assert.equal(SAKURA_ORNAMENT_COUNT, 10);
for (const order of [ids, [...ids].reverse(), ids.filter((_, i) => i % 3 === 0), Array(30).fill("collision")]) {
    const sequence = ornamentVariantSequence(order);
    for (let i = 0; i < sequence.length; i++) {
        assert.ok(sequence[i] >= 0 && sequence[i] < SAKURA_ORNAMENT_COUNT);
        assert.ok(!sequence.slice(Math.max(0, i - (SAKURA_ORNAMENT_COUNT - 1)), i).includes(sequence[i]));
    }
}
const origamiIds = Array.from({ length: 64 }, (_, i) => String(i));
assert.equal(new Set(origamiIds.map(origamiScene)).size, 10);
assert.equal(new Set(ORIGAMI_ANIMALS).size, 10);
assert.deepEqual(origamiIds.map(origamiScene), origamiIds.map(id => origamiScene(id)));
console.log("QuestUI Dashboard theme lifecycle and material assignment tests - PASS");

assert.deepEqual([...origamiIds].reverse().map(origamiScene).reverse(), origamiIds.map(origamiScene));
assert.deepEqual(origamiIds.filter((_, i) => i % 3 === 0).map(origamiScene), origamiIds.map(origamiScene).filter((_, i) => i % 3 === 0));

assert.equal(normalizeOrigamiProgress(0), 0);
assert.equal(normalizeOrigamiProgress(50.125), 50.125);
assert.equal(normalizeOrigamiProgress(100), 100);
assert.equal(normalizeOrigamiProgress(Infinity), 0);
assert.equal(normalizeOrigamiProgress(-1), 0);
assert.equal(normalizeOrigamiProgress(1000), 100);

const pixels = (...groups: [number, number, number, number, number][]) => Uint8Array.from(groups.flatMap(([r, g, b, a, n]) => Array.from({ length: n }, () => [r, g, b, a]).flat()));
assert.deepEqual(dominantThumbnailColor(pixels([0, 0, 0, 255, 60], [255, 30, 30, 255, 40])), [255, 30, 30]);
assert.deepEqual(dominantThumbnailColor(pixels([255, 255, 255, 255, 55], [0, 90, 230, 255, 45])), [0, 90, 230]);
assert.deepEqual(dominantThumbnailColor(pixels([22, 120, 85, 255, 45], [230, 40, 20, 0, 100], [240, 220, 180, 255, 15])), [22, 120, 85]);
assert.deepEqual(dominantThumbnailColor(pixels([120, 20, 25, 255, 25], [128, 22, 25, 255, 30], [30, 80, 200, 255, 45])), [124, 21, 25]);
assert.deepEqual(dominantThumbnailColor(pixels([15, 70, 85, 255, 35], [225, 45, 50, 100, 65])), [15, 70, 85]);
assert.equal(dominantThumbnailColor(pixels([0, 0, 0, 255, 50], [255, 255, 255, 255, 50], [130, 135, 140, 255, 40])), null);
assert.deepEqual(dominantThumbnailColor(pixels([250, 247, 245, 255, 80], [23, 25, 29, 255, 80], [15, 30, 75, 255, 10], [235, 100, 20, 255, 15])), [235, 100, 20]);
assert.deepEqual(dominantThumbnailColor(pixels([243, 205, 192, 255, 20])), [243, 205, 192]);
assert.equal(dominantThumbnailColor(pixels([255, 0, 0, 0, 100])), null);
assert.equal(dominantThumbnailColor([]), null);
assert.deepEqual(dominantThumbnailColor(pixels([10, 30, 70, 255, 10], [220, 100, 30, 255, 10])), dominantThumbnailColor(pixels([220, 100, 30, 255, 10], [10, 30, 70, 255, 10])));
