export type OptionalTimestampResult =
    | { kind: "missing"; }
    | { kind: "invalid"; }
    | { kind: "valid"; time: number; };

export type QuestAccessSuspensionState = "clear" | "blocked" | "invalid";

export interface ChangeListenerStore {
    addChangeListener(listener: () => void): void;
    removeChangeListener(listener: () => void): void;
}

/**
 * Treat an absent timestamp differently from a malformed timestamp. Quest mutations may
 * legitimately encounter legacy records without an optional field, but a present value that
 * cannot be parsed must fail closed instead of silently bypassing start/expiry safety checks.
 */
export function classifyOptionalTimestamp(value: unknown): OptionalTimestampResult {
    if (value == null) return { kind: "missing" };
    if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
        return { kind: "invalid" };
    }

    const time = new Date(value).getTime();
    return Number.isFinite(time) ? { kind: "valid", time } : { kind: "invalid" };
}

/**
 * Discord currently exposes both an explicit suspension boolean and the underlying timestamp.
 * Older builds may expose neither, so absence is not itself an error. Any present malformed
 * timestamp is unsafe, while either Discord's boolean or a future timestamp means blocked.
 */
export function questAccessSuspensionState(
    isSuspended: unknown,
    suspendedUntil: unknown,
    now = Date.now()
): QuestAccessSuspensionState {
    if (isSuspended != null && typeof isSuspended !== "boolean") return "invalid";

    const parsed = classifyOptionalTimestamp(suspendedUntil);
    if (parsed.kind === "invalid") return "invalid";
    if (isSuspended === true) return "blocked";
    if (parsed.kind === "valid" && parsed.time > now) return "blocked";
    return "clear";
}

export type StoreWaitTimeoutResult = "timeout" | "account-changed";

/** Re-check account identity at the timeout boundary, not only on QuestStore events. */
export function storeWaitTimeoutResult(expectedUserId: string, currentUserId: string | null): StoreWaitTimeoutResult {
    return currentUserId === expectedUserId ? "timeout" : "account-changed";
}

/**
 * Attach a Flux-style listener without leaking it if a store happens to invoke the callback
 * synchronously during registration. Most Flux stores do not, but mutation guards should not
 * depend on that implementation detail.
 */
export function attachChangeListenerSafely(
    store: ChangeListenerStore,
    listener: () => void,
    isFinished: () => boolean
): () => void {
    let attached = false;

    const detach = () => {
        if (!attached) return;
        attached = false;
        try { store.removeChangeListener(listener); } catch { }
    };

    try {
        store.addChangeListener(listener);
        attached = true;
    } catch (error) {
        // `addChangeListener` may theoretically throw after partially registering. Attempt a
        // compensating remove even though we cannot prove whether registration completed.
        try { store.removeChangeListener(listener); } catch { }
        throw error;
    }

    if (isFinished()) detach();
    return detach;
}
