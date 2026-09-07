import assert from "node:assert/strict";

import { normalizeDashboardSortMode, requiredQuestTimeSeconds, sortDashboardQuests } from "../dashboardSortLogic";

const quest = (
    id: string,
    name: string,
    status: any,
    expiresAt: number | null,
    orbQuantity = 0,
    requiredSeconds: number | null = null,
    taskKey = "PLAY_ON_DESKTOP"
): any => ({
    id,
    name,
    status,
    expiresAt,
    reward: { kind: orbQuantity > 0 ? "orbs" : "non-orbs", orbQuantity, label: "" },
    primaryTask: requiredSeconds == null ? null : {
        key: taskKey,
        type: taskKey.startsWith("WATCH_VIDEO") ? "video" : taskKey === "PLAY_ACTIVITY" ? "activity" : "play",
        current: 0,
        target: requiredSeconds,
        hasProgress: false,
        applicationId: null
    }
});

const sample = [
    quest("a", "Zulu", "available", 300, 200, 600),
    quest("b", "Alpha", "in-progress", 500, 700, 900),
    quest("c", "Beta", "claimable", 200, 0, 319, "WATCH_VIDEO"),
    quest("d", "Gamma", "expired", 100, 1000, null),
    quest("e", "Delta", "claimed", 150, 400, 1200)
];

assert.equal(normalizeDashboardSortMode("bogus"), "recommended");
assert.equal(normalizeDashboardSortMode("required-time-desc"), "required-time-desc");
assert.deepEqual(sortDashboardQuests(sample).map(q => q.id), ["b", "c", "a", "e", "d"]);
assert.deepEqual(sortDashboardQuests(sample, "expiring").map(q => q.id), ["c", "b", "a", "e", "d"]);
assert.deepEqual(sortDashboardQuests(sample, "name-asc").map(q => q.name), ["Alpha", "Beta", "Delta", "Gamma", "Zulu"]);
assert.deepEqual(sortDashboardQuests(sample, "name-desc").map(q => q.name), ["Beta", "Alpha", "Zulu", "Gamma", "Delta"]);
assert.deepEqual(
    sortDashboardQuests(sample, "orb-reward", q => q.id === "b" ? 840 : q.reward.orbQuantity).map(q => q.id),
    ["b", "c", "d", "e", "a"]
);
assert.deepEqual(sortDashboardQuests(sample, "required-time-asc").map(q => q.id), ["c", "b", "a", "e", "d"]);
assert.deepEqual(sortDashboardQuests(sample, "required-time-desc").map(q => q.id), ["b", "c", "e", "a", "d"]);
assert.equal(requiredQuestTimeSeconds(quest("x", "Achievement", "available", 100, 0, 3, "ACHIEVEMENT_IN_ACTIVITY")), null);

console.log("Dashboard sort logic tests passed.");
