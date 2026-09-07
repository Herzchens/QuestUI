import assert from "node:assert/strict";

import { normalizeDashboardSortMode, sortDashboardQuests } from "../dashboardSortLogic";

const quest = (id: string, name: string, status: any, expiresAt: number | null, orbQuantity = 0): any => ({
    id,
    name,
    status,
    expiresAt,
    reward: { kind: orbQuantity > 0 ? "orbs" : "non-orbs", orbQuantity, label: "" }
});

const sample = [
    quest("a", "Zulu", "available", 300, 200),
    quest("b", "Alpha", "in-progress", 500, 700),
    quest("c", "Beta", "claimable", 200, 0),
    quest("d", "Gamma", "expired", 100, 1000),
    quest("e", "Delta", "claimed", 150, 400)
];

assert.equal(normalizeDashboardSortMode("bogus"), "recommended");
assert.equal(normalizeDashboardSortMode("name-desc"), "name-desc");
assert.deepEqual(sortDashboardQuests(sample).map(q => q.id), ["b", "c", "a", "e", "d"]);
assert.deepEqual(sortDashboardQuests(sample, "expiring").map(q => q.id), ["c", "a", "b", "e", "d"]);
assert.deepEqual(sortDashboardQuests(sample, "name-asc").map(q => q.name), ["Alpha", "Beta", "Delta", "Gamma", "Zulu"]);
assert.deepEqual(sortDashboardQuests(sample, "name-desc").map(q => q.name), ["Zulu", "Gamma", "Delta", "Beta", "Alpha"]);
assert.deepEqual(
    sortDashboardQuests(sample, "orb-reward", q => q.id === "b" ? 840 : q.reward.orbQuantity).map(q => q.id),
    ["d", "b", "e", "a", "c"]
);

console.log("Dashboard sort logic tests passed.");
