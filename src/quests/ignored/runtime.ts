import * as DataStore from "@api/DataStore";
import { React, UserStore, useStateFromStores } from "@webpack/common";

import {
    IgnoredQuestCapacityError,
    terminalIgnoredQuestIds,
    normalizeIgnoredQuestState,
    pruneIgnoredQuestState,
    updateIgnoredQuestState,
    type IgnoredQuestState
} from "./logic";
import { QuestsStore } from "../../plugin/stores";
import { captureAccountSession, isCurrentAccountSession } from "../../plugin/accountSession";

const DATA_STORE_KEY = "QuestUI:ignored-quests:v1";
const RETRY_MS = 2000;
const EMPTY_IDS: ReadonlySet<string> = new Set<string>();
const listeners = new Set<() => void>();
let cachedState: IgnoredQuestState | null = null;
let ready = false;
let loadPromise: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryAt = 0;
let questStoreSubscribed = false;
let userStoreSubscribed = false;
let expirySweepTimer: ReturnType<typeof setInterval> | undefined;
let lifecycleStarted = false;
let startupPending = false;
let lifecycleGeneration = 0;
let sweepQueued = false;

// Only the active account needs terminal masking. Cache one shared snapshot rather
// than scanning the entire catalogue from every card, action and Orion reconciliation.
let snapshot: { accountId: string | null; ids: ReadonlySet<string>; ready: boolean; } =
    { accountId: null, ids: EMPTY_IDS, ready: false };

function currentAccountId(): string | null {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id.trim() ? id : null;
    } catch { return null; }
}

function persistedIds(accountId: string | null): readonly string[] {
    return accountId && cachedState && Object.hasOwn(cachedState.accounts, accountId)
        ? cachedState.accounts[accountId] : [];
}

function terminalIds(ids: Iterable<string>): ReadonlySet<string> {
    const quests: unknown[] = [];
    for (const id of ids) {
        try {
            const quest = QuestsStore?.getQuest?.(id);
            if (quest && String(quest.id ?? quest.config?.id) === id) quests.push(quest);
        } catch { /* Missing state must never retire an exclusion. */ }
    }
    return terminalIgnoredQuestIds(quests);
}

function refreshSnapshot(): void {
    const accountId = currentAccountId();
    const stored = persistedIds(accountId);
    const terminal = terminalIds(stored);
    const ids = stored.filter(id => !terminal.has(id));
    if (snapshot.accountId === accountId && snapshot.ready === ready
        && snapshot.ids.size === ids.length && ids.every(id => snapshot.ids.has(id))) return;
    snapshot = { accountId, ready, ids: ids.length ? new Set(ids) : EMPTY_IDS };
    for (const listener of [...listeners]) {
        try { listener(); } catch { }
    }
}

function cancelRetry(): void {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
}

function scheduleRetry(): void {
    if (!lifecycleStarted || startupPending || retryTimer !== undefined) return;
    retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (!lifecycleStarted) return;
        void loadState();
    }, Math.max(1, retryAt - Date.now()));
}

function unavailable(): void {
    // Retain the last trustworthy set for presentation, but never acknowledge it
    // as a current durable snapshot after an uncertain transaction.
    ready = false;
    retryAt = Date.now() + RETRY_MS;
    refreshSnapshot();
    scheduleRetry();
}

function loadState(): Promise<void> {
    if (ready || startupPending) return Promise.resolve();
    if (loadPromise) return loadPromise;
    if (!lifecycleStarted || Date.now() < retryAt) {
        scheduleRetry();
        return Promise.resolve();
    }
    const epoch = lifecycleGeneration;
    loadPromise = Promise.resolve().then(() => DataStore.get(DATA_STORE_KEY))
        .then(value => {
            if (!lifecycleStarted || epoch !== lifecycleGeneration) return;
            cachedState = normalizeIgnoredQuestState(value);
            ready = true;
            retryAt = 0;
            cancelRetry();
            refreshSnapshot();
            queueSweep();
        }, () => {
            if (lifecycleStarted && epoch === lifecycleGeneration) unavailable();
        }).finally(() => {
            loadPromise = null;
            if (lifecycleStarted && epoch !== lifecycleGeneration) void loadState();
        });
    return loadPromise;
}

export function preloadIgnoredQuests(): void { void loadState(); }

export function subscribeIgnoredQuests(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function ignoredQuestIds(accountId = currentAccountId()): ReadonlySet<string> {
    if (!accountId) return EMPTY_IDS;
    if (accountId === snapshot.accountId && accountId === currentAccountId()) return snapshot.ids;
    // Non-current accounts never use the current account's Discord terminal state.
    return new Set(persistedIds(accountId));
}

export function isIgnoredQuestStateReady(): boolean {
    return lifecycleStarted && ready && snapshot.accountId === currentAccountId();
}

async function persist(mutate: (stored: unknown) => IgnoredQuestState, ownsMutation: () => boolean): Promise<void> {
    let committed: IgnoredQuestState | undefined;
    let capacityError: IgnoredQuestCapacityError | undefined;
    try {
        // Vencord DataStore.update resolves only when the IndexedDB transaction
        // completes. Capture the exact written value; a redundant read-back could
        // fail after a successful commit and incorrectly erase an exclusion.
        await DataStore.update<IgnoredQuestState>(DATA_STORE_KEY, stored => {
            if (!ownsMutation()) throw new Error("Ignore transaction owner changed.");
            try { committed = mutate(stored); }
            catch (error) {
                if (error instanceof IgnoredQuestCapacityError) capacityError = error;
                throw error;
            }
            return committed;
        });
        if (!committed) throw new Error("Ignore transaction did not provide a committed value.");
    } catch {
        if (capacityError) throw capacityError;
        unavailable();
        throw new Error("QuestUI could not persist the ignored Quest preference.");
    }
    cachedState = committed;
    if (lifecycleStarted) refreshSnapshot();
}

export async function setQuestIgnored(accountId: string, questId: string, ignored: boolean): Promise<void> {
    const session = captureAccountSession();
    if (!session || session.accountId !== accountId) throw new Error("Discord account changed before Ignore.");
    const epoch = lifecycleGeneration;
    await loadState();
    const work = writeChain.catch(() => {}).then(async () => {
        if (!lifecycleStarted || epoch !== lifecycleGeneration || !isCurrentAccountSession(session)) throw new Error("Discord account changed before Ignore.");
        if (!isIgnoredQuestStateReady()) throw new Error("Ignored Quests are still loading. Try again shortly.");
        if (ignored && terminalIds([questId]).has(questId)) throw new Error("This Quest has already been claimed or expired.");
        await persist(stored => updateIgnoredQuestState(stored, accountId, questId, ignored),
            () => lifecycleStarted && epoch === lifecycleGeneration && isCurrentAccountSession(session));
        queueSweep();
    });
    writeChain = work;
    return work;
}

export async function pruneExpiredIgnoredQuests(
    accountId = currentAccountId(),
    expectedGeneration: number | null = null
): Promise<void> {
    if (!accountId || !isIgnoredQuestStateReady() || accountId !== currentAccountId()) return;
    const epoch = expectedGeneration ?? lifecycleGeneration;
    if (!terminalIds(persistedIds(accountId)).size) return;
    const work = writeChain.catch(() => {}).then(async () => {
        if (!lifecycleStarted || epoch !== lifecycleGeneration || !isIgnoredQuestStateReady() || accountId !== currentAccountId()) return;
        const terminal = terminalIds(persistedIds(accountId));
        if (!terminal.size) return;
        const session = captureAccountSession();
        if (!session || session.accountId !== accountId) return;
        await persist(stored => pruneIgnoredQuestState(stored, accountId, terminalIds(persistedIds(accountId))),
            () => lifecycleStarted && epoch === lifecycleGeneration && isCurrentAccountSession(session));
    });
    writeChain = work;
    try { await work; } catch { /* The retry path will reload durable state. */ }
}

function queueSweep(): void {
    if (!lifecycleStarted || sweepQueued) return;
    sweepQueued = true;
    const epoch = lifecycleGeneration;
    queueMicrotask(() => {
        if (epoch !== lifecycleGeneration) return;
        sweepQueued = false;
        if (lifecycleStarted) void pruneExpiredIgnoredQuests(currentAccountId(), epoch);
    });
}

function sweepExpiredIgnoredQuests(): void {
    if (!lifecycleStarted) return;
    refreshSnapshot();
    if (!ready) void loadState();
    else queueSweep();
}

export function startIgnoredQuestLifecycle(): void {
    if (lifecycleStarted) return;
    lifecycleStarted = true;
    startupPending = true;
    lifecycleGeneration++;
    ready = false;
    retryAt = 0;
    refreshSnapshot();

    if (!questStoreSubscribed && typeof QuestsStore?.addChangeListener === "function") {
        QuestsStore.addChangeListener(sweepExpiredIgnoredQuests);
        questStoreSubscribed = true;
    }
    if (!userStoreSubscribed && typeof UserStore?.addChangeListener === "function") {
        UserStore.addChangeListener(sweepExpiredIgnoredQuests);
        userStoreSubscribed = true;
    }
    expirySweepTimer = setInterval(sweepExpiredIgnoredQuests, 60_000);
    // A previous lifecycle may still own a write. Wait for its transaction before
    // reading the authoritative state again.
    const epoch = lifecycleGeneration;
    void writeChain.catch(() => {}).then(() => {
        if (lifecycleStarted && epoch === lifecycleGeneration) {
            startupPending = false;
            void loadState();
        }
    });
}

export function stopIgnoredQuestLifecycle(): void {
    lifecycleStarted = false;
    startupPending = false;
    lifecycleGeneration++;
    sweepQueued = false;
    ready = false;
    cancelRetry();
    if (expirySweepTimer !== undefined) clearInterval(expirySweepTimer);
    expirySweepTimer = undefined;
    refreshSnapshot();
    const failures: unknown[] = [];
    if (questStoreSubscribed) {
        try { QuestsStore.removeChangeListener(sweepExpiredIgnoredQuests); questStoreSubscribed = false; }
        catch (error) { failures.push(error); }
    }
    if (userStoreSubscribed) {
        try { UserStore.removeChangeListener(sweepExpiredIgnoredQuests); userStoreSubscribed = false; }
        catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Ignore lifecycle cleanup failed.");
}

export function useIgnoredQuests(): {
    accountId: string | null;
    ready: boolean;
    ids: ReadonlySet<string>;
} {
    const accountId = useStateFromStores([UserStore], currentAccountId);
    const shared = React.useSyncExternalStore(subscribeIgnoredQuests, () => snapshot, () => snapshot);
    if (shared.accountId === accountId) return shared;
    return { accountId, ready: false, ids: EMPTY_IDS };
}
