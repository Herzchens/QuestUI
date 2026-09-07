import assert from "node:assert/strict";

import {
    classifyConsoleEvent,
    consoleEventSource,
    inferEventCategory,
    sanitizeEventText
} from "../eventLogLogic";

assert.equal(consoleEventSource(["%c Vencord %c %c OrionQuests ", "style", "", "style", '[Task] Aborted "Quest A": heartbeat watchdog timeout']), "orion");
assert.equal(consoleEventSource(["Discord random log"]), null);

const aborted = classifyConsoleEvent("orion", "error", '[OrionQuests] [Task] Aborted "Quest A": heartbeat watchdog timeout');
assert.equal(aborted.eventCode, "ORION_HEARTBEAT_TIMEOUT");
assert.equal(aborted.questName, "Quest A");
assert.equal(aborted.severity, "error");
assert.equal(aborted.category, "network");

const completed = classifyConsoleEvent("orion", "info", '[OrionQuests] [Task] Completed "Quest B"!');
assert.equal(completed.eventCode, "ORION_TASK_COMPLETED");
assert.equal(completed.severity, "success");
assert.equal(completed.category, "quest");

const cycle = classifyConsoleEvent("orion", "info", "[OrionQuests] [Cycle] Starting loop #3...");
assert.equal(cycle.eventCode, "ORION_CYCLE_STARTED");
assert.equal(cycle.category, "runtime");

const retry = classifyConsoleEvent("orion", "warn", "[OrionQuests] [Network] Retry 2/4 in 1.5s (HTTP 429)");
assert.equal(retry.eventCode, "ORION_NETWORK_RETRY");
assert.equal(retry.category, "network");
assert.equal(retry.detail.httpStatus, 429);

const enroll = classifyConsoleEvent("orion", "info", '[OrionQuests] [Enroll] Auto-enroll is off, waiting for you to accept "Quest C" in Discord.');
assert.equal(enroll.eventCode, "ORION_ENROLL_WAITING");
assert.equal(enroll.questName, "Quest C");
assert.equal(enroll.category, "quest");

const claim = classifyConsoleEvent("orion", "warn", '[OrionQuests] [Claim] Captcha required for "Quest D". Use Discord\'s UI button.');
assert.equal(claim.eventCode, "ORION_CLAIM_CAPTCHA_REQUIRED");
assert.equal(claim.category, "quest");

const bypass = classifyConsoleEvent("orion", "info", '[OrionQuests] [Bypass] Achievement OAuth bypass is off in settings; skipping "Quest E".');
assert.equal(bypass.eventCode, "ORION_BYPASS_SKIPPED");
assert.equal(bypass.category, "diagnostic");

const achievement = classifyConsoleEvent("orion", "warn", "[OrionQuests] [Achievement] Heartbeat rejected (HTTP 403). Falling back to bypass.");
assert.equal(achievement.eventCode, "ORION_ACHIEVEMENT_FALLBACK");
assert.equal(achievement.category, "quest");

const startup = classifyConsoleEvent("orion", "info", "[OrionQuests] [Startup] Discord has not sent its quest list yet. Waiting for it before the first cycle.");
assert.equal(startup.eventCode, "ORION_STARTUP_WAITING");
assert.equal(startup.category, "runtime");

const patcher = classifyConsoleEvent("orion", "warn", "[OrionQuests] [Patcher] Could not restore showCurrentGame from a previous session: nope");
assert.equal(patcher.eventCode, "ORION_PATCHER_WARNING");
assert.equal(patcher.category, "runtime");

assert.equal(inferEventCategory({
    source: "orion",
    eventCode: "ORION_NETWORK_HTTP",
    summary: "old row without category"
}), "network");
assert.equal(inferEventCategory({
    source: "orion",
    eventCode: "ORION_CLAIM_SUCCEEDED",
    summary: "old row without category"
}), "quest");
assert.equal(inferEventCategory({
    source: "questui",
    eventCode: "QUESTUI_EVENT_LOG_STARTED",
    summary: "old row without category"
}), "diagnostic");

const sanitized = sanitizeEventText("Authorization: Bearer secret access_token=abc ?code=oauth-secret");
assert.ok(!sanitized.includes("secret"));
assert.ok(!sanitized.includes("abc"));
assert.ok(!sanitized.includes("oauth-secret"));
assert.ok(sanitized.includes("[REDACTED]"));

console.log("Event Log logic tests passed.");
