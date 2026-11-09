import type { PluginNative } from "@utils/types";
import { UserStore } from "@webpack/common";

import { queryEventLog } from "./eventLog";
import { UNAVAILABLE_ACCOUNT_SCOPE } from "./eventLogAccountLogic";
import {
    pageSortedEventLogEvents,
    sortEventLogEvents,
    type EventLogPageQuery,
    type EventLogPageResult
} from "./eventLogPaginationLogic";

const Native = !IS_WEB
    ? VencordNative.pluginHelpers.QuestUI as PluginNative<typeof import("./native")>
    : null;

const MEMORY_SESSION_LIMIT = 3;
let nextMemorySessionId = 0;
const memorySessions = new Map<string, {
    signature: string;
    sort: NonNullable<EventLogPageQuery["sort"]>;
    events: EventLogPageResult["events"];
}>();

function currentAccountId(): string {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id.trim() ? id.trim() : UNAVAILABLE_ACCOUNT_SCOPE;
    } catch {
        return UNAVAILABLE_ACCOUNT_SCOPE;
    }
}

function normalizedSort(options: EventLogPageQuery): NonNullable<EventLogPageQuery["sort"]> {
    return options.sort === "oldest" || options.sort === "severity" ? options.sort : "newest";
}

function sessionSignature(options: EventLogPageQuery): string {
    return JSON.stringify([
        options.query?.trim().toLowerCase() ?? "",
        options.source ?? "all",
        options.severity ?? "all",
        options.category ?? "all",
        normalizedSort(options),
        options.accountId ?? "",
        options.includeLegacy !== false
    ]);
}

function rememberMemorySession(signature: string, sort: NonNullable<EventLogPageQuery["sort"]>, events: EventLogPageResult["events"]): string {
    while (memorySessions.size >= MEMORY_SESSION_LIMIT) {
        const oldest = memorySessions.keys().next().value as string | undefined;
        if (!oldest) break;
        memorySessions.delete(oldest);
    }
    const id = `memory-${Date.now().toString(36)}-${(++nextMemorySessionId).toString(36)}`;
    memorySessions.set(id, { signature, sort, events });
    return id;
}

async function memoryPage(options: EventLogPageQuery): Promise<EventLogPageResult> {
    const sort = normalizedSort(options);
    const signature = sessionSignature(options);
    let sessionId = typeof options.sessionId === "string" && options.sessionId ? options.sessionId : null;
    let session = sessionId ? memorySessions.get(sessionId) : undefined;

    if (sessionId && (!session || session.signature !== signature || session.sort !== sort)) {
        return { events: [], total: 0, hasMore: false, nextCursor: null, sessionId: null, stale: true };
    }

    if (!session) {
        const result = await queryEventLog({
            query: options.query,
            source: options.source,
            severity: options.severity,
            category: options.category,
            sort,
            limit: 5000,
            includeLegacy: options.includeLegacy
        });
        const events = sortEventLogEvents(result.events, sort);
        sessionId = rememberMemorySession(signature, sort, events);
        session = memorySessions.get(sessionId)!;
    }

    const page = pageSortedEventLogEvents(session.events, sort, options.pageSize ?? 250, options.cursor);
    if (page.stale) {
        return { events: [], total: session.events.length, hasMore: false, nextCursor: null, sessionId, stale: true };
    }
    return {
        events: page.events,
        total: session.events.length,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        sessionId,
        stale: false
    };
}

export async function queryEventLogPage(options: EventLogPageQuery): Promise<EventLogPageResult> {
    const scopedOptions: EventLogPageQuery = {
        ...options,
        accountId: currentAccountId(),
        includeLegacy: options.includeLegacy !== false
    };

    if (!Native) return memoryPage(scopedOptions);
    try {
        return await Native.queryEventPage(scopedOptions) as EventLogPageResult;
    } catch {
        // Desktop builds ship renderer and native helper together. Falling back to the legacy
        // 5,000-row query here would silently reintroduce incomplete history traversal.
        return { events: [], total: 0, hasMore: false, nextCursor: null, sessionId: null, stale: true };
    }
}
