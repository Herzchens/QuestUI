import assert from "node:assert/strict";

import { QUEST_RELOAD_MIN_SPIN_MS, remainingReloadSpinMs } from "../questReloadLogic";

assert.equal(QUEST_RELOAD_MIN_SPIN_MS, 2000);
assert.equal(remainingReloadSpinMs(1000, 1000), 2000);
assert.equal(remainingReloadSpinMs(1000, 1500), 1500);
assert.equal(remainingReloadSpinMs(1000, 3000), 0);
assert.equal(remainingReloadSpinMs(1000, 5000), 0);
assert.equal(remainingReloadSpinMs(2000, 1000), 2000);
assert.equal(remainingReloadSpinMs(1000, 1500, 500), 0);
assert.equal(remainingReloadSpinMs(Number.NaN, 1500), 0);

console.log("QuestUI reload timing tests — PASS");
