import { UserStore } from "@webpack/common";

import { createAccountSessionTracker } from "./accountSessionState";
export type { AccountSession } from "./accountSessionState";

function readAccountId(): string | null {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id.trim() ? id : null;
    } catch {
        return null;
    }
}

const tracker = createAccountSessionTracker(readAccountId);
let unsubscribe: (() => void) | null = null;

export function startAccountSession(): void {
    if (unsubscribe) stopAccountSession();
    tracker.start();
    const store = UserStore;
    try {
        unsubscribe = () => store.removeChangeListener(tracker.observe);
        store.addChangeListener(tracker.observe);
        tracker.observe();
    } catch (error) {
        tracker.stop();
        try { stopAccountSession(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "Account session startup cleanup failed."); }
        throw error;
    }
}

export function invalidateAccountSession(): void {
    tracker.stop();
}

export function stopAccountSession(): void {
    invalidateAccountSession();
    unsubscribe?.();
    unsubscribe = null;
}

export const captureAccountSession = tracker.capture;
export const isCurrentAccountSession = tracker.isCurrent;
