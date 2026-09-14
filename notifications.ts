import { showNotification } from "@api/Notifications";
import { NavigationRouter, UserStore } from "@webpack/common";

import {
    ignoredQuestIds,
    isIgnoredQuestStateReady,
    preloadIgnoredQuests,
    subscribeIgnoredQuests
} from "./ignoredQuests";
import { completedQuestTransitions, type QuestNotificationSnapshot } from "./notificationLogic";
import settings from "./settings";
import { QuestsStore } from "./stores";

let previousAccountId: string | null = null;
let previousQuests: QuestNotificationSnapshot[] | null = null;
let questStoreSubscribed = false;
let userStoreSubscribed = false;
let ignoredUnsubscribe: (() => void) | null = null;

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

function notificationStatus(quest: any): QuestNotificationSnapshot["status"] {
    const status = quest?.userStatus;
    if (status?.claimedAt) return "claimed";
    if (status?.completedAt) return "claimable";
    if (status?.enrolledAt) return "in-progress";
    return "available";
}

function readNotificationSnapshot(accountId: string): QuestNotificationSnapshot[] {
    const ignored = ignoredQuestIds(accountId);
    return rawQuestValues()
        .map((quest: any): QuestNotificationSnapshot | null => {
            const id = String(quest?.id ?? quest?.config?.id ?? "").trim();
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
        return;
    }

    const next = readNotificationSnapshot(accountId);
    if (previousAccountId !== accountId || previousQuests == null) {
        previousAccountId = accountId;
        previousQuests = next;
        return;
    }

    const completed = completedQuestTransitions(previousQuests, next);
    previousQuests = next;
    if (settings.store.notifyQuestCompletion === false) return;

    for (const quest of completed) {
        void showNotification({
            title: "Quest ready to claim",
            body: `${quest.questName} is ready to claim.`,
            onClick: openQuestHome
        });
    }
}

function onAccountChanged(): void {
    const accountId = currentAccountId();
    if (accountId === previousAccountId) return;
    previousAccountId = accountId;
    previousQuests = null;
    observeQuestState();
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
            // completion transitions. Re-baseline so neither can synthesize a notification.
            previousQuests = null;
            observeQuestState();
        });
    }

    observeQuestState();
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
    previousAccountId = null;
    previousQuests = null;
}
