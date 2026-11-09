import * as DataStore from "@api/DataStore";
import { UserStore } from "@webpack/common";

import { recordQuestUIEvent } from "../../eventLog/runtime";
import { isIgnoredQuestStateReady } from "../ignored/runtime";
import { nextQuestAutoReloadDelay, normalizeQuestAutoReloadMinutes } from "./autoLogic";
import { reloadQuestList } from "./native";

interface QuestAutoReloadPreferences {
    enabled: boolean;
    intervalMinutes: number;
}

interface PersistedQuestAutoReloadState {
    version: 1;
    lastSuccessfulReloadAt: number | null;
}

const DATA_STORE_KEY = "QuestUI:quest-auto-reload:v1";
const READY_RETRY_MS = 1_000;

let preferenceReader: (() => QuestAutoReloadPreferences) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let loadPromise: Promise<void> | null = null;
let persistedReady = false;
let lastSuccessfulReloadAt: number | null = null;
let lastAutoAttemptAt: number | null = null;
let currentAccountId: string | null = null;
let userStoreSubscribed = false;

function finiteTimestamp(value: unknown): number | null {
    if (value == null || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizePersistedState(value: unknown): PersistedQuestAutoReloadState {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { version: 1, lastSuccessfulReloadAt: null };
    }
    const raw = value as Record<string, unknown>;
    return { version: 1, lastSuccessfulReloadAt: finiteTimestamp(raw.lastSuccessfulReloadAt) };
}

async function ensurePersistedState(): Promise<void> {
    if (persistedReady) return;
    if (loadPromise) return loadPromise;

    loadPromise = DataStore.get(DATA_STORE_KEY)
        .then(value => { lastSuccessfulReloadAt = normalizePersistedState(value).lastSuccessfulReloadAt; })
        .catch(() => { lastSuccessfulReloadAt = null; })
        .then(() => {
            persistedReady = true;
            loadPromise = null;
        });

    return loadPromise;
}

function readPreferences(): QuestAutoReloadPreferences {
    const raw = preferenceReader?.() ?? { enabled: true, intervalMinutes: 300 };
    return {
        enabled: raw.enabled !== false,
        intervalMinutes: normalizeQuestAutoReloadMinutes(raw.intervalMinutes)
    };
}

function accountId(): string | null {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id.trim() ? id : null;
    } catch {
        return null;
    }
}

function clearTimer(): void {
    if (timer != null) clearTimeout(timer);
    timer = null;
}

function scheduleAfter(delayMs: number): void {
    clearTimer();
    if (!started || !readPreferences().enabled) return;
    timer = setTimeout(() => {
        timer = null;
        void runScheduledReload();
    }, Math.max(250, delayMs));
}

function scheduleNext(): void {
    clearTimer();
    if (!started || !preferenceReader) return;

    const preferences = readPreferences();
    if (!preferences.enabled) return;

    scheduleAfter(nextQuestAutoReloadDelay(
        lastSuccessfulReloadAt,
        lastAutoAttemptAt,
        Date.now(),
        preferences.intervalMinutes
    ));
}

async function persistSuccessfulReload(timestamp: number): Promise<void> {
    try {
        await DataStore.update<PersistedQuestAutoReloadState>(
            DATA_STORE_KEY,
            () => ({ version: 1, lastSuccessfulReloadAt: timestamp })
        );
    } catch {
        // Persistence is scheduling metadata only. Do not turn a successful native fetch into failure.
    }
}

export async function markQuestReloadSuccessful(timestamp = Date.now()): Promise<void> {
    const normalized = finiteTimestamp(timestamp);
    if (normalized == null) return;

    lastSuccessfulReloadAt = normalized;
    await persistSuccessfulReload(normalized);
    if (started) scheduleNext();
}

async function runScheduledReload(): Promise<void> {
    if (!started) return;

    const preferences = readPreferences();
    if (!preferences.enabled) return;

    if (!accountId() || !isIgnoredQuestStateReady()) {
        scheduleAfter(READY_RETRY_MS);
        return;
    }

    lastAutoAttemptAt = Date.now();

    try {
        await reloadQuestList();
        await markQuestReloadSuccessful(Date.now());
    } catch (error) {
        if (started) {
            void recordQuestUIEvent({
                severity: "error",
                eventCode: "QUEST_AUTO_RELOAD_FAILED",
                summary: "Background Quest list refresh failed",
                detail: {
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack ?? null : null
                }
            });
        }
        scheduleNext();
    }
}

function onAccountChanged(): void {
    const next = accountId();
    if (next === currentAccountId) return;
    currentAccountId = next;

    if (!started || !readPreferences().enabled || next == null) return;
    lastAutoAttemptAt = null;
    scheduleAfter(READY_RETRY_MS);
}

export function notifyQuestAutoReloadSettingsChanged(): void {
    if (!started) return;
    void ensurePersistedState().then(scheduleNext);
}

export function startQuestAutoReload(readPreferences: () => QuestAutoReloadPreferences): void {
    preferenceReader = readPreferences;
    started = true;
    currentAccountId = accountId();
    lastAutoAttemptAt = null;

    if (!userStoreSubscribed && typeof (UserStore as any)?.addChangeListener === "function") {
        try {
            (UserStore as any).addChangeListener(onAccountChanged);
            userStoreSubscribed = true;
        } catch { }
    }

    void ensurePersistedState().then(scheduleNext);
}

export function stopQuestAutoReload(): void {
    started = false;
    clearTimer();

    if (userStoreSubscribed) {
        try { (UserStore as any)?.removeChangeListener?.(onAccountChanged); } catch { }
    }
    userStoreSubscribed = false;

    preferenceReader = null;
    currentAccountId = null;
    lastAutoAttemptAt = null;
}
