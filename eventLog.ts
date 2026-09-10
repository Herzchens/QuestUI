import type { PluginNative } from "@utils/types";
import { UserStore } from "@webpack/common";

import { eventBelongsToAccount, eventVisibleForAccount, normalizeEventAccountId, UNAVAILABLE_ACCOUNT_SCOPE } from "./eventLogAccountLogic";
import {
    classifyConsoleEvent,
    consoleArgsToText,
    consoleEventSource,
    eventSearchText,
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
import { getOrionEventCapabilitySource } from "./orionCapabilities";
import {
    findOrionConsoleShadowMatch,
    normalizeOrionCompanionEvent,
    type NormalizedOrionEvent,
    type OrionConsoleShadowCandidate
} from "./orionEventLogic";
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

const ORION_SHADOW_DELAY_MS = 75;
const ORION_SHADOW_MATCH_WINDOW_MS = 250;
const ORION_REBIND_INTERVAL_MS = 1000;
type PendingOrionConsole = OrionConsoleShadowCandidate & {
    accountId: string | null;
    classified: ReturnType<typeof classifyConsoleEvent>;
    timer: ReturnType<typeof setTimeout>;
};
const pendingOrionConsole = new Map<number, PendingOrionConsole>();
let nextOrionConsoleId = 0;
let orionEventIdentity: object | null = null;
let orionEventMethod: Function | null = null;
let orionEventUnsubscribe: (() => void) | null = null;
let orionEventGeneration = 0;
let orionRejectedIdentity: object | null = null;
let orionRejectedMethod: Function | null = null;
let orionRebindTimer: ReturnType<typeof setInterval> | null = null;
let watchedUserStore: any = null;
let onCurrentUserChanged: (() => void) | null = null;
let knownAccountId: string | null = null;

function eventId(): string {
    try { return globalThis.crypto?.randomUUID?.() ?? `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
    catch { return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

function currentEventLogAccountId(): string | null {
    try { return normalizeEventAccountId(UserStore?.getCurrentUser?.()?.id); }
    catch { return null; }
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
    timestamp?: number;
    accountId?: string | null;
}): Promise<EventLogEvent> {
    const source = input.source ?? "questui";
    const eventCode = sanitizeEventText(input.eventCode, 120);
    const summary = sanitizeEventText(input.summary, 240);
    const suppliedTimestamp = Number(input.timestamp);
    const accountId = Object.prototype.hasOwnProperty.call(input, "accountId")
        ? normalizeEventAccountId(input.accountId)
        : currentEventLogAccountId();
    const event: EventLogEvent = {
        schemaVersion: 1,
        id: eventId(),
        timestamp: Number.isFinite(suppliedTimestamp) && suppliedTimestamp > 0 ? suppliedTimestamp : Date.now(),
        accountId,
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
    const includeLegacy = options.includeLegacy !== false;
    let events = [...memoryEvents];
    if (options.accountId) events = events.filter(event => eventVisibleForAccount(event, options.accountId!, includeLegacy));
    if (source !== "all") events = events.filter(event => event.source === source);
    if (severity !== "all") events = events.filter(event => event.severity === severity);
    if (category !== "all") events = events.filter(event => inferEventCategory(event) === category);
    if (query) events = events.filter(event => eventSearchText(event).includes(query));
    if (sort === "oldest") events.sort((a, b) => a.timestamp - b.timestamp);
    else if (sort === "severity") events.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.timestamp - a.timestamp);
    else events.sort((a, b) => b.timestamp - a.timestamp);
    return { events: events.slice(0, limit), total: events.length, hasMore: events.length > limit };
}

export async function queryEventLog(options: EventLogQuery): Promise<EventLogQueryResult> {
    const scopedOptions: EventLogQuery = {
        ...options,
        accountId: currentEventLogAccountId() ?? UNAVAILABLE_ACCOUNT_SCOPE,
        includeLegacy: options.includeLegacy !== false
    };
    if (!Native) return memoryQuery(scopedOptions);
    try { return await Native.queryEvents(scopedOptions) as EventLogQueryResult; }
    catch { return memoryQuery(scopedOptions); }
}

export async function clearEventLog(): Promise<void> {
    const accountId = currentEventLogAccountId() ?? UNAVAILABLE_ACCOUNT_SCOPE;
    // Do not let an already-captured console shadow repopulate this account's log after clear.
    // Pending shadows from a different account remain intact and keep their capture-time owner.
    clearPendingOrionConsole(false, accountId);
    for (let index = memoryEvents.length - 1; index >= 0; index--) {
        if (eventBelongsToAccount(memoryEvents[index], accountId)) memoryEvents.splice(index, 1);
    }
    if (Native) {
        try { await Native.clearEvents(accountId); } catch { }
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

function recordClassifiedOrionConsole(candidate: PendingOrionConsole): void {
    const { classified } = candidate;
    void recordQuestUIEvent({
        source: "orion",
        severity: classified.severity,
        category: classified.category,
        eventCode: classified.eventCode,
        summary: classified.summary,
        quest: classified.questName ? { name: classified.questName } : null,
        detail: classified.detail,
        captureSource: "console-preview",
        timestamp: candidate.capturedAt,
        accountId: candidate.accountId
    });
}

function flushOrionConsoleCandidate(id: number): void {
    const candidate = pendingOrionConsole.get(id);
    if (!candidate) return;
    pendingOrionConsole.delete(id);
    recordClassifiedOrionConsole(candidate);
}

function clearPendingOrionConsole(flush: boolean, accountId?: string): void {
    for (const [id, candidate] of pendingOrionConsole) {
        if (accountId != null && candidate.accountId !== accountId) continue;
        clearTimeout(candidate.timer);
        pendingOrionConsole.delete(id);
        if (flush) recordClassifiedOrionConsole(candidate);
    }
}

function queueOrionConsoleCandidate(level: ConsoleLevel, text: string): void {
    const classified = classifyConsoleEvent("orion", level, text);
    const id = ++nextOrionConsoleId;
    const capturedAt = Date.now();
    const timer = setTimeout(() => flushOrionConsoleCandidate(id), ORION_SHADOW_DELAY_MS);
    pendingOrionConsole.set(id, {
        id,
        capturedAt,
        accountId: currentEventLogAccountId(),
        eventCode: classified.eventCode,
        severity: classified.severity,
        category: classified.category,
        questName: classified.questName ?? null,
        rawConsole: text,
        classified,
        timer
    });
}

function recordStructuredOrionEvent(event: NormalizedOrionEvent): void {
    const matched = findOrionConsoleShadowMatch(event, Array.from(pendingOrionConsole.values()), ORION_SHADOW_MATCH_WINDOW_MS);
    if (matched) {
        const pending = pendingOrionConsole.get(matched.id);
        if (pending) clearTimeout(pending.timer);
        pendingOrionConsole.delete(matched.id);
    }

    void recordQuestUIEvent({
        source: "orion",
        severity: event.severity,
        category: event.category,
        eventCode: event.eventCode,
        summary: event.summary,
        quest: event.quest,
        detail: event.detail,
        captureSource: "orion-api",
        timestamp: event.timestamp
    });
}

function detachOrionEventSource(flushPending: boolean): void {
    orionEventGeneration++;
    const unsubscribe = orionEventUnsubscribe;
    orionEventUnsubscribe = null;
    orionEventIdentity = null;
    orionEventMethod = null;
    if (unsubscribe) {
        try { unsubscribe(); } catch { }
    }
    clearPendingOrionConsole(flushPending);
}

function refreshOrionEventSource(): void {
    if (!captureStarted) return;
    const source = getOrionEventCapabilitySource();

    if (!source) {
        if (orionEventIdentity || orionEventMethod || orionEventUnsubscribe) detachOrionEventSource(true);
        orionRejectedIdentity = null;
        orionRejectedMethod = null;
        return;
    }

    if (source.identity === orionEventIdentity && source.method === orionEventMethod && orionEventUnsubscribe) return;
    if (source.identity === orionRejectedIdentity && source.method === orionRejectedMethod) return;

    if (orionEventIdentity || orionEventMethod || orionEventUnsubscribe) detachOrionEventSource(true);
    const generation = ++orionEventGeneration;

    try {
        const unsubscribe = source.subscribe(rawEvent => {
            if (!captureStarted || generation !== orionEventGeneration) return;
            const normalized = normalizeOrionCompanionEvent(rawEvent);
            if (!normalized) return;
            recordStructuredOrionEvent(normalized);
        });
        if (typeof unsubscribe !== "function") {
            // A source without a real unsubscribe cannot be rebound safely. Invalidate its callback
            // and keep console fallback until the plugin or method identity changes.
            orionEventGeneration++;
            orionRejectedIdentity = source.identity;
            orionRejectedMethod = source.method;
            return;
        }
        orionEventIdentity = source.identity;
        orionEventMethod = source.method;
        orionEventUnsubscribe = unsubscribe;
        orionRejectedIdentity = null;
        orionRejectedMethod = null;
    } catch {
        orionEventGeneration++;
        orionRejectedIdentity = source.identity;
        orionRejectedMethod = source.method;
    }
}

function reconcileEventLogAccount(): void {
    if (!captureStarted) return;
    const current = currentEventLogAccountId();
    // A transient null is not an account transition. Preserve the last confirmed identity until
    // Discord publishes a different non-null user, matching Orion's own account watcher rule.
    if (current == null) return;
    if (knownAccountId == null) {
        knownAccountId = current;
        notify();
        return;
    }
    if (current === knownAccountId) return;

    knownAccountId = current;
    // Flush old console shadows with the account captured alongside each shadow, then invalidate
    // the structured callback generation so an old subscription cannot survive the identity swap.
    if (orionEventIdentity || orionEventMethod || orionEventUnsubscribe) detachOrionEventSource(true);
    else clearPendingOrionConsole(true);
    refreshOrionEventSource();

    void recordQuestUIEvent({
        severity: "info",
        category: "diagnostic",
        eventCode: "QUESTUI_ACCOUNT_CHANGED",
        summary: "Discord account changed; Event Log switched to the current account",
        accountId: current
    });
}

function armAccountWatcher(): void {
    if (onCurrentUserChanged) return;
    knownAccountId = currentEventLogAccountId();
    const store = UserStore as any;
    if (typeof store?.addChangeListener !== "function") return;

    onCurrentUserChanged = reconcileEventLogAccount;
    watchedUserStore = store;
    watchedUserStore.addChangeListener(onCurrentUserChanged);
}

function disarmAccountWatcher(): void {
    if (onCurrentUserChanged && watchedUserStore) {
        try { watchedUserStore.removeChangeListener(onCurrentUserChanged); } catch { }
    }
    onCurrentUserChanged = null;
    watchedUserStore = null;
    knownAccountId = null;
}

function captureConsole(level: ConsoleLevel, args: unknown[]): void {
    const source = consoleEventSource(args);
    if (!source) return;
    // Structured diagnostics are optional companion capabilities, not a raised hard minimum:
    // compatible older Orion builds keep this console fallback.
    if (source === "orion") {
        const health = getOrionIntegrationHealth(true);
        if (health.kind === "version-incompatible" || health.kind === "not-installed" || health.kind === "disabled") return;
        refreshOrionEventSource();
    }
    const text = consoleArgsToText(args);
    if (source === "orion" && orionEventUnsubscribe) {
        // Structured callbacks are delivered on Orion's next microtask. Keep the human console
        // line briefly as a shadow candidate so the structured twin can replace it without a
        // duplicate; unmatched human-only lines fall back after the deadline.
        queueOrionConsoleCandidate(level, text);
        return;
    }
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

    armAccountWatcher();
    refreshOrionEventSource();
    orionRebindTimer = setInterval(() => {
        reconcileEventLogAccount();
        refreshOrionEventSource();
    }, ORION_REBIND_INTERVAL_MS);

    void recordQuestUIEvent({
        severity: "info",
        category: "diagnostic",
        eventCode: "QUESTUI_EVENT_LOG_STARTED",
        summary: "Event Log started"
    });
}

export function stopEventLogCapture(): void {
    if (!captureStarted) return;
    captureStarted = false;
    if (orionRebindTimer != null) clearInterval(orionRebindTimer);
    orionRebindTimer = null;
    disarmAccountWatcher();
    detachOrionEventSource(false);
    orionRejectedIdentity = null;
    orionRejectedMethod = null;

    for (const level of consoleLevels) {
        const original = originals.get(level);
        const wrapper = wrappers.get(level);
        // Do not clobber a console wrapper installed by another plugin after QuestUI started.
        if (original && wrapper && (console as any)[level] === wrapper) (console as any)[level] = original;
    }
    originals.clear();
    wrappers.clear();
}
