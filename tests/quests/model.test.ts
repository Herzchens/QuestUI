import assert from "node:assert/strict";
import { normalizeQuest, readRawQuests, filterQuests, dashboardScopeFromSettings, questStatusCounts, formatQuestProgress } from "../../src/quests/model";

const now = Date.parse("2026-11-28T00:00:00Z");
const raw = {
    id: "fixture", config: {
        messages: { questName: "Fixture Quest" },
        expiresAt: "2030-01-01T00:00:00Z",
        application: { id: "123" },
        taskConfigV2: { tasks: { WATCH_VIDEO: { target: 60 } } },
        rewardsConfig: { rewards: [{ type: 4, orbQuantity: 100, premiumOrbQuantity: 150 }] }
    },
    userStatus: { enrolledAt: "2026-11-01", progress: { WATCH_VIDEO: { value: 15 } } }
};
const stored = normalizeQuest(raw, now);
assert.equal(stored.status, "in-progress");
assert.equal(stored.progress, 25);
assert.equal(stored.reward.kind, "orbs");
assert.equal(stored.reward.boostedOrbQuantity, 150);
assert.match(formatQuestProgress(stored), /15s/);
const native = normalizeQuest(raw, now, { selectedTaskDetails: () => ({ taskType: "WATCH_VIDEO", targetSeconds: 60, progressSeconds: 30, percentComplete: 0.5 }) });
assert.equal(native.progress, 50);
assert.deepEqual(normalizeQuest(raw, now, { selectedTaskDetails() { throw Error("missing"); } }), stored);
const claimed = normalizeQuest({ ...raw, id: "claimed", userStatus: { claimedAt: "2026-11-02" } }, now);
const collectibleRaw = { ...raw, id:"collectible", config: { ...raw.config, rewardsConfig: { rewards:[{type:3,skuId:"sku"}] } } };
assert.equal(normalizeQuest(collectibleRaw, now).reward.kind, "collectible");
assert.equal(normalizeQuest(collectibleRaw, now, { productsForSku: () => [{ type: 0 }] }).reward.kind, "avatar-decoration");
assert.equal(normalizeQuest(collectibleRaw, now, { productsForSku() { throw Error("missing"); } }).reward.kind, "collectible");
assert.deepEqual(readRawQuests({ quests: new Map([[raw.id, raw]]), getQuest: () => claimed }), [claimed]);
assert.deepEqual(readRawQuests({ quests: [raw], getQuest() { throw Error("missing"); } }), [raw]);
assert.deepEqual(readRawQuests(null), []);
assert.deepEqual(filterQuests([claimed, stored], dashboardScopeFromSettings({})), [stored]);
assert.equal(questStatusCounts([claimed, stored]).claimed, 1);
console.log("Platform-neutral Quest normalization, read ports, filters and stored fallback PASS");
