import type { PluginNative } from "@utils/types";

import {
    classifyConsoleEvent,
    consoleArgsToText,
    consoleEventSource,
    inferEventCategory,
    sanitizeEventText,
    severityRank
} from "./eventLogLogic";
import type {
    EventLogCategory,
    EventLogEvent,
    EventLogQuery,
    EventLogQueryResult,
    EventLogSource,
    EventLogSeverity
} from "./eventLogTypes";
import { getOrionIntegrationHealth } from "./orionIntegration";

const Native = !IS_WEB
    ? VencordNative.pluginHelpers.QuestUI as PluginNative<typeof import("./native")>
    : null;

const memoryEvents: EventLogEvent[] = [];
const listeners = new Set<() => void>();
const consoleLevels = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleLevel = typeof consoleLevels[number];
type ConsoleMethod = (...args: any[]) => void;
const originals = new Map<ConsoleLevel, ConsoleMethod>();
const wrappers = new Map<ConsoleLevel, ConsoleMethod>();
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
    category?: EventLogCategory;
    eventCode: string;
    summary: string;
    quest?: { id?: string | null; name?: string | null; taskType?: string | null; } | null;
    detail?: Record<string, unknown> | null;
    captureSource?: EventLogEvent["captureSource"];
}): Promise<EventLogEvent> {
    const source = input.source ?? "questui";
    const eventCode = sanitizeEventText(input.eventCode, 120);
    const summary = sanitizeEventText(input.summary, 240);
    const event: EventLogEvent = {
        schemaVersion: 1,
        id: eventId(),
        timestamp: Date.now(),
        source,
        severity: input.severity,
        category: input.category ?? inferEventCategory({ source, eventCode, summary }),
        captureSource: input.captureSource ?? "questui",
        eventCode,
        summary,
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
    const category = options.category ?? "all";
    const sort = options.sort ?? "newest";
    const limit = Math.max(1, Math.min(5000, options.limit ?? 200));
    let events = [...memoryEvents];
    if (source !== "all") events = events.filter(event => event.source === source);
    if (severity !== "all") events = events.filter(event => event.severity === severity);
    if (category !== "all") events = events.filter(event => inferEventCategory(event) === category);
    if (query) events = events.filter(event => JSON.stringify({
        source: event.source,
        severity: event.severity,
        category: inferEventCategory(event),
        eventCode: event.eventCode,
        summary: event.summary,
        quest: event.quest,
        detail: event.detail
    }).toLowerCase().includes(query));
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

function captureConsole(level: ConsoleLevel, args: unknown[]): void {
    const source = consoleEventSource(args);
    if (!source) return;
    // v4.10.7 remains the only hard floor. Future structured APIs are capabilities, not a new
    // minimum: compatible older Orion builds keep this console-preview fallback.
    if (source === "orion") {
        const health = getOrionIntegrationHealth(true);
        if (health.kind === "version-incompatible" || health.kind === "not-installed" || health.kind === "disabled") return;
    }
    const text = consoleArgsToText(args);
    const classified = classifyConsoleEvent(source, level, text);
    void recordQuestUIEvent({
        source,
        severity: classified.severity,
        category: classified.category,
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
        const original = console[level] as ConsoleMethod;
        const wrapper: ConsoleMethod = (...args: any[]) => {
            original.apply(console, args);
            try { captureConsole(level, args); } catch { }
        };
        originals.set(level, original);
        wrappers.set(level, wrapper);
        (console as any)[level] = wrapper;
    }

    void recordQuestUIEvent({
        severity: "info",
        category: "diagnostic",
        eventCode: "QUESTUI_EVENT_LOG_STARTED",
        summary: "Event Log preview started"
    });
}

export function stopEventLogCapture(): void {
    if (!captureStarted) return;
    captureStarted = false;
    for (const level of consoleLevels) {
        const original = originals.get(level);
        const wrapper = wrappers.get(level);
        // Do not clobber a console wrapper installed by another plugin after QuestUI started.
        if (original && wrapper && (console as any)[level] === wrapper) (console as any)[level] = original;
    }
    originals.clear();
    wrappers.clear();
}
