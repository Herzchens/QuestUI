import assert from "node:assert/strict";

import { classifyConsoleEvent, consoleEventSource, sanitizeEventText } from "../eventLogLogic";

assert.equal(consoleEventSource(["%c Vencord %c %c OrionQuests ", "style", "", "style", '[Task] Aborted "Quest A": heartbeat watchdog timeout']), "orion");
assert.equal(consoleEventSource(["Discord random log"]), null);

const aborted = classifyConsoleEvent("orion", "error", '[OrionQuests] [Task] Aborted "Quest A": heartbeat watchdog timeout');
assert.equal(aborted.eventCode, "ORION_HEARTBEAT_TIMEOUT");
assert.equal(aborted.questName, "Quest A");
assert.equal(aborted.severity, "error");

const completed = classifyConsoleEvent("orion", "info", '[OrionQuests] [Task] Completed "Quest B"!');
assert.equal(completed.eventCode, "ORION_TASK_COMPLETED");
assert.equal(completed.severity, "success");

const sanitized = sanitizeEventText("Authorization: Bearer secret access_token=abc ?code=oauth-secret");
assert.ok(!sanitized.includes("secret"));
assert.ok(!sanitized.includes("abc"));
assert.ok(!sanitized.includes("oauth-secret"));
assert.ok(sanitized.includes("[REDACTED]"));

console.log("Event Log logic tests passed.");
