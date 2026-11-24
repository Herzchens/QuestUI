import assert from "node:assert/strict";

import {
    ensureNotificationCenterAccount,
    notificationCenterAccountState,
    notificationCenterItems,
    notificationCenterPresentation,
    notificationQuestMeta,
    updateNotificationCenterAccount
} from "../../src/notifications/centerLogic";
import type { EventLogEvent } from "../../src/eventLog/types";
import { normalizePersistedEvent } from "../../src/eventLog/validation";
import { findQuestByIdentity, safeQuestArtworkUrl, taskTypeForKey } from "../../src/quests/presentationLogic";
import { formatQuestRewardLabel } from "../../src/orbs/rewards";

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
assert.equal(notificationCenterPresentation(event({ severity: "success", eventCode: "QUEST_CLAIM_ALL_SUCCEEDED", summary: "Claim all completed" })), null);
for (const eventCode of ["QUEST_ACCEPT_SUCCEEDED", "QUEST_CLAIM_SUCCEEDED", "CLAIM_SUCCEEDED"]) {
    assert.equal(notificationCenterPresentation(event({ eventCode, detail: { storeConfirmed: false } })), null);
}
assert.equal(notificationCenterPresentation(event({ eventCode: "QUEST_CLAIM_SUBMITTED" })), null);
assert.equal(notificationCenterPresentation(event({ eventCode: "QUEST_ACCEPT_SUBMITTED" })), null);
assert.equal(notificationCenterPresentation(event({ source: "orion", eventCode: "ORION_TASK_ABORTED", severity: "error" }))?.title, "Quest failed");
assert.equal(notificationCenterPresentation(event({ source: "orion", eventCode: "ORION_HEARTBEAT_TIMEOUT", severity: "error" }))?.title, "Quest failed");
assert.equal(notificationCenterPresentation(event({ source: "orion", eventCode: "heartbeat.give_up", severity: "error" })), null);
assert.equal(notificationCenterPresentation(event({ source: "orion", eventCode: "task.failed", severity: "error" }))?.title, "Quest failed");

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

const matching = [{ id: "q1", name: "Same name" }, { id: "q2", name: "Same name" }, { id: "q3", name: "Unique" }];
assert.equal(findQuestByIdentity({ id: "q2", name: "Same name" }, matching)?.id, "q2");
assert.equal(findQuestByIdentity({ id: "missing", name: "Unique" }, matching), null);
assert.equal(findQuestByIdentity({ name: "Same name" }, matching), null);
assert.equal(findQuestByIdentity({ name: " unique " }, matching)?.id, "q3");
assert.equal(taskTypeForKey("PLAY_ON_DESKTOP"), "play");
assert.equal(taskTypeForKey("WATCH_VIDEO"), "video");

const artwork = "https://cdn.discordapp.com/quests/123/game_tile.png";
assert.equal(safeQuestArtworkUrl(artwork + "?token=secret#fragment"), artwork);
for (const unsafe of ["https://evil.example/quests/123/a.png", "https://cdn.discordapp.com.evil.example/quests/123/a.png", "http://cdn.discordapp.com/quests/123/a.png", "https://user:pass@cdn.discordapp.com/quests/123/a.png", "https://cdn.discordapp.com/attachments/123/a.png", "javascript:alert(1)"]) {
    assert.equal(safeQuestArtworkUrl(unsafe), null);
}
const reward = { kind: "orbs", label: "200 Orbs", orbQuantity: 200, boostedOrbQuantity: 240 };
assert.equal(formatQuestRewardLabel(reward, true), "240 Orbs");
assert.equal(formatQuestRewardLabel(reward, false), "200 Orbs");

const historical = normalizePersistedEvent(event({
    id: "batch-reward",
    timestamp: 300,
    severity: "success",
    eventCode: "QUEST_CLAIM_SUCCEEDED",
    quest: { id: "q1", name: "Quest One", taskType: "PLAY_ON_DESKTOP", rewardLabel: "240 Orbs", artworkDark: artwork + "?token=secret", artworkLight: "https://evil.example/a.png" },
    detail: { storeConfirmed: true, claimMode: "batch" }
}))!;
assert.equal(historical.quest?.artworkDark, artwork);
assert.equal(historical.quest?.artworkLight, undefined);
const rewardItems = notificationCenterItems([
    historical,
    event({ id: "batch-summary", timestamp: 301, eventCode: "QUEST_CLAIM_ALL_SUCCEEDED", quest: null }),
    event({ id: "unconfirmed", timestamp: 302, eventCode: "QUEST_CLAIM_SUCCEEDED", detail: { storeConfirmed: false } }),
    event({ id: "foreign", timestamp: 303, accountId: "acct-b", eventCode: "QUEST_CLAIM_SUCCEEDED" })
], "acct-a", account);
assert.equal(rewardItems.length, 1);
assert.equal(notificationQuestMeta(rewardItems[0], null), "Quest One · Reward: 240 Orbs");
assert.equal(notificationQuestMeta(rewardItems[0], { name: "Changed", rewardLabel: "200 Orbs" }), "Quest One · Reward: 240 Orbs");

console.log("QuestUI Notification Center logic tests - PASS");
