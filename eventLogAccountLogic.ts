import type { EventLogEvent } from "./eventLogTypes";

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
