import assert from "node:assert/strict";

import {
    eventBelongsToAccount,
    eventVisibleForAccount,
    isLegacyUnscopedEvent,
    normalizeEventAccountId,
    sameEventAccountScope,
    UNAVAILABLE_ACCOUNT_SCOPE
} from "../eventLogAccountLogic";
import {
    classifyConsoleEvent,
    consoleEventSource,
    inferEventCategory,
    sanitizeEventText
} from "../eventLogLogic";
import {
    compareEventLogOrder,
    cursorFromEvent,
    eventLogCursorStartIndex,
    pageSortedEventLogEvents,
    sortEventLogEvents
} from "../eventLogPaginationLogic";
import type { EventLogEvent, EventLogSeverity, EventLogSort } from "../eventLogTypes";
import { normalizePersistedEvent } from "../eventLogValidation";
import { buildEventLogVirtualLayout, eventLogVirtualRange } from "../eventLogVirtualizationLogic";

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

assert.equal(inferEventCategory({ source: "orion", eventCode: "ORION_NETWORK_HTTP", summary: "old row without category" }), "network");
assert.equal(inferEventCategory({ source: "orion", eventCode: "ORION_CLAIM_SUCCEEDED", summary: "old row without category" }), "quest");
assert.equal(inferEventCategory({ source: "questui", eventCode: "QUESTUI_EVENT_LOG_STARTED", summary: "old row without category" }), "diagnostic");

const sanitized = sanitizeEventText("Authorization: Bearer secret access_token=abc ?code=oauth-secret");
assert.ok(!sanitized.includes("secret"));
assert.ok(!sanitized.includes("abc"));
assert.ok(!sanitized.includes("oauth-secret"));
assert.ok(sanitized.includes("[REDACTED]"));

assert.equal(normalizeEventAccountId(" 123456789 "), "123456789");
assert.equal(normalizeEventAccountId("   "), null);
assert.equal(normalizeEventAccountId(null), null);
assert.equal(eventBelongsToAccount({ accountId: "111" }, "111"), true);
assert.equal(eventBelongsToAccount({ accountId: "111" }, "222"), false);
assert.equal(eventBelongsToAccount({}, "111"), false);
assert.equal(eventBelongsToAccount({ accountId: null }, UNAVAILABLE_ACCOUNT_SCOPE), false);
assert.equal(isLegacyUnscopedEvent({}), true);
assert.equal(isLegacyUnscopedEvent({ accountId: null }), true);
assert.equal(isLegacyUnscopedEvent({ accountId: "111" }), false);
assert.equal(eventVisibleForAccount({ accountId: "111" }, "111", true), true);
assert.equal(eventVisibleForAccount({ accountId: "222" }, "111", true), false);
assert.equal(eventVisibleForAccount({}, "111", true), true);
assert.equal(eventVisibleForAccount({}, "111", false), false);
assert.equal(eventVisibleForAccount({}, UNAVAILABLE_ACCOUNT_SCOPE, true), true);
assert.equal(sameEventAccountScope({}, { accountId: null }), true);
assert.equal(sameEventAccountScope({ accountId: "111" }, { accountId: "111" }), true);
assert.equal(sameEventAccountScope({ accountId: "111" }, { accountId: "222" }), false);

const validPersistedLegacy = normalizePersistedEvent({
    schemaVersion: 1,
    id: " legacy-1 ",
    timestamp: 123,
    source: "questui",
    severity: "info",
    captureSource: "questui",
    eventCode: "LEGACY_OK",
    summary: "legacy row",
    category: "not-a-category",
    quest: { id: 42, name: "Quest", taskType: null }
});
assert.ok(validPersistedLegacy);
assert.equal(validPersistedLegacy.id, "legacy-1");
assert.equal(validPersistedLegacy.accountId, undefined);
assert.equal(validPersistedLegacy.category, undefined);
assert.deepEqual(validPersistedLegacy.quest, { id: null, name: "Quest", taskType: null });
assert.equal(normalizePersistedEvent({}), null);
assert.equal(normalizePersistedEvent({ id: "bad", timestamp: Number.NaN, source: "questui", severity: "info", captureSource: "questui", eventCode: "BAD", summary: "bad" }), null);
assert.equal(normalizePersistedEvent({ id: "bad", timestamp: 123, source: "discord", severity: "info", captureSource: "questui", eventCode: "BAD", summary: "bad" }), null);
assert.equal(normalizePersistedEvent({ id: "bad", timestamp: 123, source: "questui", severity: "info", captureSource: "questui", summary: "missing code" }), null);

function fakeEvent(id: string, timestamp: number, severity: EventLogSeverity = "info"): EventLogEvent {
    return {
        schemaVersion: 1,
        id,
        timestamp,
        source: "questui",
        severity,
        category: "diagnostic",
        captureSource: "questui",
        eventCode: `TEST_${id}`,
        summary: id
    };
}

const paginationFixture = [
    fakeEvent("e", 500),
    fakeEvent("d", 400),
    fakeEvent("c2", 300),
    fakeEvent("c1", 300),
    fakeEvent("b", 200),
    fakeEvent("a", 100)
];

const newest = sortEventLogEvents(paginationFixture, "newest");
assert.deepEqual(newest.map(event => event.id), ["e", "d", "c1", "c2", "b", "a"]);
const newestPage1 = pageSortedEventLogEvents(newest, "newest", 2);
assert.deepEqual(newestPage1.events.map(event => event.id), ["e", "d"]);
assert.equal(newestPage1.hasMore, true);
assert.ok(newestPage1.nextCursor);
const newestPage2 = pageSortedEventLogEvents(newest, "newest", 2, newestPage1.nextCursor);
assert.deepEqual(newestPage2.events.map(event => event.id), ["c1", "c2"]);
const newestPage3 = pageSortedEventLogEvents(newest, "newest", 2, newestPage2.nextCursor);
assert.deepEqual(newestPage3.events.map(event => event.id), ["b", "a"]);
assert.equal(newestPage3.hasMore, false);
assert.equal(newestPage3.nextCursor, null);

const oldest = sortEventLogEvents(paginationFixture, "oldest");
assert.deepEqual(oldest.map(event => event.id), ["a", "b", "c1", "c2", "d", "e"]);
const oldestPage1 = pageSortedEventLogEvents(oldest, "oldest", 2);
const oldestPage2 = pageSortedEventLogEvents(oldest, "oldest", 2, oldestPage1.nextCursor);
const oldestPage3 = pageSortedEventLogEvents(oldest, "oldest", 2, oldestPage2.nextCursor);
assert.deepEqual([...oldestPage1.events, ...oldestPage2.events, ...oldestPage3.events].map(event => event.id), ["a", "b", "c1", "c2", "d", "e"]);
assert.equal(oldestPage3.hasMore, false);

const severityFixture = [
    fakeEvent("info-new", 500, "info"),
    fakeEvent("error-old", 100, "error"),
    fakeEvent("warning", 300, "warning"),
    fakeEvent("error-new", 400, "error"),
    fakeEvent("success", 200, "success")
];
const severityOrdered = sortEventLogEvents(severityFixture, "severity");
assert.deepEqual(severityOrdered.map(event => event.id), ["error-new", "error-old", "warning", "success", "info-new"]);
const severityPage1 = pageSortedEventLogEvents(severityOrdered, "severity", 2);
const severityPage2 = pageSortedEventLogEvents(severityOrdered, "severity", 2, severityPage1.nextCursor);
const severityPage3 = pageSortedEventLogEvents(severityOrdered, "severity", 2, severityPage2.nextCursor);
assert.deepEqual([...severityPage1.events, ...severityPage2.events, ...severityPage3.events].map(event => event.id), severityOrdered.map(event => event.id));

const cursor = cursorFromEvent(newest[1], "newest");
assert.equal(eventLogCursorStartIndex(newest, cursor, "newest"), 2);
assert.ok(compareEventLogOrder(newest[0], newest[1], "newest") < 0);
assert.equal(pageSortedEventLogEvents(newest, "oldest", 2, cursor).stale, true);

function traverseAll(events: EventLogEvent[], sort: EventLogSort, pageSize: number): EventLogEvent[] {
    const sorted = sortEventLogEvents(events, sort);
    const traversed: EventLogEvent[] = [];
    let cursor = null as ReturnType<typeof cursorFromEvent> | null;
    for (;;) {
        const page = pageSortedEventLogEvents(sorted, sort, pageSize, cursor);
        assert.equal(page.stale, false);
        traversed.push(...page.events);
        if (!page.hasMore) break;
        assert.ok(page.nextCursor);
        cursor = page.nextCursor;
    }
    return traversed;
}

const largeFixture = Array.from({ length: 10_538 }, (_, index) =>
    fakeEvent(`large-${index.toString().padStart(5, "0")}`, Math.floor(index / 3), index % 17 === 0 ? "error" : "info")
);
for (const sort of ["newest", "oldest"] as const) {
    const expected = sortEventLogEvents(largeFixture, sort);
    const traversed = traverseAll(largeFixture, sort, 250);
    assert.equal(traversed.length, 10_538);
    assert.equal(new Set(traversed.map(event => event.id)).size, 10_538);
    assert.equal(traversed[0].id, expected[0].id);
    assert.equal(traversed[traversed.length - 1].id, expected[expected.length - 1].id);
    assert.deepEqual(traversed.map(event => event.id), expected.map(event => event.id));
}

const virtualLayout = buildEventLogVirtualLayout(5, index => [30, 64, 64, 78, 64][index]);
assert.equal(virtualLayout.totalHeight, 300);
assert.deepEqual(virtualLayout.metrics.map(metric => metric.top), [0, 30, 94, 158, 236]);
assert.deepEqual(eventLogVirtualRange(virtualLayout, 0, 100, 0), { start: 0, end: 3 });
assert.deepEqual(eventLogVirtualRange(virtualLayout, 90, 80, 0), { start: 1, end: 4 });
assert.deepEqual(eventLogVirtualRange(virtualLayout, 236, 64, 0), { start: 4, end: 5 });
assert.deepEqual(eventLogVirtualRange(virtualLayout, 100, 40, 0), { start: 2, end: 3 });
assert.deepEqual(eventLogVirtualRange(virtualLayout, 100, 40, 80), { start: 0, end: 4 });
const safeVirtualLayout = buildEventLogVirtualLayout(3, index => [0, Number.NaN, 20][index]);
assert.deepEqual(safeVirtualLayout.metrics.map(metric => metric.height), [1, 1, 20]);
assert.equal(safeVirtualLayout.totalHeight, 22);

console.log("Event Log logic tests passed.");
