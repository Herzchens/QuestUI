import assert from "node:assert/strict";

import { sameQuestShortcutSnapshot } from "../questShortcutLogic";

function quest(overrides: Partial<any> = {}) {
    return {
        id: "quest-1",
        status: "in-progress",
        expiresAt: 2_000_000_000_000,
        reward: { kind: "orbs" },
        tasks: [{ type: "video" }],
        progress: 10,
        rawQuest: { revision: 1 },
        ...overrides
    };
}

const baseline = [quest()];

assert.equal(
    sameQuestShortcutSnapshot(baseline, [quest({ progress: 80, rawQuest: { revision: 2 } })]),
    true,
    "progress/raw identity changes must not force the shortcut to re-render"
);

assert.equal(
    sameQuestShortcutSnapshot(baseline, [quest({ status: "claimable" })]),
    false,
    "status changes must update the shortcut immediately"
);

assert.equal(
    sameQuestShortcutSnapshot(baseline, [quest({ expiresAt: 2_000_000_060_000 })]),
    false,
    "expiry changes must update shortcut copy"
);

assert.equal(
    sameQuestShortcutSnapshot(baseline, [quest({ reward: { kind: "non-orbs" } })]),
    false,
    "reward-category changes must update detailed shortcut filtering"
);

assert.equal(
    sameQuestShortcutSnapshot(baseline, [quest({ tasks: [{ type: "play" }] })]),
    false,
    "task-type changes must update detailed shortcut filtering"
);

assert.equal(
    sameQuestShortcutSnapshot(baseline, [quest(), quest({ id: "quest-2" })]),
    false,
    "quest-list changes must update counts"
);

console.log("Quest shortcut snapshot logic — PASS");
