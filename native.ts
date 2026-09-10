import { app, IpcMainInvokeEvent, shell } from "electron";
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { join } from "path";

import { eventBelongsToAccount, eventVisibleForAccount } from "./eventLogAccountLogic";
import { eventSearchText, inferEventCategory } from "./eventLogLogic";
import {
    pageSortedEventLogEvents,
    sortEventLogEvents,
    type EventLogPageQuery,
    type EventLogPageResult
} from "./eventLogPaginationLogic";
import type { EventLogEvent, EventLogSort } from "./eventLogTypes";
import { normalizePersistedEvent } from "./eventLogValidation";

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const COMPACT_TO_BYTES = 5 * 1024 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_PAGE_SESSIONS = 3;
const PAGE_SESSION_TTL_MS = 15 * 60 * 1000;

function vencordDataDir(): string {
    if (process.env.VENCORD_USER_DATA_DIR) return process.env.VENCORD_USER_DATA_DIR;
    if (process.env.DISCORD_USER_DATA_DIR) return join(process.env.DISCORD_USER_DATA_DIR, "..", "VencordData");
    return join(app.getPath("userData"), "..", "Vencord");
}

const LOG_DIR = join(vencordDataDir(), "QuestUI");
const LOG_FILE = join(LOG_DIR, "events.jsonl");
const TEMP_FILE = join(LOG_DIR, "events.tmp");
let writeChain: Promise<void> = Promise.resolve();
let nextPageSessionId = 0;

interface NormalizedQueryOptions {
    query: string;
    source: "all" | "orion" | "questui";
    severity: "all" | "info" | "success" | "warning" | "error";
    category: "all" | "quest" | "runtime" | "network" | "diagnostic";
    sort: EventLogSort;
    accountId: string | null;
    includeLegacy: boolean;
}

interface PageSession {
    id: string;
    signature: string;
    sort: EventLogSort;
    events: EventLogEvent[];
    createdAt: number;
    lastAccess: number;
}

const pageSessions = new Map<string, PageSession>();

function invalidatePageSessions(): void {
    pageSessions.clear();
}

function prunePageSessions(now = Date.now()): void {
    for (const [id, session] of pageSessions) {
        if (now - session.lastAccess > PAGE_SESSION_TTL_MS) pageSessions.delete(id);
    }
    while (pageSessions.size > MAX_PAGE_SESSIONS) {
        let oldestId: string | null = null;
        let oldestAccess = Number.POSITIVE_INFINITY;
        for (const [id, session] of pageSessions) {
            if (session.lastAccess < oldestAccess) {
                oldestAccess = session.lastAccess;
                oldestId = id;
            }
        }
        if (!oldestId) break;
        pageSessions.delete(oldestId);
    }
}

async function ensureLogDir(): Promise<void> {
    await mkdir(LOG_DIR, { recursive: true });
}

async function compactIfNeeded(): Promise<void> {
    let info;
    try { info = await stat(LOG_FILE); } catch { return; }
    if (info.size <= MAX_LOG_BYTES) return;

    const buffer = await readFile(LOG_FILE);
    let start = Math.max(0, buffer.length - COMPACT_TO_BYTES);
    if (start > 0) {
        const nextNewline = buffer.indexOf(0x0a, start);
        start = nextNewline >= 0 ? nextNewline + 1 : buffer.length;
    }
    const kept = buffer.subarray(start);
    await writeFile(TEMP_FILE, kept);
    try {
        await rename(TEMP_FILE, LOG_FILE);
    } catch {
        await rm(LOG_FILE, { force: true });
        await rename(TEMP_FILE, LOG_FILE);
    }
    invalidatePageSessions();
}

export async function appendEvent(_: IpcMainInvokeEvent, serialized: string): Promise<void> {
    if (typeof serialized !== "string" || !serialized.trim()) return;
    if (Buffer.byteLength(serialized, "utf8") > MAX_EVENT_BYTES) return;

    writeChain = writeChain.then(async () => {
        await ensureLogDir();
        await appendFile(LOG_FILE, serialized.endsWith("\n") ? serialized : `${serialized}\n`, "utf8");
        await compactIfNeeded();
    }).catch(() => undefined);
    await writeChain;
}

function safeParse(line: string): EventLogEvent | null {
    try {
        return normalizePersistedEvent(JSON.parse(line));
    } catch {
        return null;
    }
}

function normalizeQueryOptions(options: any = {}): NormalizedQueryOptions {
    return {
        query: typeof options.query === "string" ? options.query.trim().toLowerCase() : "",
        source: options.source === "orion" || options.source === "questui" ? options.source : "all",
        severity: ["info", "success", "warning", "error"].includes(options.severity) ? options.severity : "all",
        category: ["quest", "runtime", "network", "diagnostic"].includes(options.category) ? options.category : "all",
        sort: options.sort === "oldest" || options.sort === "severity" ? options.sort : "newest",
        accountId: typeof options.accountId === "string" && options.accountId.length > 0 ? options.accountId : null,
        includeLegacy: options.includeLegacy !== false
    };
}

function querySignature(options: NormalizedQueryOptions): string {
    return JSON.stringify([
        options.query,
        options.source,
        options.severity,
        options.category,
        options.sort,
        options.accountId,
        options.includeLegacy
    ]);
}

function filterAndSortEvents(text: string, options: NormalizedQueryOptions): EventLogEvent[] {
    const events: EventLogEvent[] = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        const event = safeParse(line);
        if (!event) continue;
        events.push({ ...event, category: inferEventCategory(event) });
    }

    let filtered = events;
    if (options.accountId) filtered = filtered.filter(event => eventVisibleForAccount(event, options.accountId!, options.includeLegacy));
    if (options.source !== "all") filtered = filtered.filter(event => event.source === options.source);
    if (options.severity !== "all") filtered = filtered.filter(event => event.severity === options.severity);
    if (options.category !== "all") filtered = filtered.filter(event => event.category === options.category);
    if (options.query) filtered = filtered.filter(event => eventSearchText(event).includes(options.query));
    return sortEventLogEvents(filtered, options.sort);
}

async function readPreparedEvents(options: NormalizedQueryOptions): Promise<EventLogEvent[]> {
    await writeChain;
    let text = "";
    try { text = await readFile(LOG_FILE, "utf8"); } catch { }
    return filterAndSortEvents(text, options);
}

export async function queryEvents(_: IpcMainInvokeEvent, options: any = {}): Promise<{ events: EventLogEvent[]; total: number; hasMore: boolean; }> {
    const normalized = normalizeQueryOptions(options);
    const limit = Math.max(1, Math.min(5000, Number(options.limit) || 200));
    const events = await readPreparedEvents(normalized);
    return { events: events.slice(0, limit), total: events.length, hasMore: events.length > limit };
}

function newPageSession(signature: string, sort: EventLogSort, events: EventLogEvent[]): PageSession {
    const now = Date.now();
    const id = `page-${now.toString(36)}-${(++nextPageSessionId).toString(36)}`;
    const session: PageSession = { id, signature, sort, events, createdAt: now, lastAccess: now };
    pageSessions.set(id, session);
    prunePageSessions(now);
    return session;
}

export async function queryEventPage(_: IpcMainInvokeEvent, rawOptions: EventLogPageQuery = {}): Promise<EventLogPageResult> {
    const normalized = normalizeQueryOptions(rawOptions);
    const signature = querySignature(normalized);
    const requestedSessionId = typeof rawOptions.sessionId === "string" && rawOptions.sessionId ? rawOptions.sessionId : null;
    let session: PageSession | undefined;

    prunePageSessions();
    if (requestedSessionId) {
        session = pageSessions.get(requestedSessionId);
        if (!session || session.signature !== signature || session.sort !== normalized.sort) {
            return { events: [], total: 0, hasMore: false, nextCursor: null, sessionId: null, stale: true };
        }
        session.lastAccess = Date.now();
    } else {
        const events = await readPreparedEvents(normalized);
        session = newPageSession(signature, normalized.sort, events);
    }

    const page = pageSortedEventLogEvents(session.events, session.sort, rawOptions.pageSize ?? 250, rawOptions.cursor);
    if (page.stale) {
        return {
            events: [],
            total: session.events.length,
            hasMore: false,
            nextCursor: null,
            sessionId: session.id,
            stale: true
        };
    }

    return {
        events: page.events,
        total: session.events.length,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        sessionId: session.id,
        stale: false
    };
}

export async function clearEvents(_: IpcMainInvokeEvent, accountId?: string): Promise<void> {
    if (typeof accountId !== "string" || accountId.length === 0) return;

    writeChain = writeChain.then(async () => {
        await ensureLogDir();
        let text = "";
        try { text = await readFile(LOG_FILE, "utf8"); } catch { }

        const kept: string[] = [];
        for (const line of text.split(/\r?\n/)) {
            if (!line) continue;
            const event = safeParse(line);
            if (!event || !eventBelongsToAccount(event, accountId)) kept.push(line);
        }
        await writeFile(LOG_FILE, kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf8");
        invalidatePageSessions();
    }).catch(() => undefined);
    await writeChain;
}

export async function getLogInfo(_: IpcMainInvokeEvent): Promise<{
    path: string;
    size: number;
    maxBytes: number;
    compactToBytes: number;
}> {
    await writeChain;
    let size = 0;
    try { size = (await stat(LOG_FILE)).size; } catch { }
    return {
        path: LOG_FILE,
        size,
        maxBytes: MAX_LOG_BYTES,
        compactToBytes: COMPACT_TO_BYTES
    };
}

export async function openLogFolder(_: IpcMainInvokeEvent): Promise<void> {
    await ensureLogDir();
    try {
        await stat(LOG_FILE);
        shell.showItemInFolder(LOG_FILE);
    } catch {
        await shell.openPath(LOG_DIR);
    }
}
