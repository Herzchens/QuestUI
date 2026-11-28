import { showToast, ThemeStore, UserStore, useEffect, useRef, useState, useStateFromStores } from "@webpack/common";

import { queryEventLog, subscribeEventLog } from "../eventLog/runtime";
import { createLatestTask } from "../plugin/latestTask";
import { captureAccountSession, isCurrentAccountSession } from "../plugin/accountSession";
import type { EventLogEvent } from "../eventLog/types";
import { useQuestSnapshot, type NormalizedQuest, type QuestTaskType } from "../quests/data";
import { resolveQuestArtwork, type QuestTheme } from "../quests/presentation";
import { findQuestByIdentity, safeQuestArtworkUrl, taskTypeForKey } from "../quests/presentationLogic";
import { useQuestOrbMultiplierState } from "../orbs/multiplier";
import { formatQuestRewardLabel } from "../orbs/rewards";
import { useDashboardThemeClassName, useDashboardThemeId } from "../themes/runtime";
import { terminalArtworkGrid, useTerminalArtwork } from "../themes/terminal/useArtwork";
import { UpdateCenterIcon } from "../updates/status";
import {
    notificationCenterItems,
    notificationQuestMeta,
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

const CENTER_QUERY_LIMIT = 300;
const EVENT_SETTLE_DELAY_MS = 160;
const EVENT_RECHECK_DELAY_MS = 1_050;

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
    const session = useStateFromStores([UserStore], captureAccountSession);
    const [refreshQueue] = useState(createLatestTask);
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

        const refresh = async (requestGeneration: number) => {
            if (disposed || requestGeneration !== generation) return;
            if (!accountId) {
                if (!disposed) setEvents([]);
                return;
            }

            if (session?.accountId !== accountId || !isCurrentAccountSession(session)) return;
            try {
                await ensureNotificationCenterAccountState(accountId);
                if (disposed || requestGeneration !== generation || !isCurrentAccountSession(session)) return;
                const result = await queryEventLog({
                    accountId,
                    includeLegacy: false,
                    sort: "newest",
                    limit: CENTER_QUERY_LIMIT
                });
                if (!disposed && requestGeneration === generation && isCurrentAccountSession(session)) setEvents(result.events);
            } catch {
                if (!disposed && requestGeneration === generation && isCurrentAccountSession(session)) setEvents([]);
            }
        };

        const requestRefresh = () => {
            if (disposed) return;
            const requestGeneration = ++generation;
            refreshQueue.request(() => refresh(requestGeneration));
        };
        const scheduleRefresh = () => {
            if (disposed) return;
            clearTimers();
            settleTimer = setTimeout(() => {
                settleTimer = null;
                requestRefresh();
            }, EVENT_SETTLE_DELAY_MS);
            recheckTimer = setTimeout(() => {
                recheckTimer = null;
                requestRefresh();
            }, EVENT_RECHECK_DELAY_MS);
        };

        requestRefresh();
        const unsubscribe = subscribeEventLog(scheduleRefresh);
        return () => {
            disposed = true;
            generation++;
            refreshQueue.cancelPending();
            clearTimers();
            unsubscribe();
        };
    }, [accountId, session, refreshQueue]);

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
        <svg className="quest-ui-terminal-notice-read-glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 12l5 5l10 -10" />
            <path d="M2 12l5 5m5 -5l5 -5" />
        </svg>
    );
}

function UnreadIcon() {
    return (
        <svg className="quest-ui-terminal-notice-unread-glyph" viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="7.5 9.5 3 9.5 3 5" />
            <path d="M6.34 17.66A8 8 0 1 0 6.34 6.34L3 9.5" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg className="quest-ui-terminal-notice-clear-glyph" viewBox="0 0 24 24" aria-hidden="true">
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
    if (item.kind === "update") return <UpdateCenterIcon />;
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

function NotificationQuestArtwork({ item, quest }: {
    item: NotificationCenterItem;
    quest: NormalizedQuest | null;
}) {
    const theme = useStateFromStores([ThemeStore], () => ThemeStore.theme === "light" ? "light" : "dark") as QuestTheme;
    const savedArtwork = safeQuestArtworkUrl(theme === "light" ? item.event.quest?.artworkLight : item.event.quest?.artworkDark)
        ?? safeQuestArtworkUrl(theme === "light" ? item.event.quest?.artworkDark : item.event.quest?.artworkLight);
    const imageUrl = resolveQuestArtwork(quest, theme) ?? savedArtwork;
    const dashboardThemeId = useDashboardThemeId();
    const pixelUrl = useTerminalArtwork(dashboardThemeId === "terminal", imageUrl, "notification");
    const displayUrl = pixelUrl ?? imageUrl;
    const savedTask = item.event.quest?.taskType;
    const taskType = quest?.primaryTask?.type ?? quest?.tasks[0]?.type ?? taskTypeForKey(savedTask ?? "");

    return (
        <span className="quest-ui-notification-center-row-artwork" aria-hidden="true" style={terminalArtworkGrid(pixelUrl, "notification")}>
            <span className="quest-ui-notification-center-row-artwork-fallback">
                <NotificationFallbackIcon item={item} />
            </span>
            {displayUrl && (
                <img
                    key={displayUrl}
                    data-terminal-pixel={pixelUrl ? "true" : undefined}
                    src={displayUrl}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    onError={event => { event.currentTarget.style.display = "none"; }}
                />
            )}
            {(quest || savedTask) && (
                <span className={`quest-ui-notification-center-task-badge is-${taskType}`}>
                    <TaskTypeGlyph type={taskType} />
                </span>
            )}
        </span>
    );
}

function showNotificationDescription(item: NotificationCenterItem): boolean {
    if (item.kind !== "problem" && item.kind !== "update") return false;
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
    const { receivesBoost } = useQuestOrbMultiplierState();
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const mounted = useRef(true);
    const session = captureAccountSession();
    const accountId = feed.accountId;
    const user = feed.currentUser;
    const displayName = String(user?.globalName ?? user?.displayName ?? user?.username ?? "Current account");
    const username = typeof user?.username === "string" ? user.username : null;
    const avatar = avatarUrl(user);

    useEffect(() => {
        mounted.current = true;
        const timer = setInterval(() => setNow(Date.now()), 30_000);
        return () => { mounted.current = false; clearInterval(timer); };
    }, []);

    const runAction = async (action: () => Promise<void>, successText: string) => {
        if (!accountId || busy || !mounted.current || session?.accountId !== accountId || !isCurrentAccountSession(session)) return;
        setBusy(true);
        try {
            await action();
            if (mounted.current && isCurrentAccountSession(session)) showToast({ text: successText, variant: "success" });
        } catch (error) {
            if (mounted.current && isCurrentAccountSession(session)) showToast({
                text: error instanceof Error ? error.message : "Notification Center action failed.",
                variant: "critical"
            });
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    return (
        <div className={useDashboardThemeClassName("quest-ui-notification-center-panel")} role="dialog" aria-label="Notification Center">
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
                        <span>New quests, confirmed Quest actions, updates, and important failures will appear here.</span>
                    </div>
                ) : feed.items.map(item => {
                    const quest = findQuestByIdentity({ id: item.questId, name: item.questName }, feed.quests);
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
                                {notificationQuestMeta(item, quest ? { name: quest.name, rewardLabel: formatQuestRewardLabel(quest.reward, receivesBoost) } : null)}
                            </span>
                        </div>
                    </article>
                    );
                })}
            </div>
        </div>
    );
}
