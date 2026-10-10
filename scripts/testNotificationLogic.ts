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

const genericProblem = (severity: "info" | "warning" | "error", detail: Record<string, unknown> | null) => ({
    source: "questui" as const,
    eventCode: "QUESTUI_TEST_PROBLEM",
    severity,
    detail
});

assert.equal(isActionableProblemEvent(genericProblem("error", null)), true);
assert.equal(isActionableProblemEvent(genericProblem("warning", { terminal: true })), true);
assert.equal(isActionableProblemEvent(genericProblem("warning", { terminal: false })), false);
assert.equal(isActionableProblemEvent(genericProblem("warning", { retryable: true })), false);
assert.equal(isActionableProblemEvent(genericProblem("info", null)), false);

const real403NetworkFailure = {
    source: "orion" as const,
    eventCode: "network.failed",
    severity: "warning" as const,
    detail: {
        terminal: true,
        retryable: false,
        attempt: 1,
        maxAttempts: 1,
        httpStatus: 403,
        upstreamCode: 260000,
        reason: "User is not enrolled in the given quest"
    }
};
const real403TaskFailure = {
    source: "orion" as const,
    eventCode: "task.failed",
    severity: "error" as const,
    detail: {
        terminal: true,
        retryable: false,
        attempt: null,
        maxAttempts: null,
        httpStatus: 403,
        upstreamCode: 260000,
        reason: "Client Error 403"
    }
};
assert.equal(isActionableProblemEvent(real403NetworkFailure), false);
assert.equal(isActionableProblemEvent(real403TaskFailure), true);
assert.equal(isActionableProblemEvent({ ...real403NetworkFailure, severity: "error" }), false);

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
