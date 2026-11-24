import { findByCodeLazy } from "@webpack";
import { showToast, ThemeStore, UserStore, useEffect, useState, useStateFromStores } from "@webpack/common";

import { queryEventLog, subscribeEventLog } from "../eventLog/runtime";
import type { EventLogEvent } from "../eventLog/types";
import { useQuestSnapshot, type NormalizedQuest, type QuestTaskType } from "../quests/data";
import { dashboardThemeClassName } from "../themes/runtime";
import {
    notificationCenterItems,
    unreadNotificationCenterCount,
    type NotificationCenterItem
} from "./centerLogic";
import {
    clearNotificationCenter,
    ensureNotificationCenterAccountState,
    getNotificationCenterAccountState,
    markNotificationCenterAllRead,
    markNotificationCenterAllUnread,
    preloadNotificationCenterState,
    subscribeNotificationCenterState
} from "./centerRuntime";

import "./center.css";

const CENTER_QUERY_LIMIT = 300;
const EVENT_SETTLE_DELAY_MS = 160;
const EVENT_RECHECK_DELAY_MS = 1_050;

interface DiscordQuestAsset {
    url: string;
}

type DiscordQuestAssetKind = "game_tile" | "quest_bar_hero_image" | "hero_image";
type QuestTheme = "dark" | "light";

const getDiscordQuestAsset = findByCodeLazy(
    "\"game_tile\"",
    "\"quest_bar_hero\"",
    "\"video_player_thumbnail\""
) as (quest: any, assetKind: DiscordQuestAssetKind, theme?: QuestTheme) => DiscordQuestAsset | null;

export interface NotificationCenterFeed {
    accountId: string | null;
    currentUser: any | null;
    ready: boolean;
    items: NotificationCenterItem[];
    unreadCount: number;
    quests: NormalizedQuest[];
}

function currentUser(): any | null {
    try { return UserStore?.getCurrentUser?.() ?? null; }
    catch { return null; }
}

export function useNotificationCenterFeed(): NotificationCenterFeed {
    const user = useStateFromStores([UserStore], currentUser);
    const quests = useQuestSnapshot("live");
    const accountId = typeof user?.id === "string" && user.id ? user.id : null;
    const [events, setEvents] = useState<EventLogEvent[]>([]);
    const [, setStateRevision] = useState(0);

    useEffect(() => {
        preloadNotificationCenterState();
        return subscribeNotificationCenterState(() => setStateRevision(value => value + 1));
    }, []);

    useEffect(() => {
        let disposed = false;
        let settleTimer: ReturnType<typeof setTimeout> | null = null;
        let recheckTimer: ReturnType<typeof setTimeout> | null = null;
        let generation = 0;

        const clearTimers = () => {
            if (settleTimer != null) clearTimeout(settleTimer);
            if (recheckTimer != null) clearTimeout(recheckTimer);
            settleTimer = null;
            recheckTimer = null;
        };

        const refresh = async () => {
            const requestGeneration = ++generation;
            if (!accountId) {
                if (!disposed) setEvents([]);
                return;
            }

            try {
                await ensureNotificationCenterAccountState(accountId);
                const result = await queryEventLog({
                    accountId,
                    includeLegacy: false,
                    sort: "newest",
                    limit: CENTER_QUERY_LIMIT
                });
                if (!disposed && requestGeneration === generation) setEvents(result.events);
            } catch {
                if (!disposed && requestGeneration === generation) setEvents([]);
            }
        };

        const scheduleRefresh = () => {
            clearTimers();
            settleTimer = setTimeout(() => {
                settleTimer = null;
                void refresh();
            }, EVENT_SETTLE_DELAY_MS);
            recheckTimer = setTimeout(() => {
                recheckTimer = null;
                void refresh();
            }, EVENT_RECHECK_DELAY_MS);
        };

        void refresh();
        const unsubscribe = subscribeEventLog(scheduleRefresh);
        return () => {
            disposed = true;
            generation++;
            clearTimers();
            unsubscribe();
        };
    }, [accountId]);

    const accountState = getNotificationCenterAccountState(accountId);
    const items = accountId && accountState
        ? notificationCenterItems(events, accountId, accountState)
        : [];

    return {
        accountId,
        currentUser: user,
        ready: accountState != null,
        items,
        unreadCount: unreadNotificationCenterCount(items),
        quests
    };
}

function avatarUrl(user: any): string | null {
    const id = typeof user?.id === "string" ? user.id : "";
    const avatar = typeof user?.avatar === "string" ? user.avatar : "";
    if (!id || !avatar) return null;
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.webp?size=64`;
}

function relativeTime(timestamp: number, now: number): string {
    const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (seconds < 45) return "now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(timestamp);
}

function CheckIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 12l5 5l10 -10" />
            <path d="M2 12l5 5m5 -5l5 -5" />
        </svg>
    );
}

function UnreadIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="7.5 9.5 3 9.5 3 5" />
            <path d="M6.34 17.66A8 8 0 1 0 6.34 6.34L3 9.5" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" x2="10" y1="11" y2="17" />
            <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
    );
}

function TaskTypeGlyph({ type }: { type: QuestTaskType; }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            {type === "play" && (
                <>
                    <path d="M7.2 6.8h9.6a4.48 4.48 0 0 1 4.42 3.75l.72 4.42a2.86 2.86 0 0 1-4.68 2.7l-2.4-1.92H9.14l-2.4 1.92a2.86 2.86 0 0 1-4.68-2.7l.72-4.42A4.48 4.48 0 0 1 7.2 6.8Z" />
                    <path className="quest-ui-notification-center-task-cutout" d="M7.1 9h1.45v1.45H10v1.45H8.55v1.45H7.1V11.9H5.65v-1.45H7.1V9Z" />
                    <circle className="quest-ui-notification-center-task-cutout" cx="16" cy="9.7" r=".72" />
                    <circle className="quest-ui-notification-center-task-cutout" cx="18.2" cy="11.9" r=".72" />
                    <circle className="quest-ui-notification-center-task-cutout" cx="13.8" cy="11.9" r=".72" />
                    <circle className="quest-ui-notification-center-task-cutout" cx="16" cy="14.1" r=".72" />
                </>
            )}
            {type === "stream" && (
                <path d="M4 4.75h16a1.75 1.75 0 0 1 1.75 1.75v10A1.75 1.75 0 0 1 20 18.25h-6.2v1.5h2.45v1.5h-8.5v-1.5h2.45v-1.5H4a1.75 1.75 0 0 1-1.75-1.75v-10A1.75 1.75 0 0 1 4 4.75Zm0 1.75v10h16v-10H4Z" />
            )}
            {type === "video" && (
                <><circle cx="12" cy="12" r="9" /><path className="quest-ui-notification-center-task-cutout" d="m10 8 6 4-6 4Z" /></>
            )}
            {type === "activity" && (
                <><circle cx="12" cy="12" r="9" /><circle className="quest-ui-notification-center-task-cutout" cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1.6" /></>
            )}
            {type === "other" && (
                <path d="m12 2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
            )}
        </svg>
    );
}

function NotificationFallbackIcon({ item }: { item: NotificationCenterItem; }) {
    if (item.tone === "error" || item.tone === "warning") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 3 9 17H3L12 3Z" />
                <path d="M12 9v5M12 17h.01" />
            </svg>
        );
    }
    if (item.kind === "reward") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 10h16v10H4V10ZM3 6h18v4H3V6ZM12 6v14" />
                <path d="M12 6c-1.3-3.2-5.5-3.3-5.5-.7 0 1.5 1.7 2.3 5.5.7Zm0 0c1.3-3.2 5.5-3.3 5.5-.7 0 1.5-1.7 2.3-5.5.7Z" />
            </svg>
        );
    }
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></svg>;
}

function resolveQuestArtwork(quest: NormalizedQuest | null, theme: QuestTheme): string | null {
    if (!quest) return null;
    const candidates: DiscordQuestAssetKind[] = ["game_tile", "quest_bar_hero_image", "hero_image"];
    for (const assetKind of candidates) {
        try {
            const asset = getDiscordQuestAsset(quest.rawQuest, assetKind, theme);
            if (asset?.url) return asset.url;
        } catch { }
    }
    return null;
}

function questForNotification(item: NotificationCenterItem, quests: readonly NormalizedQuest[]): NormalizedQuest | null {
    if (item.questId) {
        const byId = quests.find(quest => quest.id === item.questId);
        if (byId) return byId;
    }

    const name = item.questName?.trim().toLocaleLowerCase();
    if (!name) return null;
    return quests.find(quest => quest.name.trim().toLocaleLowerCase() === name) ?? null;
}

function NotificationQuestArtwork({ item, quest }: {
    item: NotificationCenterItem;
    quest: NormalizedQuest | null;
}) {
    const theme = useStateFromStores([ThemeStore], () => ThemeStore.theme === "light" ? "light" : "dark") as QuestTheme;
    const imageUrl = resolveQuestArtwork(quest, theme);
    const taskType = quest?.primaryTask?.type ?? quest?.tasks[0]?.type ?? "other";

    return (
        <span className="quest-ui-notification-center-row-artwork" aria-hidden="true">
            <span className="quest-ui-notification-center-row-artwork-fallback">
                <NotificationFallbackIcon item={item} />
            </span>
            {imageUrl && (
                <img
                    src={imageUrl}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    onError={event => { event.currentTarget.style.display = "none"; }}
                />
            )}
            {quest && (
                <span className={`quest-ui-notification-center-task-badge is-${taskType}`}>
                    <TaskTypeGlyph type={taskType} />
                </span>
            )}
        </span>
    );
}

function notificationMeta(item: NotificationCenterItem, quest: NormalizedQuest | null): string {
    const parts: string[] = [];
    const questName = quest?.name ?? item.questName;
    if (questName) parts.push(questName);

    const rewardLabel = quest?.reward?.label;
    if (rewardLabel) parts.push(`Reward: ${rewardLabel}`);

    if (parts.length === 0) parts.push(item.source);
    return parts.join(" · ");
}

function showNotificationDescription(item: NotificationCenterItem): boolean {
    if (item.kind !== "problem") return false;
    const description = item.description.trim().toLocaleLowerCase();
    const title = item.title.trim().toLocaleLowerCase();
    return description.length > 0 && description !== title;
}

function ActionButton({ children, icon, disabled, danger, onClick }: {
    children: any;
    icon: any;
    disabled?: boolean;
    danger?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={`quest-ui-notification-center-action${danger ? " is-danger" : ""}`}
            disabled={disabled}
            onClick={onClick}
        >
            {icon}
            <span>{children}</span>
        </button>
    );
}

export function NotificationCenterPanel({ feed }: { feed: NotificationCenterFeed; }) {
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const accountId = feed.accountId;
    const user = feed.currentUser;
    const displayName = String(user?.globalName ?? user?.displayName ?? user?.username ?? "Current account");
    const username = typeof user?.username === "string" ? user.username : null;
    const avatar = avatarUrl(user);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(timer);
    }, []);

    const runAction = async (action: () => Promise<void>, successText: string) => {
        if (!accountId || busy) return;
        setBusy(true);
        try {
            await action();
            showToast({ text: successText, variant: "success" });
        } catch (error) {
            showToast({
                text: error instanceof Error ? error.message : "Notification Center action failed.",
                variant: "critical"
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={dashboardThemeClassName("quest-ui-notification-center-panel")} role="dialog" aria-label="Notification Center">
            <div className="quest-ui-notification-center-header">
                <div>
                    <strong>Notification Center</strong>
                </div>
                <span className={`quest-ui-notification-center-unread${feed.unreadCount > 0 ? " has-unread" : ""}`}>
                    {feed.unreadCount} unread
                </span>
            </div>

            <div className="quest-ui-notification-center-account">
                <span className="quest-ui-notification-center-avatar" aria-hidden="true">
                    {avatar ? <img src={avatar} alt="" /> : <span>{displayName.slice(0, 1).toUpperCase()}</span>}
                </span>
                <span className="quest-ui-notification-center-account-copy">
                    <strong>{displayName}</strong>
                    {username && <span>@{username}</span>}
                </span>
                <span className="quest-ui-notification-center-current-chip">Current account</span>
            </div>

            <div className="quest-ui-notification-center-actions">
                <ActionButton
                    icon={<CheckIcon />}
                    disabled={!accountId || busy || feed.items.length === 0 || feed.unreadCount === 0}
                    onClick={() => void runAction(
                        () => markNotificationCenterAllRead(accountId!),
                        "Notifications marked as read."
                    )}
                >
                    Mark all read
                </ActionButton>
                <ActionButton
                    icon={<UnreadIcon />}
                    disabled={!accountId || busy || feed.items.length === 0 || feed.unreadCount === feed.items.length}
                    onClick={() => void runAction(
                        () => markNotificationCenterAllUnread(accountId!),
                        "Notifications marked as unread."
                    )}
                >
                    Mark all unread
                </ActionButton>
                <ActionButton
                    icon={<TrashIcon />}
                    danger
                    disabled={!accountId || busy || feed.items.length === 0}
                    onClick={() => void runAction(
                        () => clearNotificationCenter(accountId!),
                        "Notification Center cleared."
                    )}
                >
                    Clear Notification
                </ActionButton>
            </div>

            <div className="quest-ui-notification-center-divider" />

            <div className="quest-ui-notification-center-list" role="list">
                {!feed.ready ? (
                    <div className="quest-ui-notification-center-empty">Loading notifications...</div>
                ) : feed.items.length === 0 ? (
                    <div className="quest-ui-notification-center-empty">
                        <strong>You're all caught up</strong>
                        <span>New quests, successful Quest actions, and important failures will appear here.</span>
                    </div>
                ) : feed.items.map(item => {
                    const quest = questForNotification(item, feed.quests);
                    return (
                    <article
                        key={item.id}
                        className={`quest-ui-notification-center-row is-${item.tone}${item.read ? " is-read" : " is-unread"}`}
                        role="listitem"
                    >
                        <NotificationQuestArtwork item={item} quest={quest} />
                        <div className="quest-ui-notification-center-row-main">
                            <div className="quest-ui-notification-center-row-heading">
                                <strong>{item.title}</strong>
                                <time dateTime={new Date(item.timestamp).toISOString()}>{relativeTime(item.timestamp, now)}</time>
                            </div>
                            {showNotificationDescription(item) && (
                                <span className="quest-ui-notification-center-row-description">{item.description}</span>
                            )}
                            <span className="quest-ui-notification-center-row-meta">
                                {notificationMeta(item, quest)}
                            </span>
                        </div>
                    </article>
                    );
                })}
            </div>
        </div>
    );
}
