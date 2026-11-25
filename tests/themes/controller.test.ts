import assert from "node:assert/strict";
import { createDashboardThemeController } from "../../src/themes/controller";
import { dominantArtworkColor, fractureVariant } from "../../src/themes/obsidian/fracture";

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
assert.equal(new Set(variants).size, 4);
assert.deepEqual(ids.map(fractureVariant), variants);
assert.equal(dominantArtworkColor([]), null);
assert.equal(dominantArtworkColor([255, 0, 0, 0, 0, 0, 0, 255]), null);
assert.deepEqual(dominantArtworkColor([230, 150, 40, 255, 230, 150, 40, 255, 40, 70, 200, 255]), [230, 150, 40]);
assert.deepEqual(dominantArtworkColor([100, 100, 100, 255]), [100, 100, 100]);
console.log("QuestUI Dashboard theme lifecycle and Obsidian fracture tests - PASS");
