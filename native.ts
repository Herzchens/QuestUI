import { app, IpcMainInvokeEvent, shell } from "electron";
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { join } from "path";

import { eventSearchText, inferEventCategory } from "./eventLogLogic";

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const COMPACT_TO_BYTES = 5 * 1024 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;

function vencordDataDir(): string {
    if (process.env.VENCORD_USER_DATA_DIR) return process.env.VENCORD_USER_DATA_DIR;
    if (process.env.DISCORD_USER_DATA_DIR) return join(process.env.DISCORD_USER_DATA_DIR, "..", "VencordData");
    return join(app.getPath("userData"), "..", "Vencord");
}

const LOG_DIR = join(vencordDataDir(), "QuestUI");
const LOG_FILE = join(LOG_DIR, "events.jsonl");
const TEMP_FILE = join(LOG_DIR, "events.tmp");
let writeChain: Promise<void> = Promise.resolve();

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

function safeParse(line: string): any | null {
    try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function severityRank(severity: string): number {
    if (severity === "error") return 0;
    if (severity === "warning") return 1;
    if (severity === "success") return 2;
    return 3;
}

export async function queryEvents(_: IpcMainInvokeEvent, options: any = {}): Promise<{ events: any[]; total: number; hasMore: boolean; }> {
    await writeChain;
    let text = "";
    try { text = await readFile(LOG_FILE, "utf8"); } catch { }

    const query = typeof options.query === "string" ? options.query.trim().toLowerCase() : "";
    const source = options.source === "orion" || options.source === "questui" ? options.source : "all";
    const severity = ["info", "success", "warning", "error"].includes(options.severity) ? options.severity : "all";
    const category = ["quest", "runtime", "network", "diagnostic"].includes(options.category) ? options.category : "all";
    const sort = options.sort === "oldest" || options.sort === "severity" ? options.sort : "newest";
    const limit = Math.max(1, Math.min(5000, Number(options.limit) || 200));

    let events = text.split(/\r?\n/).filter(Boolean).map(safeParse).filter(Boolean);
    events = events.map(event => ({ ...event, category: inferEventCategory(event) }));
    if (source !== "all") events = events.filter(event => event.source === source);
    if (severity !== "all") events = events.filter(event => event.severity === severity);
    if (category !== "all") events = events.filter(event => event.category === category);
    if (query) events = events.filter(event => eventSearchText(event).includes(query));

    if (sort === "oldest") events.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    else if (sort === "severity") events.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || Number(b.timestamp) - Number(a.timestamp));
    else events.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

    const total = events.length;
    return { events: events.slice(0, limit), total, hasMore: total > limit };
}

export async function clearEvents(_: IpcMainInvokeEvent): Promise<void> {
    await writeChain;
    await ensureLogDir();
    await writeFile(LOG_FILE, "", "utf8");
}

export async function getLogInfo(_: IpcMainInvokeEvent): Promise<{ path: string; size: number; }> {
    await writeChain;
    let size = 0;
    try { size = (await stat(LOG_FILE)).size; } catch { }
    return { path: LOG_FILE, size };
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
