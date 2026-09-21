import * as DataStore from "@api/DataStore";
import { UserStore, useEffect, useState, useStateFromStores } from "@webpack/common";

import {
    ignoredQuestIdsForAccount,
    normalizeIgnoredQuestState,
    pruneIgnoredQuestState,
    updateIgnoredQuestState,
    type IgnoredQuestState
} from "./ignoredQuestLogic";
import { QuestsStore } from "./stores";

const DATA_STORE_KEY = "QuestUI:ignored-quests:v1";

const listeners = new Set<() => void>();
let cachedState: IgnoredQuestState | null = null;
let loadPromise: Promise<IgnoredQuestState> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let questStoreSubscribed = false;
let userStoreSubscribed = false;
let expirySweepTimer: ReturnType<typeof setInterval> | null = null;

function notify(): void {
    for (const listener of listeners) listener();
}

function currentAccountId(): string | null {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id.trim() ? id : null;
    } catch {
        return null;
    }
}

function rawQuestValues(): any[] {
    const quests = QuestsStore?.quests;
    if (!quests) return [];

    const values = typeof quests.values === "function"
        ? Array.from(quests.values())
        : Array.isArray(quests)
            ? quests
            : Object.values(quests);

    return values.map((quest: any) => {
        const id = quest?.id;
        if (!id || typeof QuestsStore?.getQuest !== "function") return quest;
        try { return QuestsStore.getQuest(id) ?? quest; }
        catch { return quest; }
    });
}

function expiredQuestIds(now = Date.now()): ReadonlySet<string> {
    const expired = new Set<string>();
    for (const quest of rawQuestValues()) {
        const id = String(quest?.id ?? quest?.config?.id ?? "").trim();
        if (!id) continue;

        const expiresAt = new Date(quest?.config?.expiresAt ?? 0).getTime();
        if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= now) expired.add(id);
    }
    return expired;
}

async function loadState(): Promise<IgnoredQuestState> {
    if (cachedState) return cachedState;
    if (loadPromise) return loadPromise;

    loadPromise = DataStore.get(DATA_STORE_KEY)
        .then(value => normalizeIgnoredQuestState(value))
        .catch(() => normalizeIgnoredQuestState(null))
        .then(state => {
            cachedState = state;
            loadPromise = null;
            notify();
            return state;
        });
    return loadPromise;
}

export function preloadIgnoredQuests(): void {
    void loadState();
}

export function subscribeIgnoredQuests(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function ignoredQuestIds(accountId = currentAccountId()): ReadonlySet<string> {
    if (!cachedState || !accountId) return new Set<string>();

    const ids = new Set(ignoredQuestIdsForAccount(cachedState, accountId));
    // Expiry is Discord-owned state. As soon as Discord reports the Quest expired,
    // Ignore stops affecting presentation even if persistence cleanup has not run yet.
    for (const questId of expiredQuestIds()) ids.delete(questId);
    return ids;
}

export function isIgnoredQuestStateReady(): boolean {
    return cachedState !== null;
}

export async function setQuestIgnored(accountId: string, questId: string, ignored: boolean): Promise<void> {
    await loadState();

    // A failed write must reject that caller without poisoning every later Ignore/Unignore action.
    // Recover the serialization chain first, then attempt the next independent mutation.
    writeChain = writeChain.catch(() => { }).then(async () => {
        const optimistic = updateIgnoredQuestState(cachedState, accountId, questId, ignored);
        cachedState = optimistic;
        notify();

        try {
            await DataStore.update<IgnoredQuestState>(DATA_STORE_KEY, stored =>
                updateIgnoredQuestState(stored, accountId, questId, ignored)
            );
            const persisted = normalizeIgnoredQuestState(await DataStore.get(DATA_STORE_KEY));
            cachedState = persisted;
        } catch {
            // Re-read the last persisted state so a failed write never leaves an in-memory lie.
            try { cachedState = normalizeIgnoredQuestState(await DataStore.get(DATA_STORE_KEY)); }
            catch { cachedState = normalizeIgnoredQuestState(null); }
            notify();
            throw new Error("QuestUI could not persist the ignored Quest preference.");
        }
        notify();
    });

    return writeChain;
}

export async function pruneExpiredIgnoredQuests(accountId = currentAccountId()): Promise<void> {
    if (!accountId) return;
    await loadState();

    const expired = expiredQuestIds();
    const staleIds = ignoredQuestIdsForAccount(cachedState, accountId).filter(id => expired.has(id));
    if (staleIds.length === 0) return;

    writeChain = writeChain.catch(() => { }).then(async () => {
        cachedState = pruneIgnoredQuestState(cachedState, accountId, staleIds);
        notify();

        try {
            await DataStore.update<IgnoredQuestState>(DATA_STORE_KEY, stored =>
                pruneIgnoredQuestState(stored, accountId, staleIds)
            );
            cachedState = normalizeIgnoredQuestState(await DataStore.get(DATA_STORE_KEY));
        } catch {
            // Expired IDs remain synchronously masked by ignoredQuestIds(). Preserve the
            // last durable store and retry cleanup on a later Quest/account/timer sweep.
            try { cachedState = normalizeIgnoredQuestState(await DataStore.get(DATA_STORE_KEY)); }
            catch { cachedState = normalizeIgnoredQuestState(null); }
        }
        notify();
    });

    await writeChain;
}

function sweepExpiredIgnoredQuests(): void {
    void pruneExpiredIgnoredQuests();
}

export function startIgnoredQuestLifecycle(): void {
    preloadIgnoredQuests();

    if (!questStoreSubscribed && typeof QuestsStore?.addChangeListener === "function") {
        try {
            QuestsStore.addChangeListener(sweepExpiredIgnoredQuests);
            questStoreSubscribed = true;
        } catch { }
    }

    if (!userStoreSubscribed && typeof (UserStore as any)?.addChangeListener === "function") {
        try {
            (UserStore as any).addChangeListener(sweepExpiredIgnoredQuests);
            userStoreSubscribed = true;
        } catch { }
    }

    if (expirySweepTimer == null) {
        expirySweepTimer = setInterval(sweepExpiredIgnoredQuests, 60_000);
    }

    void loadState().then(sweepExpiredIgnoredQuests);
}

export function stopIgnoredQuestLifecycle(): void {
    if (questStoreSubscribed) {
        try { QuestsStore?.removeChangeListener?.(sweepExpiredIgnoredQuests); } catch { }
    }
    questStoreSubscribed = false;

    if (userStoreSubscribed) {
        try { (UserStore as any)?.removeChangeListener?.(sweepExpiredIgnoredQuests); } catch { }
    }
    userStoreSubscribed = false;

    if (expirySweepTimer != null) clearInterval(expirySweepTimer);
    expirySweepTimer = null;
}

export function useIgnoredQuests(): {
    accountId: string | null;
    ready: boolean;
    ids: ReadonlySet<string>;
} {
    const accountId = useStateFromStores([UserStore], currentAccountId);
    const [, setRevision] = useState(0);

    useEffect(() => {
        preloadIgnoredQuests();
        return subscribeIgnoredQuests(() => setRevision(revision => revision + 1));
    }, []);

    return {
        accountId,
        ready: cachedState !== null,
        ids: ignoredQuestIds(accountId)
    };
}