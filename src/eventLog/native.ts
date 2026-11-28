import { app, IpcMainInvokeEvent, shell } from "electron";
import { constants } from "fs";
import { lstat, mkdir, open, readFile, stat } from "fs/promises";
import { join } from "path";

import { collectEventAccountUsernames, eventBelongsToAccount, eventMatchesAccountScopes, eventVisibleForAccount } from "./account";
import { eventSearchText, inferEventCategory } from "./logic";
import {
    pageSortedEventLogEvents,
    sortEventLogEvents,
    type EventLogPageQuery,
    type EventLogPageResult
} from "./pagination";
import type { EventLogAccountScope, EventLogCategory, EventLogEvent, EventLogSeverity, EventLogSort } from "./types";
import { normalizePersistedEvent } from "./validation";
import { assertRegularLogPath, readLogText, replaceLogFile } from "./storage";
import { createPageSessionStore } from "./sessionStore";
import { createOrderedReadBatch } from "./orderedReadBatch";


const MAX_LOG_BYTES = 10 * 1024 * 1024;
const COMPACT_TO_BYTES = 5 * 1024 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_PENDING_WRITE_BYTES = 4 * 1024 * 1024;
const MAX_PENDING_WRITES = 512;
let pendingWriteBytes = 0;
let pendingWrites = 0;
let rejectedAppends = 0;
interface AppendBatch { lines: string[]; promise: Promise<void>; }
let appendBatch: AppendBatch | null = null;
const sealAppendBatch = () => { appendBatch = null; };
const MAX_PAGE_SESSIONS = 3;
const PAGE_SESSION_TTL_MS = 15 * 60 * 1000;

function vencordDataDir(): string {
    if (process.env.VENCORD_USER_DATA_DIR) return process.env.VENCORD_USER_DATA_DIR;
    if (process.env.DISCORD_USER_DATA_DIR) return join(process.env.DISCORD_USER_DATA_DIR, "..", "VencordData");
    return join(app.getPath("userData"), "..", "Vencord");
}

const LOG_DIR = join(vencordDataDir(), "QuestUI");
const LOG_FILE = join(LOG_DIR, "events.jsonl");
let writeChain: Promise<void> = Promise.resolve();
let storageGeneration = 0;

function enqueueStorage<T>(work: () => Promise<T>): Promise<T> {
    const result = writeChain.then(work);
    // Keep the queue usable after a failure, but reject the actual caller.
    writeChain = result.then(() => undefined, () => undefined);
    return result;
}
const readBatch = createOrderedReadBatch(enqueueStorage, async () => ({
    snapshot: prepareSnapshot(await readLogText(LOG_FILE)),
    generation: storageGeneration
}));
const pendingPrepared = new Map<Promise<{ snapshot: PreparedSnapshot; generation: number; }>, Map<string, Promise<{ events: EventLogEvent[]; generation: number; }>>>();
const MAX_PENDING_READ_IDENTITIES = 16;
let pendingReadIdentities = 0;
let nextPageSessionId = 0;

interface NormalizedQueryOptions {
    query: string;
    source: "all" | "orion" | "questui";
    severity: "all" | EventLogSeverity[];
    category: "all" | EventLogCategory[];
    sort: EventLogSort;
    accountScope: "all" | EventLogAccountScope[];
    currentAccountId: string | null;
    accountId: string | null;
    includeLegacy: boolean;
}

interface PageSession {
    id: string;
    signature: string;
    sort: EventLogSort;
    events: EventLogEvent[];
}

const pageSessions = createPageSessionStore<PageSession>(MAX_PAGE_SESSIONS, PAGE_SESSION_TTL_MS);

function invalidatePageSessions(): void {
    storageGeneration++;
    pageSessions.clear();
}

export async function releaseEventPageSession(_: IpcMainInvokeEvent, sessionId: string): Promise<void> {
    if (typeof sessionId === "string") pageSessions.delete(sessionId);
}

async function ensureLogDir(): Promise<void> {
    await mkdir(LOG_DIR, { recursive: true, mode: 0o700 });
    if (!(await lstat(LOG_DIR)).isDirectory()) throw new Error("Event Log directory is not a real directory.");
}

async function compactIfNeeded(): Promise<void> {
    let info;
    try {
        if (!await assertRegularLogPath(LOG_FILE)) return;
        info = await stat(LOG_FILE);
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
        throw error;
    }
    if (info.size <= MAX_LOG_BYTES) return;

    const buffer = await readFile(LOG_FILE);
    let start = Math.max(0, buffer.length - COMPACT_TO_BYTES);
    if (start > 0) {
        const nextNewline = buffer.indexOf(0x0a, start);
        start = nextNewline >= 0 ? nextNewline + 1 : buffer.length;
    }
    const kept = buffer.subarray(start);
    await replaceLogFile(LOG_FILE, kept);
    invalidatePageSessions();
}

export async function appendEvent(_: IpcMainInvokeEvent, serialized: string): Promise<void> {
    if (typeof serialized !== "string" || !serialized.trim() || Buffer.byteLength(serialized, "utf8") > MAX_EVENT_BYTES) {
        rejectedAppends++;
        throw new Error("Invalid Event Log record.");
    }
    // One IPC request represents exactly one validated, canonical JSONL event.
    const event = safeParse(serialized, true);
    if (!event) {
        rejectedAppends++;
        throw new Error("Invalid Event Log record.");
    }
    const line = JSON.stringify(event) + "\n";
    const bytes = Buffer.byteLength(line, "utf8");
    if (bytes > MAX_EVENT_BYTES || pendingWrites >= MAX_PENDING_WRITES || pendingWriteBytes + bytes > MAX_PENDING_WRITE_BYTES) {
        rejectedAppends++;
        throw new Error("Event Log write capacity exceeded.");
    }
    pendingWrites++;
    pendingWriteBytes += bytes;
    readBatch.invalidate();

    if (!appendBatch) {
        const batch: AppendBatch = { lines: [], promise: Promise.resolve() };
        // Appends submitted before a read/mutation barrier or dispatch share I/O.
        batch.promise = enqueueStorage(async () => {
            if (appendBatch === batch) sealAppendBatch();
            await ensureLogDir();
            await assertRegularLogPath(LOG_FILE);
            const file = await open(LOG_FILE, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600);
            try {
                if (!(await file.stat()).isFile()) throw new Error("Event Log is not a regular file.");
                await file.appendFile(batch.lines.join(""), "utf8");
            } finally { await file.close(); }
            await compactIfNeeded();
        });
        appendBatch = batch;
    }
    const batch = appendBatch;
    batch.lines.push(line);
    try { await batch.promise; }
    catch (error) { rejectedAppends++; throw error; }
    finally { pendingWrites--; pendingWriteBytes -= bytes; }
}

function safeParse(line: string, requireSchema = false): EventLogEvent | null {
    try {
        if (Buffer.byteLength(line, "utf8") > MAX_EVENT_BYTES) return null;
        const parsed = JSON.parse(line);
        if (requireSchema && parsed?.schemaVersion !== 1) return null;
        return normalizePersistedEvent(parsed);
    } catch {
        return null;
    }
}

function normalizeSelection<T extends string>(value: unknown, allowed: readonly T[]): "all" | T[] {
    if (value === "all" || value == null) return "all";
    const input = Array.isArray(value) ? value.slice(0, 16) : [value];
    const selected = allowed.filter(item => input.includes(item));
    if (selected.length === allowed.length) return "all";
    if (!Array.isArray(value) && selected.length === 0) return "all";
    return selected;
}

function normalizeQueryOptions(options: any = {}): NormalizedQueryOptions {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Invalid Event Log query.");
    return {
        query: typeof options.query === "string" ? options.query.slice(0, 512).trim().toLowerCase() : "",
        source: options.source === "orion" || options.source === "questui" ? options.source : "all",
        severity: normalizeSelection<EventLogSeverity>(options.severity, ["error", "warning", "success", "info"]),
        category: normalizeSelection<EventLogCategory>(options.category, ["quest", "runtime", "network", "diagnostic"]),
        sort: options.sort === "oldest" || options.sort === "severity" ? options.sort : "newest",
        accountScope: normalizeSelection<EventLogAccountScope>(options.accountScope, ["current", "other"]),
        currentAccountId: typeof options.currentAccountId === "string" && options.currentAccountId.length > 0 && options.currentAccountId.length <= 128 ? options.currentAccountId : null,
        accountId: typeof options.accountId === "string" && options.accountId.length > 0 && options.accountId.length <= 128 ? options.accountId : null,
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
        options.accountScope,
        options.currentAccountId,
        options.accountId,
        options.includeLegacy
    ]);
}

interface PreparedSnapshot {
    events: EventLogEvent[];
    sorted: Map<EventLogSort, EventLogEvent[]>;
    search: WeakMap<EventLogEvent, string>;
}

function prepareSnapshot(text: string): PreparedSnapshot {
    const events: EventLogEvent[] = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        const event = safeParse(line);
        if (!event) continue;
        events.push({ ...event, category: inferEventCategory(event) });
    }

    const accountNames = collectEventAccountUsernames(events);
    const enriched = events.map(event => (
        event.accountId && !event.accountUsername && accountNames.has(event.accountId)
            ? { ...event, accountUsername: accountNames.get(event.accountId)! }
            : event
    ));

    return { events: enriched, sorted: new Map(), search: new WeakMap() };
}

function filterAndSortEvents(snapshot: PreparedSnapshot, options: NormalizedQueryOptions): EventLogEvent[] {
    let ordered = snapshot.sorted.get(options.sort);
    if (!ordered) {
        ordered = sortEventLogEvents(snapshot.events, options.sort);
        snapshot.sorted.set(options.sort, ordered);
    }
    let filtered = ordered;
    if (options.accountId) filtered = filtered.filter(event => eventVisibleForAccount(event, options.accountId!, options.includeLegacy));
    if (options.accountScope !== "all") {
        filtered = filtered.filter(event => eventMatchesAccountScopes(event, options.currentAccountId, options.accountScope));
    }
    if (options.source !== "all") filtered = filtered.filter(event => event.source === options.source);
    if (options.severity !== "all") filtered = filtered.filter(event => options.severity.includes(event.severity));
    if (options.category !== "all") filtered = filtered.filter(event => options.category.includes(event.category as EventLogCategory));
    if (options.query) filtered = filtered.filter(event => {
        let text = snapshot.search.get(event);
        if (text === undefined) { text = eventSearchText(event); snapshot.search.set(event, text); }
        return text.includes(options.query);
    });
    return filtered;
}

async function readPreparedEvents(options: NormalizedQueryOptions): Promise<{ events: EventLogEvent[]; generation: number; }> {
    const signature = querySignature(options);
    const active = readBatch.peek();
    const existing = active && pendingPrepared.get(active)?.get(signature);
    if (existing) return existing;
    // Refuse excess distinct work before creating a new storage read.
    if (pendingReadIdentities >= MAX_PENDING_READ_IDENTITIES) {
        throw new Error("Event Log read capacity exceeded; retry the query.");
    }
    sealAppendBatch();
    const snapshot = readBatch.read();
    let group = pendingPrepared.get(snapshot);
    if (!group) pendingPrepared.set(snapshot, group = new Map());
    const ownedGroup = group;
    pendingReadIdentities++;
    const work = snapshot.then(({ snapshot, generation }) => ({
        events: filterAndSortEvents(snapshot, options),
        generation
    }));
    ownedGroup.set(signature, work);
    const release = () => {
        pendingReadIdentities--;
        ownedGroup.delete(signature);
        if (!ownedGroup.size) pendingPrepared.delete(snapshot);
    };
    void work.then(release, release);
    return work;
}

export async function queryEvents(_: IpcMainInvokeEvent, options: any = {}): Promise<{ events: EventLogEvent[]; total: number; hasMore: boolean; }> {
    const normalized = normalizeQueryOptions(options);
    const limit = Math.max(1, Math.min(5000, typeof options.limit === "number" && Number.isFinite(options.limit) ? Math.trunc(options.limit) || 200 : 200));
    const { events } = await readPreparedEvents(normalized);
    return { events: events.slice(0, limit), total: events.length, hasMore: events.length > limit };
}

function newPageSession(signature: string, sort: EventLogSort, events: EventLogEvent[]): PageSession {
    const now = Date.now();
    const id = `page-${now.toString(36)}-${(++nextPageSessionId).toString(36)}`;
    const session: PageSession = { id, signature, sort, events };
    pageSessions.set(id, session);
    return session;
}

export async function queryEventPage(_: IpcMainInvokeEvent, rawOptions: EventLogPageQuery = {}): Promise<EventLogPageResult> {
    const normalized = normalizeQueryOptions(rawOptions);
    const signature = querySignature(normalized);
    const requestedSessionId = typeof rawOptions.sessionId === "string" && rawOptions.sessionId ? rawOptions.sessionId : null;
    let session: PageSession | undefined;

    if (requestedSessionId) {
        session = pageSessions.get(requestedSessionId);
        if (!session || session.signature !== signature || session.sort !== normalized.sort) {
            return { events: [], total: 0, hasMore: false, nextCursor: null, sessionId: null, stale: true };
        }
    } else {
        const { events, generation } = await readPreparedEvents(normalized);
        if (generation !== storageGeneration) {
            return { events: [], total: 0, hasMore: false, nextCursor: null, sessionId: null, stale: true };
        }
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
    if (typeof accountId !== "string" || !accountId.trim() || accountId.length > 128) throw new Error("Invalid Event Log account.");

    sealAppendBatch();
    readBatch.invalidate();
    await enqueueStorage(async () => {
        await ensureLogDir();
        const text = await readLogText(LOG_FILE);

        const kept: string[] = [];
        for (const line of text.split(/\r?\n/)) {
            if (!line) continue;
            const event = safeParse(line);
            if (!event || !eventBelongsToAccount(event, accountId)) kept.push(line);
        }
        await replaceLogFile(LOG_FILE, kept.length > 0 ? `${kept.join("\n")}\n` : "");
        invalidatePageSessions();
    });
}

export async function getLogInfo(_: IpcMainInvokeEvent): Promise<{
    path: string;
    size: number;
    maxBytes: number;
    compactToBytes: number;
    rejectedAppends: number;
}> {
    await writeChain;
    let size = 0;
    try { size = (await stat(LOG_FILE)).size; } catch { }
    return {
        path: LOG_FILE,
        size,
        maxBytes: MAX_LOG_BYTES,
        compactToBytes: COMPACT_TO_BYTES,
        rejectedAppends
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
