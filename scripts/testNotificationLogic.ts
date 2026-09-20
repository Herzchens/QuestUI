import assert from "node:assert/strict";

import {
    completedQuestTransitions,
    isActionableProblemEvent,
    newAvailableQuestTransitions,
    problemNotificationKey,
    type QuestNotificationSnapshot
} from "../notificationLogic";

const quest = (
    id: string,
    status: QuestNotificationSnapshot["status"],
    name = `Quest ${id}`,
    rewardLabel = "100 Orbs"
): QuestNotificationSnapshot => ({ id, status, name, rewardLabel });

assert.deepEqual(
    completedQuestTransitions(
        [quest("a", "in-progress"), quest("b", "claimable"), quest("c", "available")],
        [quest("a", "claimable"), quest("b", "claimable"), quest("c", "in-progress")]
    ),
    [{ questId: "a", questName: "Quest a", rewardLabel: "100 Orbs" }]
);
assert.deepEqual(completedQuestTransitions([], [quest("a", "claimable")]), []);
assert.deepEqual(completedQuestTransitions([quest("a", "claimable")], [quest("a", "claimed")]), []);

assert.deepEqual(
    newAvailableQuestTransitions(
        new Set(["a", "b"]),
        [quest("a", "available"), quest("b", "claimable"), quest("c", "available"), quest("d", "in-progress")]
    ),
    [{ questId: "c", questName: "Quest c", rewardLabel: "100 Orbs" }]
);
assert.deepEqual(newAvailableQuestTransitions(new Set(), [quest("a", "claimable")]), []);
assert.deepEqual(newAvailableQuestTransitions(new Set(["a"]), [quest("a", "available")]), []);
assert.deepEqual(newAvailableQuestTransitions(new Set(["a"]), [quest("a", "expired"), quest("b", "claimed")]), []);

assert.equal(isActionableProblemEvent({ severity: "error", detail: null }), true);
assert.equal(isActionableProblemEvent({ severity: "warning", detail: { terminal: true } }), true);
assert.equal(isActionableProblemEvent({ severity: "warning", detail: { terminal: false } }), false);
assert.equal(isActionableProblemEvent({ severity: "warning", detail: { retryable: true } }), false);
assert.equal(isActionableProblemEvent({ severity: "info", detail: null }), false);

const keyA = problemNotificationKey({
    source: "orion",
    eventCode: "ORION_TASK_FAILED",
    summary: "Quest failed",
    quest: { id: "q1" }
});
const keyB = problemNotificationKey({
    source: "orion",
    eventCode: "ORION_TASK_FAILED",
    summary: "Quest failed",
    quest: { id: "q1" }
});
const keyC = problemNotificationKey({
    source: "orion",
    eventCode: "ORION_TASK_FAILED",
    summary: "Different failure",
    quest: { id: "q1" }
});
assert.equal(keyA, keyB);
assert.notEqual(keyA, keyC);

console.log("QuestUI notification logic tests — PASS");
