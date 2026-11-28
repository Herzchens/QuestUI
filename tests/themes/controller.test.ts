import { createThemeSDK } from "../../src/themes/sdk";
import { createThemeRendering } from "../../src/themes/rendering";
import { graphicsQualityPolicy } from "../../src/graphics/policy";
import { createArtworkColorPool } from "../../src/themes/artworkColorPool";
import { ORIGAMI_ANIMALS, origamiScene, normalizeOrigamiProgress } from "../../src/themes/origami/scene";
import { dominantThumbnailColor, dominantThumbnailColorAsync } from "../../src/themes/origami/thumbnailColor";
import { ornamentVariantSequence, SAKURA_ORNAMENT_COUNT } from "../../src/themes/sakura/ornament";
import assert from "node:assert/strict";
import { createDashboardThemeController } from "../../src/themes/controller";
import { createServiceLifecycle } from "../../src/plugin/lifecycle";
import { createThemePluginLifecycle } from "../../src/themes/lifecycle";
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
const obsidianPixels = (groups: readonly (readonly [number, readonly number[]])[]) =>
    groups.flatMap(([count, pixel]) => Array.from({ length: count }, () => pixel).flat());
const pastelArtwork = obsidianPixels([[420, [241, 240, 242, 255]], [100, [249, 218, 233, 255]], [56, [252, 251, 251, 255]]]);
assert.deepEqual(dominantArtworkColor(pastelArtwork), [249, 218, 233]);
const pastelShades = obsidianPixels([[160, [248, 214, 230, 255]], [160, [240, 205, 222, 255]], [200, [220, 40, 45, 255]], [56, [240, 240, 240, 255]]]);
assert.deepEqual(dominantArtworkColor(pastelShades), [244, 210, 226]);
assert.deepEqual(dominantArtworkColor(obsidianPixels([[20, [230, 231, 230, 255]], [1, [250, 215, 230, 0]]])), [230, 231, 230]);
assert.equal(dominantArtworkColor(obsidianPixels([[10, [255, 255, 255, 255]], [10, [0, 0, 0, 255]]])), null);
assert.deepEqual(dominantArtworkColor(obsidianPixels([[2, [240, 190, 214, 255]], [2, [40, 160, 210, 255]]])), dominantArtworkColor(obsidianPixels([[2, [40, 160, 210, 255]], [2, [240, 190, 214, 255]]])));

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

// Failure after partial startup must still dispose every acquired service.
{
    const calls: string[] = [];
    let fail = true;
    const lifecycle = createServiceLifecycle([
        { start: () => { calls.push("+a"); }, stop: () => { calls.push("-a"); } },
        { start: () => { calls.push("+b"); if (fail) throw new Error("start"); }, stop: () => { calls.push("-b"); } }
    ]);
    assert.throws(lifecycle.start, /start/);
    assert.deepEqual(calls, ["+a", "+b", "-b", "-a"]);
    fail = false;
    lifecycle.start(); lifecycle.start(); lifecycle.stop(); lifecycle.stop();
    assert.deepEqual(calls, ["+a", "+b", "-b", "-a", "+a", "+b", "-b", "-a"]);
}
{
    const calls: string[] = [];
    let fail = true;
    const lifecycle = createServiceLifecycle([
        { start() {}, stop: () => { calls.push("a"); } },
        { start() {}, stop: () => { calls.push("b"); if (fail) throw new Error("stop"); } }
    ]);
    lifecycle.start();
    assert.throws(lifecycle.stop, /cleanup failed/);
    assert.deepEqual(calls, ["b", "a"]);
    fail = false;
    lifecycle.stop();
    assert.deepEqual(calls, ["b", "a", "b"]);
}
{
    const owned = new Set<string>();
    let fail = true;
    const fixture = createDashboardThemeController(themes, "default", {
        validate() {}, enable: style => { assert.ok(!owned.has(style)); owned.add(style); },
        disable: style => { if (fail && style === "default/a") throw new Error("disable"); owned.delete(style); }
    });
    fixture.select("default");
    assert.throws(() => fixture.select("fixture"), /transition and recovery failed/);
    assert.deepEqual([...owned], ["default/a"]);
    fail = false;
    fixture.select("fixture");
    assert.deepEqual([...owned], ["fixture/a", "fixture/b"]);
    fixture.stop();
    assert.equal(owned.size, 0);
}

async function testArtworkOwnership() {
    let started = 0;
    let active = 0;
    const pool = createArtworkColorPool<string>((url, signal) => new Promise(resolve => {
        started++;
        active++;
        signal.addEventListener("abort", () => { active--; resolve(null); }, { once: true });
    }));
    const owner = {};
    const urls = Array.from({ length: 1000 }, (_, i) => String(i));
    pool.replaceCatalogue(owner, urls);
    const visible = pool.acquire("0");
    await Promise.resolve();
    assert.equal(started, 4);
    pool.replaceCatalogue(owner, []);
    assert.equal(active, 1);
    visible.release();
    visible.release();
    assert.equal(await visible.promise, null);
    assert.equal(active, 0);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(started, 4);
    const a = {}, b = {};
    pool.replaceCatalogue(a, ["shared"]);
    pool.replaceCatalogue(b, ["shared"]);
    await Promise.resolve();
    assert.equal(active, 1);
    pool.replaceCatalogue(a, []);
    assert.equal(active, 1);
    pool.replaceCatalogue(b, []);
    assert.equal(active, 0);
}
void testArtworkOwnership().catch(error => { console.error(error); process.exitCode = 1; });

{
    const calls: string[] = [];
    const lifecycle = createServiceLifecycle([
        { start() { calls.push("+a"); lifecycle.stop(); }, stop() { calls.push("-a"); } },
        { start() { calls.push("+b"); }, stop() { calls.push("-b"); } }
    ]);
    lifecycle.start();
    assert.deepEqual(calls, ["+a", "-a"]);
}

void (async () => {
    const sample = new Uint8ClampedArray(64 * 64 * 4);
    let seed = 0x45be;
    for (let i = 0; i < sample.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        sample[i] = seed >>> 24;
    }
    assert.deepEqual(await dominantThumbnailColorAsync(sample, () => false), dominantThumbnailColor(sample));
    assert.equal(await dominantThumbnailColorAsync(sample, () => true), null);
    let checks = 0;
    assert.equal(await dominantThumbnailColorAsync(sample, () => ++checks > 3), null);
})().catch(error => { console.error(error); process.exitCode = 1; });

void (async () => {
    const started: string[] = [];
    const resolvers = new Map<string, (color: string) => void>();
    const pool = createArtworkColorPool<string>(url => new Promise(resolve => {
        started.push(url);
        resolvers.set(url, resolve);
    }), 2, 1);
    const owner = {};
    pool.replaceCatalogue(owner, ["a", "b", "c", "d"]);
    await Promise.resolve();
    const visible = pool.acquire("d");
    resolvers.get("a")!("a");
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.deepEqual(started, ["a", "d"]);
    resolvers.get("d")!("d");
    assert.equal(await visible.promise, "d");
    visible.release();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.deepEqual(started, ["a", "d", "b"]);
    resolvers.get("b")!("b");
    for (let i = 0; i < 12; i++) await Promise.resolve();
    pool.replaceCatalogue(owner, ["a", "b", "c", "d"]);
    assert.equal(pool.peek("c"), undefined);
    assert.equal(pool.peek("d"), undefined);
    assert.deepEqual(started, ["a", "d", "b"]);
    pool.replaceCatalogue(owner, []);
})().catch(error => { console.error(error); process.exitCode = 1; });

{
    const calls: string[] = [];
    let failStart = false, failStop = false, failSelection = false;
    const session = createThemePluginLifecycle({
        select(value) {
            calls.push("select:" + value);
            if (failSelection && value === "fixture") throw new Error("selection");
            return String(value);
        },
        stop() { calls.push("styles:stop"); }
    }, [
        { id: "default", label: "Default", styles: ["default"], services: [
            { start() { calls.push("+a"); }, stop() { calls.push("-a"); } }
        ] },
        { id: "fixture", label: "Fixture", styles: ["fixture"], services: [
            { start() { calls.push("+b"); if (failStart) throw new Error("start"); },
              stop() { calls.push("-b"); if (failStop) throw new Error("stop"); } }
        ] }
    ], "default", () => calls.push("fallback"));
    assert.throws(() => session.select("fixture"), /not started/);
    session.start("default");
    session.start("fixture");
    session.select("fixture");
    assert.deepEqual(calls, ["select:default", "+a", "+b", "select:fixture"]);
    session.stop();
    session.stop();
    assert.deepEqual(calls.slice(4), ["-b", "-a", "styles:stop"]);
    calls.length = 0;
    failStart = true;
    assert.throws(() => session.start("default"), /start/);
    assert.deepEqual(calls, ["select:default", "+a", "+b", "-b", "-a", "styles:stop"]);
    assert.throws(() => session.select("default"), /not started/);
    calls.length = 0;
    failStart = false;
    failSelection = true;
    session.start("fixture");
    assert.deepEqual(calls, ["select:fixture", "select:default", "fallback", "+a", "+b"]);
    failStop = true;
    assert.throws(session.stop, /cleanup failed/);
    assert.deepEqual(calls.slice(5), ["-b", "-a", "styles:stop"]);
    failStop = false;
    session.stop();
    assert.equal(calls.at(-1), "-b");
}

{
    const enabled = new Set<string>();
    const controller = createDashboardThemeController(themes, "default", {
        validate(style) { if (style === "invalid") throw new Error("invalid style"); },
        enable(style) { enabled.add(style); },
        disable(style) { enabled.delete(style); }
    });
    const initial = controller.getCatalogue();
    assert.equal(initial, controller.getCatalogue());
    controller.select("default");
    assert.equal(initial, controller.getCatalogue());
    const styles = ["custom/a"];
    const remove = controller.registerTheme({ id: "custom-fixture", label: "Custom", styles });
    styles[0] = "tampered";
    assert.notEqual(initial, controller.getCatalogue());
    assert.equal(controller.getCatalogue().at(-1)?.value, "custom-fixture");
    assert.throws(() => controller.registerTheme({ id: "default", label: "Duplicate", styles: ["custom/b"] }), /Invalid or duplicate/);
    assert.throws(() => controller.registerTheme({ id: "custom-other", label: "Duplicate style", styles: ["custom/a"] }), /multiple owners/);
    const beforeInvalid = controller.getCatalogue();
    assert.throws(() => controller.registerTheme({ id: "custom-bad", label: "Bad", styles: ["custom/b", "invalid"] }), /invalid style/);
    assert.equal(controller.getCatalogue(), beforeInvalid);
    controller.select("custom-fixture");
    assert.deepEqual([...enabled], ["custom/a"]);
    remove();
    assert.equal(controller.getSnapshot(), "default");
    assert.deepEqual([...enabled], ["default/a", "default/b"]);
    const removeAgain = controller.registerTheme({ id: "custom-fixture", label: "Replacement", styles: ["custom/a"] });
    remove();
    assert.equal(controller.getCatalogue().at(-1)?.label, "Replacement");
    removeAgain();
    assert.deepEqual(controller.getCatalogue(), initial);
    controller.stop();
}
{
    let fail = false;
    const controller = createDashboardThemeController(themes, "default", {
        validate() {}, enable() {},
        disable(style) { if (fail && style === "custom/a") throw new Error("cleanup"); }
    });
    const remove = controller.registerTheme({ id: "custom-fixture", label: "Custom", styles: ["custom/a"] });
    controller.select("custom-fixture");
    fail = true;
    assert.throws(remove, /transition and recovery failed/);
    assert.equal(controller.getCatalogue().at(-1)?.value, "custom-fixture");
    assert.throws(() => controller.registerTheme({ id: "custom-other", label: "Other", styles: ["custom/a"] }), /multiple owners/);
    fail = false;
    controller.select("default");
    remove();
    assert.equal(controller.getCatalogue().length, themes.length);
    controller.stop();
}

{
    const failures: unknown[] = [];
    const calls: string[] = [];
    const renderer = createThemeRendering(error => failures.push(error));
    const root = {} as HTMLElement;
    const context = { root, surface: "dashboard" as const, graphics: graphicsQualityPolicy("3"), reducedMotion: false };
    renderer.attach(() => calls.push("disabled"), context);
    renderer.start();
    const stale = renderer.attach(({ defer, signal }) => {
        defer(() => calls.push("a:" + signal.aborted));
        defer(() => calls.push("b"));
    }, context);
    const next = renderer.attach(({ defer }) => defer(() => calls.push("c")), context);
    stale();
    assert.deepEqual(calls, ["b", "a:true"]);
    next();
    next();
    assert.deepEqual(calls, ["b", "a:true", "c"]);
    renderer.attach(({ defer }) => { defer(() => calls.push("rollback")); throw new Error("mount"); }, context);
    assert.equal(calls.at(-1), "rollback");
    assert.equal(failures.length, 1);
    renderer.attach(({ defer, signal }) => {
        renderer.stop();
        assert.equal(signal.aborted, true);
        defer(() => calls.push("late"));
    }, context);
    assert.equal(calls.at(-1), "late");
    renderer.start();
    let fail = true;
    renderer.attach(({ defer }) => {
        defer(() => calls.push("other"));
        defer(() => { if (fail) throw new Error("dispose"); calls.push("retry"); });
    }, context);
    renderer.clear();
    assert.equal(calls.at(-1), "other");
    renderer.attach(() => calls.push("unsafe"), context);
    assert.ok(!calls.includes("unsafe"));
    fail = false;
    renderer.clear();
    assert.equal(calls.at(-1), "retry");
    renderer.stop();
}

{
    const enabled = new Set<string>();
    const controller = createDashboardThemeController(themes, "default", {
        validate(style) { if (style.startsWith("questui-custom-css:")) sdk.styles.validate(style); },
        enable(style) { enabled.add(style); },
        disable(style) { enabled.delete(style); }
    });
    const sdk = createThemeSDK({
        register: controller.registerTheme, catalogue: controller.getCatalogue,
        active: controller.getSnapshot, restore() {}
    }, (_, css) => css);
    const input = { apiVersion: 1 as const, id: "custom-test", label: "Test", css: ":scope { color: red; }" };
    for (const invalid of [
        null, { ...input, apiVersion: 2 }, { ...input, id: "default" },
        { ...input, id: "custom-" }, { ...input, id: "custom-foo bar" },
        { ...input, label: " " }, { ...input, css: "" }, { ...input, css: "x".repeat(262145) }
    ]) assert.throws(() => sdk.api.register(invalid as typeof input), /Invalid|unsupported/);
    const dispose = sdk.api.register(input);
    assert.throws(() => sdk.api.register(input), /already registered/);
    controller.select(input.id);
    assert.equal(sdk.api.getActiveTheme(), input.id);
    assert.deepEqual([...enabled], ["questui-custom-css:custom-test"]);
    dispose();
    assert.equal(sdk.api.getActiveTheme(), "default");
    assert.throws(() => sdk.styles.validate("questui-custom-css:custom-test"), /Unknown/);
    const dispose2 = sdk.api.register(input);
    dispose();
    assert.equal(sdk.api.getThemes().at(-1)?.value, input.id);
    dispose2();
    assert.equal(sdk.api.getThemes().length, themes.length);
}
