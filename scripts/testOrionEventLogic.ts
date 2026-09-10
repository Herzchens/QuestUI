import assert from "node:assert/strict";

import { classifyConsoleEvent, eventSearchText } from "../eventLogLogic";
import type { EventLogEvent } from "../eventLogTypes";
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

const searchableStructured: EventLogEvent = {
    schemaVersion: 1,
    id: "structured-search",
    timestamp: structured.timestamp,
    source: "orion",
    severity: structured.severity,
    category: structured.category,
    captureSource: "orion-api",
    eventCode: structured.eventCode,
    summary: structured.summary,
    quest: structured.quest,
    detail: structured.detail
};
assert.ok(eventSearchText(searchableStructured).includes("terminal:true"));
assert.ok(eventSearchText(searchableStructured).includes("retryable:true"));
assert.ok(eventSearchText(searchableStructured).includes("attempt:3"));
assert.ok(eventSearchText(searchableStructured).includes("maxattempts:3"));

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

const blockedText = '[OrionQuests] [Quest] "Quest A" has no usable task config, so there is nothing to drive. Skipping it for the rest of this run.';
const blockedFallback = classifyConsoleEvent("orion", "warn", blockedText);
assert.equal(blockedFallback.eventCode, "ORION_QUEST_BLOCKED");
assert.equal(blockedFallback.category, "quest");
assert.equal(blockedFallback.severity, "warning");
assert.equal(blockedFallback.questName, "Quest A");
const blockedStructured = normalizeOrionCompanionEvent({
    timestamp: 3000,
    code: "quest.blocked",
    category: "quest",
    level: "warning",
    message: "Quest cannot be driven.",
    questName: "Quest A"
});
assert.ok(blockedStructured);
assert.equal(findOrionConsoleShadowMatch(blockedStructured, [{
    id: 5,
    capturedAt: 2999,
    eventCode: blockedFallback.eventCode,
    severity: blockedFallback.severity,
    category: blockedFallback.category,
    questName: blockedFallback.questName,
    rawConsole: blockedText
}])?.id, 5);

const startedText = "[OrionQuests] Starting OrionQuests";
const startedFallback = classifyConsoleEvent("orion", "info", startedText);
assert.equal(startedFallback.eventCode, "ORION_ENGINE_STARTED");
const startedStructured = normalizeOrionCompanionEvent({
    timestamp: 4000,
    code: "engine.started",
    category: "system",
    level: "info",
    message: "Orion engine started."
});
assert.ok(startedStructured);
assert.equal(findOrionConsoleShadowMatch(startedStructured, [{
    id: 6,
    capturedAt: 3999,
    eventCode: startedFallback.eventCode,
    severity: startedFallback.severity,
    category: startedFallback.category,
    rawConsole: startedText
}])?.id, 6);

const stoppedText = "[OrionQuests] Stopped. All cleanups flushed cleanly.";
const stoppedFallback = classifyConsoleEvent("orion", "info", stoppedText);
assert.equal(stoppedFallback.eventCode, "ORION_ENGINE_STOPPED");
assert.equal(stoppedFallback.severity, "info");
const stoppedStructured = normalizeOrionCompanionEvent({
    timestamp: 5000,
    code: "engine.stopped",
    category: "system",
    level: "info",
    message: "Orion engine stopped. All cleanups flushed cleanly."
});
assert.ok(stoppedStructured);
assert.equal(findOrionConsoleShadowMatch(stoppedStructured, [{
    id: 7,
    capturedAt: 4999,
    eventCode: stoppedFallback.eventCode,
    severity: stoppedFallback.severity,
    category: stoppedFallback.category,
    rawConsole: stoppedText
}])?.id, 7);

const stoppedWithCleanupFailure = classifyConsoleEvent("orion", "info", "[OrionQuests] Stopped. 2 cleanup(s) threw, see errors above.");
assert.equal(stoppedWithCleanupFailure.eventCode, "ORION_ENGINE_STOPPED");
assert.equal(stoppedWithCleanupFailure.severity, "warning");

console.log("Orion structured Event Log logic tests passed.");
