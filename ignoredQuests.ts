import * as DataStore from "@api/DataStore";
import { UserStore, useEffect, useState, useStateFromStores } from "@webpack/common";

import {
    ignoredQuestIdsForAccount,
    normalizeIgnoredQuestState,
    updateIgnoredQuestState,
    type IgnoredQuestState
} from "./ignoredQuestLogic";

const DATA_STORE_KEY = "QuestUI:ignored-quests:v1";

const listeners = new Set<() => void>();
let cachedState: IgnoredQuestState | null = null;
let loadPromise: Promise<IgnoredQuestState> | null = null;
let writeChain: Promise<void> = Promise.resolve();

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
    return new Set(ignoredQuestIdsForAccount(cachedState, accountId));
}

export function isIgnoredQuestStateReady(): boolean {
    return cachedState !== null;
}

export async function setQuestIgnored(accountId: string, questId: string, ignored: boolean): Promise<void> {
    await loadState();

    writeChain = writeChain.then(async () => {
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
