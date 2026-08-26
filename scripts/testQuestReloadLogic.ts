import assert from "node:assert/strict";

import { QUEST_RELOAD_MIN_ROTATIONS, shouldFinishReloadSpin } from "../questReloadLogic";

assert.equal(QUEST_RELOAD_MIN_ROTATIONS, 3);
assert.equal(shouldFinishReloadSpin(0, true), false);
assert.equal(shouldFinishReloadSpin(1, true), false);
assert.equal(shouldFinishReloadSpin(2, true), false);
assert.equal(shouldFinishReloadSpin(3, true), true);
assert.equal(shouldFinishReloadSpin(7, false), false);
assert.equal(shouldFinishReloadSpin(4, true), true);
assert.equal(shouldFinishReloadSpin(2.9, true), false);
assert.equal(shouldFinishReloadSpin(3.9, true), true);
assert.equal(shouldFinishReloadSpin(4, true, 5), false);
assert.equal(shouldFinishReloadSpin(5, true, 5), true);
assert.equal(shouldFinishReloadSpin(Number.NaN, true), false);
assert.equal(shouldFinishReloadSpin(3, true, Number.NaN), false);

console.log("QuestUI reload rotation tests — PASS");
