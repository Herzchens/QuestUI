import assert from "node:assert/strict";

import {
    findOrionConsoleShadowMatch,
    mapOrionCategory,
    normalizeOrionCompanionEvent
} from "../orionEventLogic";

assert.equal(mapOrionCategory("task"), "quest");
assert.equal(mapOrionCategory("network"), "network");
assert.equal(mapOrionCategory("bypass"), "diagnostic");
assert.equal(mapOrionCategory("system"), "runtime");

const structured = normalizeOrionCompanionEvent({
    timestamp: 1000,
    code: "heartbeat.give_up",
    category: "network",
    level: "error",
    message: "This prose may change and says success even though semantics must not.",
    questId: "123",
    questName: "Quest A",
    taskType: "GAME",
    failure: {
        terminal: true,
        retryable: true,
        attempt: 3,
        maxAttempts: 3,
        httpStatus: 429,
        upstreamCode: 20028,
        reason: "No credited heartbeat"
    }
});
assert.ok(structured);
assert.equal(structured.summary, "Heartbeat give up");
assert.equal(structured.severity, "error");
assert.equal(structured.category, "network");
assert.equal(structured.quest?.id, "123");
assert.equal(structured.detail.terminal, true);
assert.equal(structured.detail.retryable, true);
assert.equal(structured.detail.httpStatus, 429);
assert.equal(structured.detail.message, "This prose may change and says success even though semantics must not.");

assert.equal(normalizeOrionCompanionEvent({
    code: "BAD CODE",
    category: "task",
    level: "info",
    message: "x",
    timestamp: 1
}), null);
assert.equal(normalizeOrionCompanionEvent({
    code: "task.failed",
    category: "task",
    level: "error",
    message: "x",
    timestamp: 1,
    failure: { terminal: "yes" }
}), null);

const candidateA = {
    id: 1,
    capturedAt: 1005,
    eventCode: "ORION_HEARTBEAT_TIMEOUT",
    severity: "error" as const,
    category: "network" as const,
    questName: "Quest A",
    rawConsole: '[OrionQuests] [Task] Discord stopped reporting progress for "Quest A". Giving up.'
};
const candidateB = {
    id: 2,
    capturedAt: 1001,
    eventCode: "ORION_HEARTBEAT_TIMEOUT",
    severity: "error" as const,
    category: "network" as const,
    questName: "Quest B",
    rawConsole: '[OrionQuests] [Task] Discord stopped reporting progress for "Quest B". Giving up.'
};
assert.equal(findOrionConsoleShadowMatch(structured, [candidateB, candidateA])?.id, 1);

const cycle = normalizeOrionCompanionEvent({
    timestamp: 2000,
    code: "cycle.processing",
    category: "cycle",
    level: "info",
    message: "ignored"
});
assert.ok(cycle);
const older = {
    id: 3,
    capturedAt: 1970,
    eventCode: "ORION_CYCLE_PROCESSING",
    severity: "info" as const,
    category: "runtime" as const,
    rawConsole: "[OrionQuests] [Cycle] Processing: old"
};
const nearer = {
    id: 4,
    capturedAt: 1999,
    eventCode: "ORION_CYCLE_PROCESSING",
    severity: "info" as const,
    category: "runtime" as const,
    rawConsole: "[OrionQuests] [Cycle] Processing: near"
};
assert.equal(findOrionConsoleShadowMatch(cycle, [older, nearer])?.id, 4);
assert.equal(findOrionConsoleShadowMatch(cycle, [{ ...nearer, capturedAt: 3000 }]), null);

console.log("Orion structured Event Log logic tests passed.");
