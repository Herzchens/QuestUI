import type { EventLogEvent } from "../eventLog/types";

export type NotificationCenterTone = "info" | "success" | "warning" | "error";
export type NotificationCenterKind = "quest" | "reward" | "problem";

export interface NotificationCenterAccountState {
    initializedAt: number;
    readThrough: number;
    clearedThrough: number;
}

export interface NotificationCenterState {
    version: 1;
    accounts: Record<string, NotificationCenterAccountState>;
}

export interface NotificationCenterItem {
    id: string;
    timestamp: number;
    read: boolean;
    tone: NotificationCenterTone;
    kind: NotificationCenterKind;
    title: string;
    description: string;
    source: "QuestUI" | "OrionQuests";
    questId: string | null;
    questName: string | null;
    eventCode: string;
    event: EventLogEvent;
}

const EMPTY_STATE: NotificationCenterState = { version: 1, accounts: {} };

function safeTimestamp(value: unknown): number {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
}

function normalizeAccountState(value: unknown): NotificationCenterAccountState | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    return {
        initializedAt: safeTimestamp(record.initializedAt),
        readThrough: safeTimestamp(record.readThrough),
        clearedThrough: safeTimestamp(record.clearedThrough)
    };
}

export function normalizeNotificationCenterState(value: unknown): NotificationCenterState {
    if (!value || typeof value !== "object") return { ...EMPTY_STATE, accounts: {} };
    const record = value as Record<string, unknown>;
    const rawAccounts = record.accounts;
    if (!rawAccounts || typeof rawAccounts !== "object") return { ...EMPTY_STATE, accounts: {} };

    const accounts: Record<string, NotificationCenterAccountState> = {};
    for (const [accountId, raw] of Object.entries(rawAccounts as Record<string, unknown>)) {
        const normalizedId = accountId.trim();
        const normalized = normalizeAccountState(raw);
        if (normalizedId && normalized) accounts[normalizedId] = normalized;
    }
    return { version: 1, accounts };
}

export function ensureNotificationCenterAccount(
    value: unknown,
    accountId: string,
    now = Date.now()
): NotificationCenterState {
    const state = normalizeNotificationCenterState(value);
    const id = accountId.trim();
    if (!id || state.accounts[id]) return state;
    const baseline = safeTimestamp(now);
    return {
        version: 1,
        accounts: {
            ...state.accounts,
            [id]: {
                initializedAt: baseline,
                readThrough: baseline,
                clearedThrough: 0
            }
        }
    };
}

export function updateNotificationCenterAccount(
    value: unknown,
    accountId: string,
    patch: Partial<Pick<NotificationCenterAccountState, "readThrough" | "clearedThrough">>
): NotificationCenterState {
    const id = accountId.trim();
    const state = ensureNotificationCenterAccount(value, id);
    if (!id) return state;
    const current = state.accounts[id];
    return {
        version: 1,
        accounts: {
            ...state.accounts,
            [id]: {
                ...current,
                readThrough: patch.readThrough == null ? current.readThrough : safeTimestamp(patch.readThrough),
                clearedThrough: patch.clearedThrough == null ? current.clearedThrough : safeTimestamp(patch.clearedThrough)
            }
        }
    };
}

export function notificationCenterAccountState(
    value: unknown,
    accountId: string | null | undefined
): NotificationCenterAccountState | null {
    if (!accountId) return null;
    return normalizeNotificationCenterState(value).accounts[accountId] ?? null;
}

function normalizedCode(value: unknown): string {
    return String(value ?? "").trim().replace(/[.\-]+/g, "_").toUpperCase();
}

function eventDescription(event: EventLogEvent): string {
    const detailMessage = typeof event.detail?.message === "string" ? event.detail.message.trim() : "";
    const reason = typeof event.detail?.reason === "string" ? event.detail.reason.trim() : "";
    return detailMessage || reason || String(event.summary ?? "");
}

export function notificationCenterPresentation(event: EventLogEvent): {
    title: string;
    description: string;
    kind: NotificationCenterKind;
    tone: NotificationCenterTone;
} | null {
    const code = normalizedCode(event.eventCode);
    if (!code) return null;

    // Notification Center is intentionally a small, user-facing event inbox rather than
    // a second Event Log. Only explicit Quest discovery/action outcomes and actionable
    // Quest/claim failures are admitted here.
    if (code === "QUEST_NEW_AVAILABLE") {
        return {
            title: "New quest available",
            description: String(event.summary ?? ""),
            kind: "quest",
            tone: "info"
        };
    }

    if (code === "QUEST_ACCEPT_SUCCEEDED") {
        if (event.detail?.storeConfirmed === false) return null;
        return {
            title: "Quest accepted",
            description: String(event.summary ?? ""),
            kind: "quest",
            tone: "success"
        };
    }

    if (code === "QUEST_CLAIM_SUCCEEDED" || code === "ORION_CLAIM_SUCCEEDED" || code === "CLAIM_SUCCEEDED") {
        if (event.detail?.storeConfirmed === false) return null;
        return {
            title: "Reward claimed",
            description: String(event.summary ?? ""),
            kind: "reward",
            tone: "success"
        };
    }

    // Batch summaries stay in Event Log; confirmed rewards own their Center rows.
    if (code === "QUEST_CLAIM_ALL_SUCCEEDED") return null;

    if (code === "QUEST_ACCEPT_FAILED") {
        return {
            title: "Quest accept failed",
            description: eventDescription(event),
            kind: "problem",
            tone: "error"
        };
    }

    if (code === "QUEST_CLAIM_FAILED" || code === "ORION_CLAIM_FAILED" || code === "CLAIM_FAILED") {
        return {
            title: "Claim failed",
            description: eventDescription(event),
            kind: "problem",
            tone: "error"
        };
    }

    if (code === "QUEST_CLAIM_ALL_STOPPED") {
        return {
            title: event.severity === "warning" ? "Claim All needs attention" : "Claim All failed",
            description: eventDescription(event),
            kind: "problem",
            tone: event.severity === "warning" ? "warning" : "error"
        };
    }

    if (code === "ORION_TASK_FAILED" || code === "TASK_FAILED" || code === "ORION_TASK_ABORTED" || code === "ORION_HEARTBEAT_TIMEOUT") {
        return {
            title: "Quest failed",
            description: eventDescription(event),
            kind: "problem",
            tone: "error"
        };
    }

    if (code === "ORION_QUEST_BLOCKED" || code === "QUEST_BLOCKED") {
        return {
            title: "Quest blocked",
            description: eventDescription(event),
            kind: "problem",
            tone: event.severity === "error" ? "error" : "warning"
        };
    }

    if (code === "ORION_AUTO_START_FAILED") {
        return {
            title: "Quest start failed",
            description: eventDescription(event),
            kind: "problem",
            tone: "warning"
        };
    }

    if (code === "ORION_CLAIM_CAPTCHA_REQUIRED" || code === "CLAIM_ACTION_REQUIRED") {
        return {
            title: "Claim needs attention",
            description: eventDescription(event),
            kind: "problem",
            tone: "warning"
        };
    }

    return null;
}

export function notificationCenterItems(
    events: readonly EventLogEvent[],
    accountId: string,
    accountState: NotificationCenterAccountState,
    limit = 80
): NotificationCenterItem[] {
    const id = accountId.trim();
    if (!id) return [];

    const items: NotificationCenterItem[] = [];
    for (const event of events) {
        if (event.accountId !== id) continue;
        if (safeTimestamp(event.timestamp) <= accountState.clearedThrough) continue;
        const presentation = notificationCenterPresentation(event);
        if (!presentation) continue;

        items.push({
            id: event.id,
            timestamp: event.timestamp,
            read: event.timestamp <= accountState.readThrough,
            tone: presentation.tone,
            kind: presentation.kind,
            title: presentation.title,
            description: presentation.description,
            source: event.source === "orion" ? "OrionQuests" : "QuestUI",
            questId: event.quest?.id ?? null,
            questName: event.quest?.name ?? null,
            eventCode: event.eventCode,
            event
        });
    }

    items.sort((left, right) => right.timestamp - left.timestamp);
    return items.slice(0, Math.max(1, limit));
}

export function unreadNotificationCenterCount(items: readonly NotificationCenterItem[]): number {
    return items.reduce((count, item) => count + Number(!item.read), 0);
}

export function notificationQuestMeta(
    item: NotificationCenterItem,
    liveQuest: { name: string; rewardLabel: string; } | null
): string {
    const parts: string[] = [];
    const name = item.questName || liveQuest?.name;
    if (name) parts.push(name);
    const rewardLabel = item.event.quest?.rewardLabel || liveQuest?.rewardLabel;
    if (rewardLabel) parts.push(`Reward: ${rewardLabel}`);
    if (parts.length === 0) {
        const description = item.description.trim();
        parts.push(item.kind !== "problem" && description && description.toLocaleLowerCase() !== item.title.toLocaleLowerCase()
            ? description
            : item.source);
    }
    return parts.join(" · ");
}
