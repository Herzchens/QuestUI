import assert from "node:assert/strict";

import {
    DEFAULT_QUEST_AUTO_RELOAD_MINUTES,
    DEFAULT_QUEST_AUTO_RELOAD_STEP,
    nextQuestAutoReloadDelay,
    normalizeQuestAutoReloadMinutes,
    normalizeQuestAutoReloadStep,
    questAutoReloadMarkerLabel,
    questAutoReloadMinutesFromStep,
    QUEST_AUTO_RELOAD_MINUTES
} from "../../src/quests/reload/autoLogic";

assert.deepEqual([...QUEST_AUTO_RELOAD_MINUTES], [10, 20, 30, 60, 120, 240, 300, 720, 1440]);
assert.equal(DEFAULT_QUEST_AUTO_RELOAD_MINUTES, 300);
assert.equal(DEFAULT_QUEST_AUTO_RELOAD_STEP, 6);
assert.equal(normalizeQuestAutoReloadStep(999), 6);
assert.equal(questAutoReloadMinutesFromStep(0), 10);
assert.equal(questAutoReloadMinutesFromStep(6), 300);
assert.equal(questAutoReloadMinutesFromStep(8), 1440);
assert.equal(questAutoReloadMarkerLabel(0), "10m");
assert.equal(questAutoReloadMarkerLabel(1), "20m");
assert.equal(questAutoReloadMarkerLabel(2), "30m");
assert.equal(questAutoReloadMarkerLabel(3), "1h");
assert.equal(questAutoReloadMarkerLabel(4), "2h");
assert.equal(questAutoReloadMarkerLabel(5), "4h");
assert.equal(questAutoReloadMarkerLabel(6), "5h");
assert.equal(questAutoReloadMarkerLabel(7), "12h");
assert.equal(questAutoReloadMarkerLabel(8), "24h");
assert.equal(normalizeQuestAutoReloadMinutes(999), 300);

const minute = 60 * 1000;
assert.equal(nextQuestAutoReloadDelay(null, null, 1_000, 300), 0);
assert.equal(nextQuestAutoReloadDelay(1_000, null, 1_000 + 299 * minute, 300), minute);
assert.equal(nextQuestAutoReloadDelay(1_000, null, 1_000 + 300 * minute, 300), 0);
assert.equal(nextQuestAutoReloadDelay(1_000, 1_000 + 100 * minute, 1_000 + 200 * minute, 300), 200 * minute);
assert.equal(nextQuestAutoReloadDelay(null, 1_000, 1_000 + 9 * minute, 10), minute);
assert.equal(nextQuestAutoReloadDelay(null, 1_000, 1_000 + 10 * minute, 10), 0);

console.log("QuestUI background Quest reload scheduling tests — PASS");
