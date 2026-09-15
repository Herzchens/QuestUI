import { showNotification } from "@api/Notifications";
import { NavigationRouter, UserStore } from "@webpack/common";

import { queryEventLog, subscribeEventLog } from "./eventLog";
import type { EventLogEvent } from "./eventLogTypes";
import {
    ignoredQuestIds,
    isIgnoredQuestStateReady,
    preloadIgnoredQuests,
    subscribeIgnoredQuests
} from "./ignoredQuests";
import {
    completedQuestTransitions,
    isActionableProblemEvent,
    newAvailableQuestTransitions,
    problemNotificationKey,
    type QuestNotificationSnapshot
} from "./notificationLogic";
import settings from "./settings";
import { QuestsStore } from "./stores";

const PROBLEM_QUERY_LIMIT = 100;
const PROBLEM_DEDUP_MS = 30_000;
// Event Log change listeners run when a sanitized row enters memory, before the desktop JSONL
// append necessarily finishes. Query after a short settle delay and once more later so desktop
// persistence latency cannot silently drop a notification.
const PROBLEM_SCAN_DELAY_MS = 200;
const PROBLEM_RECHECK_DELAY_MS = 1_200;

let previousAccountId: string | null = null;
let previousQuests: QuestNotificationSnapshot[] | null = null;
let knownQuestIds: Set<string> | null = null;
let questStoreSubscribed = false;
let userStoreSubscribed = false;
let ignoredUnsubscribe: (() => void) | null = null;
let eventLogUnsubscribe: (() => void) | null = null;
let problemAccountId: string | null = null;
let problemBaselineReady = false;
let problemScanGeneration = 0;
let problemScanChain: Promise<void> = Promise.resolve();
let problemScanTimer: ReturnType<typeof setTimeout> | null = null;
let problemRecheckTimer: ReturnType<typeof setTimeout> | null = null;
let seenProblemEventIds = new Set<string>();
const recentProblemKeys = new Map<string, number>();

function currentAccountId(): string | null {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id.trim() ? id : null;
    } catch {
        return null;
    }
}

function rawQuestValues(): any[] {
    const quests = QuestsStore?.quests;
    if (!quests) return [];

    const values = typeof quests.values === "function"
        ? Array.from(quests.values())
        : Array.isArray(quests)
            ? quests
            : Object.values(quests);

    return values.map((quest: any) => {
        const id = quest?.id;
        if (!id || typeof QuestsStore?.getQuest !== "function") return quest;
        try { return QuestsStore.getQuest(id) ?? quest; }
        catch { return quest; }
    });
}

function notificationQuestId(quest: any): string {
    return String(quest?.id ?? quest?.config?.id ?? "").trim();
}

function notificationStatus(quest: any): QuestNotificationSnapshot["status"] {
    const expiresAt = new Date(quest?.config?.expiresAt ?? 0).getTime();
    if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now()) return "expired";

    const status = quest?.userStatus;
    if (status?.claimedAt) return "claimed";
    if (status?.completedAt) return "claimable";
    if (status?.enrolledAt) return "in-progress";
    return "available";
}

function readNotificationSnapshot(accountId: string, rawQuests = rawQuestValues()): QuestNotificationSnapshot[] {
    const ignored = ignoredQuestIds(accountId);
    return rawQuests
        .map((quest: any): QuestNotificationSnapshot | null => {
            const id = notificationQuestId(quest);
            if (!id || ignored.has(id)) return null;
            const name = String(
                quest?.config?.messages?.questName
                ?? quest?.config?.application?.name
                ?? quest?.config?.messages?.gameTitle
                ?? `Quest ${id}`
            );
            return {
                id,
                name,
                status: notificationStatus(quest),
                rewardLabel: ""
            };
        })
        .filter((quest): quest is QuestNotificationSnapshot => quest !== null);
}

function openQuestHome(): void {
    NavigationRouter.transitionTo("/quest-home");
}

function observeQuestState(): void {
    const accountId = currentAccountId();
    if (!accountId || !isIgnoredQuestStateReady()) {
        previousAccountId = accountId;
        previousQuests = null;
        knownQuestIds = null;
        return;
    }

    const rawQuests = rawQuestValues();
    const next = readNotificationSnapshot(accountId, rawQuests);
    const allQuestIds = new Set(rawQuests.map(notificationQuestId).filter(Boolean));
    const accountChanged = previousAccountId !== accountId;
    if (accountChanged) knownQuestIds = null;

    if (accountChanged || previousQuests == null || knownQuestIds == null) {
        previousAccountId = accountId;
        previousQuests = next;

        // A freshly started/switched client may briefly expose an empty QuestStore before its
        // initial payload arrives. Do not turn that hydration into a burst of "new Quest" alerts.
        if (allQuestIds.size > 0) {
            if (knownQuestIds == null) knownQuestIds = new Set(allQuestIds);
            else for (const id of allQuestIds) knownQuestIds.add(id);
        }
        return;
    }

    const completed = completedQuestTransitions(previousQuests, next);
    const newlyAvailable = newAvailableQuestTransitions(knownQuestIds, next);
    previousQuests = next;
    for (const id of allQuestIds) knownQuestIds.add(id);

    if (settings.store.notifyQuestCompletion !== false) {
        for (const quest of completed) {
            void showNotification({
                title: "Quest ready to claim",
                body: `${quest.questName} is ready to claim.`,
                onClick: openQuestHome
            });
        }
    }

    if (settings.store.notifyNewQuestAvailable !== false) {
        for (const quest of newlyAvailable) {
            void showNotification({
                title: "New quest available",
                body: `${quest.questName} is available to accept.`,
                onClick: openQuestHome
            });
        }
    }
}

function resetProblemBaseline(accountId: string | null): void {
    problemAccountId = accountId;
    problemBaselineReady = false;
    seenProblemEventIds = new Set<string>();
    recentProblemKeys.clear();
}

function shouldNotifyProblem(event: EventLogEvent, accountId: string): boolean {
    if (!isActionableProblemEvent(event)) return false;
    if (event.quest?.id && ignoredQuestIds(accountId).has(event.quest.id)) return false;

    const now = Date.now();
    for (const [key, timestamp] of recentProblemKeys) {
        if (now - timestamp > PROBLEM_DEDUP_MS) recentProblemKeys.delete(key);
    }

    const key = problemNotificationKey(event);
    const last = recentProblemKeys.get(key);
    if (last != null && now - last <= PROBLEM_DEDUP_MS) return false;
    recentProblemKeys.set(key, now);
    return true;
}

function showProblemNotification(event: EventLogEvent): void {
    const questName = event.quest?.name?.trim();
    const title = questName
        ? "Quest problem"
        : event.source === "orion"
            ? "Orion problem"
            : "QuestUI problem";
    const body = questName ? `${questName}: ${event.summary}` : event.summary;

    void showNotification({
        title,
        body,
        onClick: event.quest ? openQuestHome : undefined
    });
}

async function scanProblemEvents(generation: number): Promise<void> {
    const accountId = currentAccountId();
    if (!accountId || generation !== problemScanGeneration) return;

    if (problemAccountId !== accountId) resetProblemBaseline(accountId);

    let events: EventLogEvent[];
    try {
        const result = await queryEventLog({ sort: "newest", limit: PROBLEM_QUERY_LIMIT });
        events = result.events;
    } catch {
        return;
    }
    if (generation !== problemScanGeneration || currentAccountId() !== accountId) return;

    if (!problemBaselineReady) {
        seenProblemEventIds = new Set(events.map(event => event.id));
        problemBaselineReady = true;
        return;
    }

    const unseen = events.filter(event => !seenProblemEventIds.has(event.id)).reverse();
    seenProblemEventIds = new Set(events.map(event => event.id));
    if (settings.store.notifyRuntimeProblems === false || !isIgnoredQuestStateReady()) return;

    for (const event of unseen) {
        if (shouldNotifyProblem(event, accountId)) showProblemNotification(event);
    }
}

function enqueueProblemScan(generation: number): void {
    problemScanChain = problemScanChain
        .catch(() => { })
        .then(() => scanProblemEvents(generation));
}

function clearProblemScanTimers(): void {
    if (problemScanTimer != null) clearTimeout(problemScanTimer);
    if (problemRecheckTimer != null) clearTimeout(problemRecheckTimer);
    problemScanTimer = null;
    problemRecheckTimer = null;
}

function scheduleProblemScan(): void {
    const generation = problemScanGeneration;
    clearProblemScanTimers();

    problemScanTimer = setTimeout(() => {
        problemScanTimer = null;
        enqueueProblemScan(generation);
    }, PROBLEM_SCAN_DELAY_MS);

    problemRecheckTimer = setTimeout(() => {
        problemRecheckTimer = null;
        enqueueProblemScan(generation);
    }, PROBLEM_RECHECK_DELAY_MS);
}

function onAccountChanged(): void {
    const accountId = currentAccountId();
    if (accountId === previousAccountId && accountId === problemAccountId) return;

    previousAccountId = accountId;
    previousQuests = null;
    knownQuestIds = null;
    problemScanGeneration++;
    clearProblemScanTimers();
    resetProblemBaseline(accountId);
    observeQuestState();
    scheduleProblemScan();
}

export function startQuestNotifications(): void {
    preloadIgnoredQuests();

    if (!questStoreSubscribed && typeof QuestsStore?.addChangeListener === "function") {
        try {
            QuestsStore.addChangeListener(observeQuestState);
            questStoreSubscribed = true;
        } catch { }
    }

    if (!userStoreSubscribed && typeof (UserStore as any)?.addChangeListener === "function") {
        try {
            (UserStore as any).addChangeListener(onAccountChanged);
            userStoreSubscribed = true;
        } catch { }
    }

    if (!ignoredUnsubscribe) {
        ignoredUnsubscribe = subscribeIgnoredQuests(() => {
            // Ignore/Unignore and first persistence hydration are presentation changes, not Quest
            // state transitions. Re-baseline completion state while preserving the session's
            // known Quest IDs so Unignore cannot synthesize a "new Quest" notification either.
            previousQuests = null;
            observeQuestState();
        });
    }

    if (!eventLogUnsubscribe) {
        eventLogUnsubscribe = subscribeEventLog(scheduleProblemScan);
    }

    problemScanGeneration++;
    clearProblemScanTimers();
    resetProblemBaseline(currentAccountId());
    observeQuestState();
    scheduleProblemScan();
}

export function stopQuestNotifications(): void {
    if (questStoreSubscribed) {
        try { QuestsStore?.removeChangeListener?.(observeQuestState); } catch { }
    }
    questStoreSubscribed = false;

    if (userStoreSubscribed) {
        try { (UserStore as any)?.removeChangeListener?.(onAccountChanged); } catch { }
    }
    userStoreSubscribed = false;

    ignoredUnsubscribe?.();
    ignoredUnsubscribe = null;
    eventLogUnsubscribe?.();
    eventLogUnsubscribe = null;

    problemScanGeneration++;
    clearProblemScanTimers();
    previousAccountId = null;
    previousQuests = null;
    knownQuestIds = null;
    resetProblemBaseline(null);
}
