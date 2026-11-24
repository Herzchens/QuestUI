import assert from "node:assert/strict";

import {
    ensureNotificationCenterAccount,
    notificationCenterAccountState,
    notificationCenterItems,
    notificationCenterPresentation,
    updateNotificationCenterAccount
} from "../../src/notifications/centerLogic";
import type { EventLogEvent } from "../../src/eventLog/types";

function event(overrides: Partial<EventLogEvent> = {}): EventLogEvent {
    return {
        schemaVersion: 1,
        id: "evt-1",
        timestamp: 200,
        accountId: "acct-a",
        accountUsername: "A",
        source: "questui",
        severity: "info",
        category: "quest",
        captureSource: "questui",
        eventCode: "QUEST_NEW_AVAILABLE",
        summary: "Quest One is available to accept",
        quest: { id: "q1", name: "Quest One", taskType: "PLAY_ON_DESKTOP" },
        detail: null,
        ...overrides
    };
}

assert.equal(notificationCenterPresentation(event())?.title, "New quest available");
assert.equal(notificationCenterPresentation(event({ severity: "success", eventCode: "QUEST_ACCEPT_SUCCEEDED", summary: "Quest accepted" }))?.title, "Quest accepted");
assert.equal(notificationCenterPresentation(event({ severity: "success", eventCode: "QUEST_CLAIM_SUCCEEDED", summary: "Quest reward claimed" }))?.title, "Reward claimed");
assert.equal(notificationCenterPresentation(event({ severity: "success", eventCode: "QUEST_CLAIM_ALL_SUCCEEDED", summary: "Claim all completed" }))?.title, "Rewards claimed");

assert.equal(notificationCenterPresentation(event({ source: "orion", severity: "success", eventCode: "task.started", summary: "Task started" })), null);
assert.equal(notificationCenterPresentation(event({ source: "orion", severity: "success", eventCode: "task.completed", summary: "Task completed" })), null);
assert.equal(notificationCenterPresentation(event({ severity: "success", eventCode: "QUEST_READY_TO_CLAIM", summary: "Ready to claim" })), null);
assert.equal(notificationCenterPresentation(event({ source: "orion", severity: "info", eventCode: "engine.stopped", summary: "Engine stopped" })), null);
assert.equal(notificationCenterPresentation(event({ source: "questui", severity: "info", eventCode: "QUESTUI_UPDATE_AVAILABLE", summary: "Update available" })), null);

const taskFailure = event({
    id: "evt-error",
    source: "orion",
    severity: "error",
    eventCode: "task.failed",
    summary: "Quest failed",
    detail: { message: "Failed to attach to quest session.", terminal: true }
});
assert.equal(notificationCenterPresentation(taskFailure)?.title, "Quest failed");
assert.equal(notificationCenterPresentation(taskFailure)?.description, "Failed to attach to quest session.");

assert.equal(notificationCenterPresentation(event({
    source: "orion",
    severity: "error",
    eventCode: "claim.failed",
    summary: "Claim failed",
    detail: { message: "Discord rejected the claim.", terminal: true }
}))?.title, "Claim failed");

assert.equal(notificationCenterPresentation(event({
    severity: "warning",
    eventCode: "QUEST_CLAIM_ALL_STOPPED",
    summary: "Claim all stopped for Discord verification",
    detail: { message: "Discord verification required." }
}))?.title, "Claim All needs attention");

assert.equal(notificationCenterPresentation(event({
    severity: "error",
    category: "runtime",
    eventCode: "SOME_RUNTIME_ERROR",
    summary: "Internal runtime error",
    detail: { terminal: true }
})), null);

assert.equal(notificationCenterPresentation(event({
    source: "orion",
    severity: "warning",
    category: "network",
    eventCode: "network.retry",
    summary: "Retrying request",
    detail: { terminal: false, retryable: true }
})), null);

let state = ensureNotificationCenterAccount(null, "acct-a", 150);
let account = notificationCenterAccountState(state, "acct-a");
assert.ok(account);
assert.equal(account.readThrough, 150);

let items = notificationCenterItems([
    event({ id: "new", timestamp: 200 }),
    event({ id: "old", timestamp: 100 }),
    event({ id: "other", timestamp: 250, accountId: "acct-b" })
], "acct-a", account);
assert.equal(items.length, 2);
assert.equal(items[0].id, "new");
assert.equal(items[0].read, false);
assert.equal(items[1].read, true);

state = updateNotificationCenterAccount(state, "acct-a", { readThrough: 250 });
account = notificationCenterAccountState(state, "acct-a")!;
items = notificationCenterItems([event({ id: "new", timestamp: 200 })], "acct-a", account);
assert.equal(items[0].read, true);

state = updateNotificationCenterAccount(state, "acct-a", { clearedThrough: 210, readThrough: 210 });
account = notificationCenterAccountState(state, "acct-a")!;
items = notificationCenterItems([
    event({ id: "hidden", timestamp: 200 }),
    event({ id: "future", timestamp: 220 })
], "acct-a", account);
assert.deepEqual(items.map(item => item.id), ["future"]);

console.log("QuestUI Notification Center logic tests - PASS");
