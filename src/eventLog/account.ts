import type { EventLogAccountScope, EventLogEvent } from "./types";

/**
 * Renderer-side sentinel used when Discord's current user identity is temporarily unavailable.
 * No persisted event should ever carry this value.
 */
export const UNAVAILABLE_ACCOUNT_SCOPE = "__questui_no_current_account__";

export function normalizeEventAccountId(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

export function isLegacyUnscopedEvent(event: Pick<EventLogEvent, "accountId">): boolean {
    return normalizeEventAccountId(event.accountId) == null;
}

export function eventBelongsToAccount(
    event: Pick<EventLogEvent, "accountId">,
    accountId: string
): boolean {
    return normalizeEventAccountId(event.accountId) === accountId;
}

/**
 * Legacy rows predate account-aware logging, so their owner cannot be reconstructed safely.
 * They remain visible only as explicitly unscoped history; scoped rows from another account
 * never leak into the current account view.
 */
export function eventVisibleForAccount(
    event: Pick<EventLogEvent, "accountId">,
    accountId: string,
    includeLegacy: boolean
): boolean {
    return eventBelongsToAccount(event, accountId) || (includeLegacy && isLegacyUnscopedEvent(event));
}

export function sameEventAccountScope(
    left: Pick<EventLogEvent, "accountId">,
    right: Pick<EventLogEvent, "accountId">
): boolean {
    return normalizeEventAccountId(left.accountId) === normalizeEventAccountId(right.accountId);
}

export function eventMatchesAccountScopes(
    event: Pick<EventLogEvent, "accountId">,
    currentAccountId: string | null | undefined,
    scopes: "all" | readonly EventLogAccountScope[]
): boolean {
    if (scopes === "all") return true;
    const current = normalizeEventAccountId(currentAccountId);
    const owner = normalizeEventAccountId(event.accountId);
    return scopes.some(scope => scope === "current"
        ? current != null && owner === current
        : current == null || owner !== current);
}

export function normalizeEventAccountUsername(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

export function collectEventAccountUsernames(events: readonly EventLogEvent[]): Map<string, string> {
    const latest = new Map<string, { timestamp: number; username: string; }>();

    const observe = (accountIdValue: unknown, usernameValue: unknown, timestampValue: unknown) => {
        const accountId = normalizeEventAccountId(accountIdValue);
        const username = normalizeEventAccountUsername(usernameValue);
        const timestamp = Number(timestampValue);
        if (!accountId || !username || !Number.isFinite(timestamp)) return;

        const previous = latest.get(accountId);
        if (!previous || timestamp >= previous.timestamp) latest.set(accountId, { timestamp, username });
    };

    for (const event of events) {
        observe(event.accountId, event.accountUsername, event.timestamp);

        if (event.eventCode === "QUESTUI_ACCOUNT_CHANGED") {
            observe(
                event.detail?.previousAccountId,
                event.detail?.previousAccountUsername,
                event.timestamp
            );
        }
    }

    return new Map(Array.from(latest, ([accountId, value]) => [accountId, value.username]));
}
