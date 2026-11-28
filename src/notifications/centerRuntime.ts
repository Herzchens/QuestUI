import * as DataStore from "@api/DataStore";

import {
    ensureNotificationCenterAccount,
    normalizeNotificationCenterState,
    notificationCenterAccountState,
    updateNotificationCenterAccount,
    type NotificationCenterAccountState,
    type NotificationCenterState
} from "./centerLogic";

const DATA_STORE_KEY = "QuestUI:notification-center:v1";

const listeners = new Set<() => void>();
let cachedState: NotificationCenterState | null = null;
let loadPromise: Promise<NotificationCenterState> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function notify(): void {
    for (const listener of [...listeners]) {
        try { listener(); } catch { /* Subscriber failure must not interrupt persistence. */ }
    }
}

async function loadState(): Promise<NotificationCenterState> {
    if (cachedState) return cachedState;
    if (loadPromise) return loadPromise;

    loadPromise = DataStore.get(DATA_STORE_KEY)
        .then(value => normalizeNotificationCenterState(value))
        .catch(() => normalizeNotificationCenterState(null))
        .then(state => {
            cachedState = state;
            loadPromise = null;
            notify();
            return state;
        });
    return loadPromise;
}

export function preloadNotificationCenterState(): void {
    void loadState();
}

export function subscribeNotificationCenterState(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getNotificationCenterAccountState(accountId: string | null | undefined): NotificationCenterAccountState | null {
    if (!cachedState || !accountId) return null;
    return notificationCenterAccountState(cachedState, accountId);
}

async function persistMutation(mutator: (value: unknown) => NotificationCenterState): Promise<void> {
    await loadState();

    writeChain = writeChain.catch(() => { }).then(async () => {
        cachedState = mutator(cachedState);
        notify();

        try {
            await DataStore.update<NotificationCenterState>(DATA_STORE_KEY, stored => mutator(stored));
            cachedState = normalizeNotificationCenterState(await DataStore.get(DATA_STORE_KEY));
        } catch {
            try { cachedState = normalizeNotificationCenterState(await DataStore.get(DATA_STORE_KEY)); }
            catch { cachedState = normalizeNotificationCenterState(null); }
            notify();
            throw new Error("QuestUI could not persist Notification Center state.");
        }
        notify();
    });

    return writeChain;
}

export async function ensureNotificationCenterAccountState(accountId: string, now = Date.now()): Promise<void> {
    const id = accountId.trim();
    if (!id) return;
    await loadState();
    if (notificationCenterAccountState(cachedState, id)) return;
    await persistMutation(value => ensureNotificationCenterAccount(value, id, now));
}

export async function markNotificationCenterAllRead(accountId: string, now = Date.now()): Promise<void> {
    const id = accountId.trim();
    if (!id) return;
    await persistMutation(value => updateNotificationCenterAccount(value, id, { readThrough: now }));
}

export async function markNotificationCenterAllUnread(accountId: string): Promise<void> {
    const id = accountId.trim();
    if (!id) return;
    await persistMutation(value => {
        const readThrough = notificationCenterAccountState(value, id)?.clearedThrough ?? 0;
        return updateNotificationCenterAccount(value, id, { readThrough });
    });
}

export async function clearNotificationCenter(accountId: string, now = Date.now()): Promise<void> {
    const id = accountId.trim();
    if (!id) return;
    await persistMutation(value => updateNotificationCenterAccount(value, id, {
        readThrough: now,
        clearedThrough: now
    }));
}
