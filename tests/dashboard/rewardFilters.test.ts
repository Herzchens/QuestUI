import assert from "node:assert/strict";

import {
    COLLECTIBLE_REWARD_KINDS,
    REWARD_DETAIL_KINDS,
    dashboardRewardKindsForPreset,
    legacyDashboardRewardSelection,
    normalizeDashboardRewardPreset,
    parseDashboardRewardKinds,
    serializeDashboardRewardKinds
} from "../../src/quests/rewardFilters";

assert.equal(normalizeDashboardRewardPreset("bogus"), "all");
assert.equal(normalizeDashboardRewardPreset("custom"), "custom");

assert.deepEqual(dashboardRewardKindsForPreset("all", ""), [...REWARD_DETAIL_KINDS]);
assert.deepEqual(dashboardRewardKindsForPreset("orbs", "reward-code"), ["orbs"]);
assert.deepEqual(dashboardRewardKindsForPreset("collectible", "orbs"), [...COLLECTIBLE_REWARD_KINDS]);
assert.deepEqual(dashboardRewardKindsForPreset("in-game", "orbs"), ["in-game"]);

const custom = ["orbs", "profile-frame", "reward-code"] as const;
const serialized = serializeDashboardRewardKinds(custom);
assert.equal(serialized, "orbs,profile-frame,reward-code");
assert.deepEqual(parseDashboardRewardKinds(serialized), [...custom]);
assert.deepEqual(
    dashboardRewardKindsForPreset("custom", "reward-code,orbs,reward-code,invalid"),
    ["orbs", "reward-code"]
);

assert.deepEqual(legacyDashboardRewardSelection("orbs").preset, "orbs");
assert.deepEqual(legacyDashboardRewardSelection("in-game").preset, "in-game");
assert.deepEqual(
    legacyDashboardRewardSelection("non-orbs").customKinds,
    REWARD_DETAIL_KINDS.filter(kind => kind !== "orbs")
);
assert.deepEqual(legacyDashboardRewardSelection("profile-effect"), {
    preset: "custom",
    customKinds: ["profile-effect"]
});

console.log("Dashboard reward filter logic tests passed.");
