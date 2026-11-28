import assert from "node:assert/strict";
import { readGraphicsPreference as read, writeGraphicsPreference as write, selectGraphicsQuality as select, toggleGraphicsLight as light, toggleGraphicsMotion as motion, graphicsPointerIndex as pointer, GRAPHICS_PRESETS, chooseGraphicsDetent as choose, graphicsKeyboardDetent as key, showReducedGraphicsSubtitle as subtitle } from "../../src/dashboard/graphicsLogic";

assert.deepEqual(read(undefined), { quality: 3, reduceMotion: false, light: false });
for (const invalid of ["4", "4:reduced", "", "0:foo", null, 0, "constructor"]) assert.deepEqual(read(invalid), read(undefined));
for (let q = 0; q <= 3; q++) {
    for (const reduceMotion of [true, false]) {
        const state = { quality: q, reduceMotion, light: false };
        assert.deepEqual(read(write(state)), state);
        assert.deepEqual(light(state), { quality: 0, reduceMotion: true, light: true });
        assert.deepEqual(motion(state), { ...state, reduceMotion: !reduceMotion });
        assert.deepEqual(select(state, 4), state);
        assert.deepEqual(select(light(state), q), { quality: q, reduceMotion: true, light: false });
    }
}
assert.equal(write(light(read("3"))), "light");
assert.deepEqual(light(read("light")), read("0"));
assert.equal(write(light(light(read("3:reduced")))), "0");
assert.deepEqual(motion(read("light")), read("0"));
assert.deepEqual(select(read("light"), 4), read("0:reduced"));
assert.deepEqual(select(read("light"), 0), read("0:reduced"));
assert.equal(write({ quality: 4, reduceMotion: false, light: false }), "3");
assert.deepEqual([14, 82, 150, 218, 286].map(x => pointer(x, 300)), [0,1,2,3,4]);
assert.equal(pointer(-10, 300), 0);
assert.equal(pointer(500, 300), 4);
assert.equal(pointer(5, 0), -1);
assert.equal(pointer(NaN, 300), -1);
assert.deepEqual(GRAPHICS_PRESETS.map(x => x.name), ["Low","Medium","High","Max","Ultra"]);
console.log("Graphics selector state, Light override, locked Ultra and pointer mapping: PASS");

for (const reduced of [false, true]) {
    const state = { quality: 3, reduceMotion: reduced, light: false };
    assert.deepEqual(choose(state, 4), { preference: state, preview: true });
    assert.equal(subtitle(state, true), false);
    assert.equal(subtitle(state, false), reduced);
    assert.equal(write(choose(state, 4).preference), write(state));
    assert.deepEqual(choose(state, 2), { preference: { ...state, quality: 2 }, preview: false });
}
assert.equal(subtitle(read("light"), false), false);
assert.equal(key(3, "ArrowRight"), 4);
assert.equal(key(4, "ArrowLeft"), 3);
assert.equal(key(4, "ArrowRight"), 4);
assert.equal(key(0, "End"), 4);
assert.equal(key(4, "Home"), 0);
assert.equal(key(2, "Tab"), null);
console.log("Ultra preview, subtitle and keyboard detents: PASS");

import { graphicsQualityPolicy as quality, effectiveReducedMotion as reduced, graphicsRootClasses as classes, artworkPrewarmUrls } from "../../src/graphics/policy";
import { commitGraphicsDetent as commit } from "../../src/graphics/controller";
for (const preference of ["0","1","2","3","0:reduced","1:reduced","2:reduced","3:reduced","light",undefined,"4","constructor"]) {
    const state = read(preference);
    const p = quality(preference);
    assert.equal(p.id, ["low","medium","high","max"][state.quality]);
    assert.equal(reduced(preference, false), state.reduceMotion);
    assert.equal(reduced(preference, true), true);
    assert.equal(classes(preference, false).includes("quest-ui-reduced-motion"), state.reduceMotion);
    assert.equal(classes(preference, true).length, 2);
    for (const index of [null, -1, 5, NaN, 1.5]) assert.equal(commit(state, index), state);
    assert.deepEqual(commit(state, 4), state.light ? read("0:reduced") : state);
    for (let index = 0; index < 4; index++) assert.deepEqual(commit(state, index), select(state, index));
}
assert.equal(quality("light"), quality("0"));
assert.equal(quality("3").prewarmLimit, 256);
assert.equal(quality("2").prewarmLimit, 64);
assert.equal(quality("1").prewarmLimit, 0);
assert.equal(quality("0").artworkColor, false);
assert.equal(quality("0").ambientArtwork, false);
assert.equal(quality("0").sakuraOrnaments, false);
assert.equal(quality("1").terminalPanorama, false);
assert.equal(quality("2").terminalPanorama, true);
let resolved = 0;
assert.deepEqual(artworkPrewarmUrls([null,"a","a","b","c"], value => { resolved++; return value; }, 2), ["a","b"]);
assert.equal(resolved, 4);
assert.deepEqual(artworkPrewarmUrls(["a"], () => { throw Error("disabled prewarm did work"); }, 0), []);
console.log("Applied graphics policy, locked preview, motion precedence and bounded prewarm: PASS");
