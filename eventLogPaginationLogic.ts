import type { EventLogEvent, EventLogSeverity, EventLogSort } from "./eventLogTypes";

export interface EventLogCursor {
    version: 1;
    sort: EventLogSort;
    timestamp: number;
    id: string;
    severity: EventLogSeverity;
}

export interface EventLogPageQuery {
    query?: string;
    source?: "all" | "orion" | "questui";
    severity?: "all" | EventLogSeverity;
    category?: "all" | "quest" | "runtime" | "network" | "diagnostic";
    sort?: EventLogSort;
    pageSize?: number;
    cursor?: EventLogCursor | null;
    sessionId?: string | null;
    accountId?: string;
    includeLegacy?: boolean;
}

export interface EventLogPageResult {
    events: EventLogEvent[];
    total: number;
    hasMore: boolean;
    nextCursor: EventLogCursor | null;
    sessionId: string | null;
    stale?: boolean;
}

function severityRank(severity: EventLogSeverity): number {
    if (severity === "error") return 0;
    if (severity === "warning") return 1;
    if (severity === "success") return 2;
    return 3;
}

function eventTimestamp(event: Pick<EventLogEvent, "timestamp">): number {
    const timestamp = Number(event.timestamp);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function eventId(event: Pick<EventLogEvent, "id">): string {
    return typeof event.id === "string" ? event.id : "";
}

function compareId(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Comparator for the exact Event Log display order. A negative result means
 * `a` is displayed before `b`. The id tie-breaker is required because Orion can
 * emit multiple events in the same millisecond.
 */
export function compareEventLogOrder(
    a: Pick<EventLogEvent, "id" | "timestamp" | "severity">,
    b: Pick<EventLogEvent, "id" | "timestamp" | "severity">,
    sort: EventLogSort
): number {
    if (sort === "severity") {
        const severityDelta = severityRank(a.severity) - severityRank(b.severity);
        if (severityDelta !== 0) return severityDelta;
    }

    const aTimestamp = eventTimestamp(a);
    const bTimestamp = eventTimestamp(b);
    if (aTimestamp !== bTimestamp) {
        return sort === "oldest" ? aTimestamp - bTimestamp : bTimestamp - aTimestamp;
    }

    return compareId(eventId(a), eventId(b));
}

export function sortEventLogEvents(events: EventLogEvent[], sort: EventLogSort): EventLogEvent[] {
    return [...events].sort((a, b) => compareEventLogOrder(a, b, sort));
}

export function cursorFromEvent(event: EventLogEvent, sort: EventLogSort): EventLogCursor {
    return {
        version: 1,
        sort,
        timestamp: eventTimestamp(event),
        id: eventId(event),
        severity: event.severity
    };
}

export function isEventLogCursor(value: unknown, sort: EventLogSort): value is EventLogCursor {
    if (!value || typeof value !== "object") return false;
    const cursor = value as Partial<EventLogCursor>;
    return cursor.version === 1
        && cursor.sort === sort
        && Number.isFinite(Number(cursor.timestamp))
        && typeof cursor.id === "string"
        && ["info", "success", "warning", "error"].includes(String(cursor.severity));
}

/**
 * Find the first row strictly after a cursor in an already-sorted immutable
 * snapshot. The cursor row itself does not need to still be present.
 */
export function eventLogCursorStartIndex(
    events: EventLogEvent[],
    cursor: EventLogCursor,
    sort: EventLogSort
): number {
    let low = 0;
    let high = events.length;
    const cursorEvent: Pick<EventLogEvent, "id" | "timestamp" | "severity"> = cursor;

    while (low < high) {
        const mid = (low + high) >>> 1;
        if (compareEventLogOrder(events[mid], cursorEvent, sort) <= 0) low = mid + 1;
        else high = mid;
    }
    return low;
}

export function pageSortedEventLogEvents(
    events: EventLogEvent[],
    sort: EventLogSort,
    pageSize: number,
    cursor?: EventLogCursor | null
): { events: EventLogEvent[]; hasMore: boolean; nextCursor: EventLogCursor | null; stale: boolean; } {
    const safePageSize = Math.max(1, Math.min(500, Math.trunc(Number(pageSize) || 250)));
    if (cursor != null && !isEventLogCursor(cursor, sort)) {
        return { events: [], hasMore: false, nextCursor: null, stale: true };
    }

    const start = cursor ? eventLogCursorStartIndex(events, cursor, sort) : 0;
    const page = events.slice(start, start + safePageSize);
    const hasMore = start + page.length < events.length;
    const nextCursor = hasMore && page.length > 0 ? cursorFromEvent(page[page.length - 1], sort) : null;
    return { events: page, hasMore, nextCursor, stale: false };
}
