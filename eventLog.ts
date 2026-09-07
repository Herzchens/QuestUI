import type { PluginNative } from "@utils/types";

import { classifyConsoleEvent, consoleArgsToText, consoleEventSource, sanitizeEventText, severityRank } from "./eventLogLogic";
import type { EventLogEvent, EventLogQuery, EventLogQueryResult, EventLogSource, EventLogSeverity } from "./eventLogTypes";

const Native = !IS_WEB
    ? VencordNative.pluginHelpers.QuestUI as PluginNative<typeof import("./native")>
    : null;

const memoryEvents: EventLogEvent[] = [];
const listeners = new Set<() => void>();
const consoleLevels = ["log", "info", "warn", "error", "debug"] as const;
const originals = new Map<typeof consoleLevels[number], (...args: any[]) => void>();
let captureStarted = false;

function eventId(): string {
    try { return globalThis.crypto?.randomUUID?.() ?? `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
    catch { return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

function notify(): void {
    for (const listener of listeners) listener();
}

function sanitizeDetail(detail: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
    if (!detail) return null;
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(detail)) {
        if (typeof value === "string") sanitized[key] = sanitizeEventText(value);
        else sanitized[key] = value;
    }
    return sanitized;
}

export async function recordQuestUIEvent(input: {
    source?: EventLogSource;
    severity: EventLogSeverity;
    eventCode: string;
    summary: string;
    quest?: { id?: string | null; name?: string | null; taskType?: string | null; } | null;
    detail?: Record<string, unknown> | null;
    captureSource?: EventLogEvent["captureSource"];
}): Promise<EventLogEvent> {
    const event: EventLogEvent = {
        schemaVersion: 1,
        id: eventId(),
        timestamp: Date.now(),
        source: input.source ?? "questui",
        severity: input.severity,
        captureSource: input.captureSource ?? "questui",
        eventCode: sanitizeEventText(input.eventCode, 120),
        summary: sanitizeEventText(input.summary, 240),
        quest: input.quest ? {
            id: input.quest.id ? sanitizeEventText(input.quest.id, 120) : null,
            name: input.quest.name ? sanitizeEventText(input.quest.name, 240) : null,
            taskType: input.quest.taskType ? sanitizeEventText(input.quest.taskType, 120) : null
        } : null,
        detail: sanitizeDetail(input.detail)
    };

    memoryEvents.unshift(event);
    if (memoryEvents.length > 1000) memoryEvents.length = 1000;
    notify();

    if (Native) {
        try { await Native.appendEvent(JSON.stringify(event)); } catch { }
    }
    return event;
}

function memoryQuery(options: EventLogQuery): EventLogQueryResult {
    const query = options.query?.trim().toLowerCase() ?? "";
    const source = options.source ?? "all";
    const severity = options.severity ?? "all";
    const sort = options.sort ?? "newest";
    const limit = Math.max(1, Math.min(5000, options.limit ?? 200));
    let events = [...memoryEvents];
    if (source !== "all") events = events.filter(event => event.source === source);
    if (severity !== "all") events = events.filter(event => event.severity === severity);
    if (query) events = events.filter(event => JSON.stringify(event).toLowerCase().includes(query));
    if (sort === "oldest") events.sort((a, b) => a.timestamp - b.timestamp);
    else if (sort === "severity") events.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.timestamp - a.timestamp);
    else events.sort((a, b) => b.timestamp - a.timestamp);
    return { events: events.slice(0, limit), total: events.length, hasMore: events.length > limit };
}

export async function queryEventLog(options: EventLogQuery): Promise<EventLogQueryResult> {
    if (!Native) return memoryQuery(options);
    try { return await Native.queryEvents(options) as EventLogQueryResult; }
    catch { return memoryQuery(options); }
}

export async function clearEventLog(): Promise<void> {
    memoryEvents.length = 0;
    if (Native) {
        try { await Native.clearEvents(); } catch { }
    }
    notify();
}

export async function openEventLogFolder(): Promise<void> {
    if (!Native) return;
    try { await Native.openLogFolder(); } catch { }
}

export async function getEventLogInfo(): Promise<{ path: string; size: number; }> {
    if (!Native) return { path: "Memory only", size: 0 };
    try { return await Native.getLogInfo(); }
    catch { return { path: "Unavailable", size: 0 }; }
}

export function subscribeEventLog(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function captureConsole(level: typeof consoleLevels[number], args: unknown[]): void {
    const source = consoleEventSource(args);
    if (!source) return;
    const text = consoleArgsToText(args);
    const classified = classifyConsoleEvent(source, level, text);
    void recordQuestUIEvent({
        source,
        severity: classified.severity,
        eventCode: classified.eventCode,
        summary: classified.summary,
        quest: classified.questName ? { name: classified.questName } : null,
        detail: classified.detail,
        captureSource: "console-preview"
    });
}

export function startEventLogCapture(): void {
    if (captureStarted) return;
    captureStarted = true;

    for (const level of consoleLevels) {
        const original = console[level].bind(console) as (...args: any[]) => void;
        originals.set(level, original);
        (console as any)[level] = (...args: any[]) => {
            original(...args);
            try { captureConsole(level, args); } catch { }
        };
    }

    void recordQuestUIEvent({ severity: "info", eventCode: "QUESTUI_EVENT_LOG_STARTED", summary: "Event Log preview started" });
}

export function stopEventLogCapture(): void {
    if (!captureStarted) return;
    captureStarted = false;
    for (const level of consoleLevels) {
        const original = originals.get(level);
        if (original) (console as any)[level] = original;
    }
    originals.clear();
}
