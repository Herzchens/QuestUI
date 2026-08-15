import { findByCodeLazy } from "@webpack";
import { useEffect, useState } from "@webpack/common";

import { QuestsStore } from "./stores";

export type QuestStatus = "available" | "in-progress" | "claimable" | "claimed" | "expired";
export type AttentionStatus = "available" | "in-progress" | "claimable";
export type QuestTaskType = "play" | "stream" | "video" | "activity" | "other";
export type RewardKind = "orbs" | "non-orbs" | "unknown";
export type RewardFilter = "all" | "orbs" | "non-orbs";

export interface NormalizedTask {
    key: string;
    type: QuestTaskType;
    current: number;
    target: number;
    hasProgress: boolean;
    applicationId: string | null;
}

export interface NormalizedReward {
    kind: RewardKind;
    label: string;
    orbQuantity: number;
}

export interface NormalizedQuest {
    id: string;
    name: string;
    status: QuestStatus;
    expiresAt: number | null;
    reward: NormalizedReward;
    tasks: NormalizedTask[];
    primaryTask: NormalizedTask | null;
    progress: number;
    imageUrl: string | null;
    logotypeUrl: string | null;
    applicationId: string | null;
    rawQuest: any;
}

export interface QuestStatusCounts {
    available: number;
    inProgress: number;
    claimable: number;
    claimed: number;
    expired: number;
}

export interface AttentionCounts {
    available: number;
    inProgress: number;
    claimable: number;
}

export interface QuestScope {
    statuses: Record<QuestStatus, boolean>;
    rewards: RewardFilter;
    includeUnknownRewards: boolean;
    taskTypes: Record<QuestTaskType, boolean>;
}

interface DiscordTaskDetails {
    progressSeconds?: number;
    targetSeconds?: number;
    percentComplete?: number;
    taskType?: string;
    applications?: string[];
}

const EMPTY_COUNTS: QuestStatusCounts = {
    available: 0,
    inProgress: 0,
    claimable: 0,
    claimed: 0,
    expired: 0
};

const STATUS_SORT_ORDER: Record<QuestStatus, number> = {
    "in-progress": 0,
    claimable: 1,
    available: 2,
    claimed: 3,
    expired: 4
};

// Discord's native Quest task selector/details helper. It chooses the task from
// heartbeat/update timestamps and eventName, then applies Discord's own stored,
// optimistic-video, and active-desktop progress calculation. QuestUI does not run
// a parallel progress engine and does not consume Orion's private dashboard state.
const getDiscordSelectedTaskDetails = findByCodeLazy(
    "heartbeat?.lastBeatAt",
    "updatedAt",
    "eventName",
    "includeTaskTypes"
) as (quest: any, includeTaskTypes?: Set<string>) => DiscordTaskDetails | null;

// This is only a render clock. Each tick re-reads Discord state/native helpers; it
// never increments progress and never performs a Quest network request.
const REFRESH_FALLBACK_MS = 250;

type SnapshotListener = (quests: NormalizedQuest[]) => void;

const snapshotListeners = new Set<SnapshotListener>();
let currentSnapshot: NormalizedQuest[] = [];
let sourceStarted = false;
let storeSubscribed = false;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

function finiteNumber(value: any, fallback = 0): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function floor(value: number, precision: number): number {
    const factor = 10 ** precision;
    return Math.floor(value * factor) / factor;
}

function readDate(value: any): number | null {
    if (!value) return null;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function rawQuests(): any[] {
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
        try {
            return QuestsStore.getQuest(id) ?? quest;
        } catch {
            return quest;
        }
    });
}

function questStatus(quest: any, now: number): QuestStatus {
    const expiresAt = readDate(quest?.config?.expiresAt);
    const userStatus = quest?.userStatus;

    if (expiresAt != null && expiresAt <= now) return "expired";
    if (userStatus?.claimedAt) return "claimed";
    if (userStatus?.completedAt) return "claimable";
    if (userStatus?.enrolledAt) return "in-progress";
    return "available";
}

function rewardInfo(quest: any): NormalizedReward {
    const rewards = Array.isArray(quest?.config?.rewardsConfig?.rewards)
        ? quest.config.rewardsConfig.rewards
        : [];

    const orbQuantity = rewards.reduce((sum: number, reward: any) => {
        return sum + Math.max(0, finiteNumber(reward?.orbQuantity));
    }, 0);

    const names = rewards
        .map((reward: any) => reward?.messages?.name)
        .filter((name: any): name is string => typeof name === "string" && name.trim().length > 0);

    const hasOrbName = names.some((name: string) => /\borbs?\b/i.test(name));
    if (orbQuantity > 0 || hasOrbName) {
        return {
            kind: "orbs",
            label: orbQuantity > 0 ? `${Math.round(orbQuantity).toLocaleString()} Orbs` : names.join(" + "),
            orbQuantity
        };
    }

    if (rewards.length > 0 || names.length > 0) {
        return {
            kind: "non-orbs",
            label: names.length > 0 ? names.join(" + ") : "Reward",
            orbQuantity: 0
        };
    }

    return { kind: "unknown", label: "Unknown reward", orbQuantity: 0 };
}

function taskTypeForKey(key: string): QuestTaskType {
    if (key === "ACHIEVEMENT_IN_ACTIVITY" || key === "ACHIEVEMENT_IN_GAME" || key === "PLAY_ACTIVITY") return "activity";
    if (key.startsWith("STREAM")) return "stream";
    if (key.includes("VIDEO")) return "video";
    if (key.startsWith("PLAY")) return "play";
    if (key.includes("ACTIVITY") || key.includes("ACHIEVEMENT")) return "activity";
    return "other";
}

function taskEntries(tasks: any): Array<[string, any]> {
    if (!tasks) return [];
    if (tasks instanceof Map) return Array.from(tasks.entries());
    if (typeof tasks === "object") return Object.entries(tasks);
    return [];
}

function selectedTaskEntries(quest: any): Array<[string, any]> {
    const current = taskEntries(quest?.config?.taskConfigV2?.tasks);
    if (current.length > 0) return current;
    return taskEntries(quest?.config?.taskConfig?.tasks);
}

function progressEntries(progress: any): Array<[string, any]> {
    if (!progress) return [];
    if (progress instanceof Map) return Array.from(progress.entries());
    if (typeof progress === "object") return Object.entries(progress);
    return [];
}

function progressTimestamp(entry: any): number {
    const timestamp = entry?.heartbeat?.lastBeatAt ?? entry?.updatedAt;
    if (!timestamp) return 0;
    const value = new Date(timestamp).getTime();
    return Number.isFinite(value) ? value : 0;
}

function taskKeyFromEvent(entries: Array<[string, any]>, eventName: string | undefined): string | null {
    if (!eventName) return null;
    const match = entries.find(([key, task]) => key === eventName || task?.type === eventName);
    return match?.[0] ?? null;
}

function fallbackTaskKey(quest: any, entries: Array<[string, any]>): string | null {
    if (entries.length === 0) return null;

    const orderedProgress = progressEntries(quest?.userStatus?.progress)
        .sort(([, left], [, right]) => progressTimestamp(right) - progressTimestamp(left));

    for (const [fallbackKey, progress] of orderedProgress) {
        const key = taskKeyFromEvent(entries, progress?.eventName ?? fallbackKey);
        if (key) return key;
    }

    const has = (key: string) => entries.some(([entryKey, task]) => entryKey === key || task?.type === key);
    const firstOf = (...keys: string[]) => keys.find(has) ?? null;

    return firstOf("WATCH_VIDEO", "WATCH_VIDEO_ON_MOBILE")
        ?? firstOf("ACHIEVEMENT_IN_ACTIVITY", "ACHIEVEMENT_IN_GAME")
        ?? firstOf("PLAY_ACTIVITY")
        ?? firstOf("PLAY_ON_DESKTOP", "PLAY_ON_DESKTOP_V2")
        ?? firstOf("STREAM_ON_DESKTOP")
        ?? firstOf("PLAY_ON_PLAYSTATION", "PLAY_ON_XBOX")
        ?? entries[0][0];
}

function rawProgressForTask(quest: any, key: string, task: any): number {
    if (quest?.userStatus?.completedAt) return Math.max(0, finiteNumber(task?.target));

    const progress = quest?.userStatus?.progress;
    const direct = progress instanceof Map ? progress.get(key) : progress?.[key];
    const typed = task?.type && task.type !== key
        ? (progress instanceof Map ? progress.get(task.type) : progress?.[task.type])
        : null;
    const value = finiteNumber(direct?.value ?? typed?.value, Number.NaN);
    if (Number.isFinite(value)) return Math.max(0, value);

    if (taskTypeForKey(key) === "stream") {
        return Math.max(0, finiteNumber(quest?.userStatus?.streamProgressSeconds));
    }

    return 0;
}

function isAchievementTask(key: string, task: any): boolean {
    const eventName = String(task?.type ?? key);
    return eventName === "ACHIEVEMENT_IN_ACTIVITY" || eventName === "ACHIEVEMENT_IN_GAME";
}

function storedTaskDetails(quest: any, key: string, task: any): DiscordTaskDetails {
    const target = Math.max(0, finiteNumber(task?.target));
    const current = rawProgressForTask(quest, key, task);
    return {
        progressSeconds: current,
        targetSeconds: target,
        percentComplete: target > 0 ? floor(Math.min(current / target, 1), 4) : 0,
        taskType: String(task?.type ?? key),
        applications: task?.applications?.map?.((application: any) => String(application?.id)).filter(Boolean)
    };
}

function nativeSelectedDetails(quest: any): DiscordTaskDetails | null {
    try {
        return getDiscordSelectedTaskDetails(quest) ?? null;
    } catch {
        return null;
    }
}

function normalizeTasks(quest: any): { tasks: NormalizedTask[]; primaryTask: NormalizedTask | null; progress: number; } {
    const entries = selectedTaskEntries(quest);
    const selectedByDiscord = nativeSelectedDetails(quest);
    const nativeSelectedKey = taskKeyFromEvent(entries, selectedByDiscord?.taskType);
    const selectedKey = nativeSelectedKey ?? fallbackTaskKey(quest, entries);
    const selectedEntry = entries.find(([key]) => key === selectedKey) ?? null;

    // Discord handles achievement ratios in a separate native selector. Keep only raw
    // discrete counts here; QuestDashboard uses Discord's completion selector for the ring.
    const selectedDetails = selectedEntry
        ? (nativeSelectedKey != null && selectedByDiscord != null && !isAchievementTask(selectedEntry[0], selectedEntry[1])
            ? selectedByDiscord
            : storedTaskDetails(quest, selectedEntry[0], selectedEntry[1]))
        : null;

    const tasks = entries.map(([key, task]) => {
        const type = taskTypeForKey(String(task?.type ?? key));
        const isSelected = key === selectedKey;
        const target = isSelected && selectedDetails?.targetSeconds != null
            ? Math.max(0, finiteNumber(selectedDetails.targetSeconds))
            : Math.max(0, finiteNumber(task?.target));
        const current = isSelected && selectedDetails?.progressSeconds != null
            ? Math.max(0, finiteNumber(selectedDetails.progressSeconds))
            : rawProgressForTask(quest, key, task);
        const progress = quest?.userStatus?.progress;
        const rawEntry = progress instanceof Map ? progress.get(key) : progress?.[key];

        return {
            key,
            type,
            current,
            target,
            hasProgress: rawEntry != null || current > 0,
            applicationId: String(task?.applications?.[0]?.id ?? quest?.config?.application?.id ?? "") || null
        };
    });

    const primaryTask = tasks.find(task => task.key === selectedKey) ?? tasks[0] ?? null;
    const percentComplete = quest?.userStatus?.completedAt
        ? 1
        : Math.max(0, Math.min(1, finiteNumber(selectedDetails?.percentComplete)));

    return { tasks, primaryTask, progress: percentComplete * 100 };
}

function questImage(quest: any): string | null {
    const assets = quest?.config?.assets;
    const candidates = [
        assets?.gameTileDark,
        assets?.gameTile,
        assets?.gameTileLight,
        assets?.questBarHero,
        assets?.hero
    ];
    return candidates.find((value: any) => typeof value === "string" && value.length > 0) ?? null;
}

function questLogotype(quest: any): string | null {
    const assets = quest?.config?.assets;
    const candidates = [assets?.logotypeDark, assets?.logotype, assets?.logotypeLight];
    return candidates.find((value: any) => typeof value === "string" && value.length > 0) ?? null;
}

function normalizeQuest(quest: any, now: number): NormalizedQuest {
    const id = String(quest?.id ?? quest?.config?.id ?? "unknown");
    const { tasks, primaryTask, progress } = normalizeTasks(quest);
    const fallbackApplicationId = String(quest?.config?.application?.id ?? "") || null;

    return {
        id,
        name: quest?.config?.messages?.questName
            ?? quest?.config?.application?.name
            ?? quest?.config?.messages?.gameTitle
            ?? `Quest ${id}`,
        status: questStatus(quest, now),
        expiresAt: readDate(quest?.config?.expiresAt),
        reward: rewardInfo(quest),
        tasks,
        primaryTask,
        progress,
        imageUrl: questImage(quest),
        logotypeUrl: questLogotype(quest),
        applicationId: primaryTask?.applicationId ?? fallbackApplicationId,
        rawQuest: quest
    };
}

function readSnapshot(): NormalizedQuest[] {
    const now = Date.now();
    return rawQuests().map(quest => normalizeQuest(quest, now));
}

function ensureStoreSubscription(): void {
    if (storeSubscribed) return;
    try {
        if (typeof QuestsStore?.addChangeListener === "function") {
            QuestsStore.addChangeListener(refreshSnapshot);
            storeSubscribed = true;
        }
    } catch { }
}

function refreshSnapshot(): void {
    ensureStoreSubscription();
    currentSnapshot = readSnapshot();
    for (const listener of snapshotListeners) listener(currentSnapshot);
}

function startSource(): void {
    if (sourceStarted) return;
    sourceStarted = true;
    ensureStoreSubscription();
    fallbackTimer = setInterval(refreshSnapshot, REFRESH_FALLBACK_MS);
    refreshSnapshot();
}

function stopSource(): void {
    if (!sourceStarted) return;
    sourceStarted = false;

    try {
        if (storeSubscribed) QuestsStore?.removeChangeListener?.(refreshSnapshot);
    } catch { }
    storeSubscribed = false;

    if (fallbackTimer != null) clearInterval(fallbackTimer);
    fallbackTimer = null;
}

function subscribeSnapshot(listener: SnapshotListener): () => void {
    snapshotListeners.add(listener);
    startSource();
    listener(currentSnapshot);

    return () => {
        snapshotListeners.delete(listener);
        if (snapshotListeners.size === 0) stopSource();
    };
}

export function useQuestSnapshot(): NormalizedQuest[] {
    const [snapshot, setSnapshot] = useState<NormalizedQuest[]>(readSnapshot);
    useEffect(() => subscribeSnapshot(setSnapshot), []);
    return snapshot;
}

export function filterQuests(quests: NormalizedQuest[], scope: QuestScope): NormalizedQuest[] {
    return quests.filter(quest => {
        if (!scope.statuses[quest.status]) return false;

        if (scope.rewards !== "all") {
            if (quest.reward.kind === "unknown") {
                if (!scope.includeUnknownRewards) return false;
            } else if (quest.reward.kind !== scope.rewards) {
                return false;
            }
        }

        const taskTypes = quest.tasks.length > 0
            ? quest.tasks.map(task => task.type)
            : ["other" as QuestTaskType];

        return taskTypes.some(type => scope.taskTypes[type]);
    });
}

function normalizeRewardFilter(value: any): RewardFilter {
    return value === "orbs" || value === "non-orbs" ? value : "all";
}

export function dashboardScopeFromSettings(store: any): QuestScope {
    return {
        statuses: {
            available: store.dashboardShowAvailable !== false,
            "in-progress": store.dashboardShowInProgress !== false,
            claimable: store.dashboardShowClaimable !== false,
            claimed: store.dashboardShowClaimed === true,
            expired: store.dashboardShowExpired === true
        },
        rewards: normalizeRewardFilter(store.dashboardRewardFilter),
        includeUnknownRewards: store.dashboardIncludeUnknownRewards !== false,
        taskTypes: {
            play: store.dashboardShowPlay !== false,
            stream: store.dashboardShowStream !== false,
            video: store.dashboardShowVideo !== false,
            activity: store.dashboardShowActivity !== false,
            other: store.dashboardShowOther !== false
        }
    };
}

export function detailedScopeFromSettings(store: any): QuestScope {
    if (store.detailedStatusScope !== "custom") return dashboardScopeFromSettings(store);

    return {
        statuses: {
            available: store.detailedShowAvailable !== false,
            "in-progress": store.detailedShowInProgress !== false,
            claimable: store.detailedShowClaimable !== false,
            claimed: false,
            expired: false
        },
        rewards: normalizeRewardFilter(store.detailedRewardFilter),
        includeUnknownRewards: store.detailedIncludeUnknownRewards !== false,
        taskTypes: {
            play: store.detailedShowPlay !== false,
            stream: store.detailedShowStream !== false,
            video: store.detailedShowVideo !== false,
            activity: store.detailedShowActivity !== false,
            other: store.detailedShowOther !== false
        }
    };
}

export function questStatusCounts(quests: NormalizedQuest[]): QuestStatusCounts {
    return quests.reduce<QuestStatusCounts>((counts, quest) => {
        if (quest.status === "in-progress") counts.inProgress++;
        else counts[quest.status]++;
        return counts;
    }, { ...EMPTY_COUNTS });
}

export function attentionCounts(quests: NormalizedQuest[]): AttentionCounts {
    const counts = questStatusCounts(quests);
    return {
        available: counts.available,
        inProgress: counts.inProgress,
        claimable: counts.claimable
    };
}

export function prioritizedAttention(counts: AttentionCounts): { status: AttentionStatus; count: number; } | null {
    if (counts.inProgress > 0) return { status: "in-progress", count: counts.inProgress };
    if (counts.claimable > 0) return { status: "claimable", count: counts.claimable };
    if (counts.available > 0) return { status: "available", count: counts.available };
    return null;
}

export function sortDashboardQuests(quests: NormalizedQuest[]): NormalizedQuest[] {
    return [...quests].sort((left, right) => {
        const statusDifference = STATUS_SORT_ORDER[left.status] - STATUS_SORT_ORDER[right.status];
        if (statusDifference !== 0) return statusDifference;

        const leftExpiry = left.expiresAt ?? Number.POSITIVE_INFINITY;
        const rightExpiry = right.expiresAt ?? Number.POSITIVE_INFINITY;
        if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;

        return left.name.localeCompare(right.name);
    });
}

export function formatExpiry(expiresAt: number | null, now = Date.now()): string | null {
    if (expiresAt == null) return null;

    const difference = expiresAt - now;
    const absolute = Math.abs(difference);
    const minutes = Math.floor(absolute / 60_000);
    const hours = Math.floor(absolute / 3_600_000);
    const days = Math.floor(absolute / 86_400_000);

    let duration: string;
    if (absolute < 60_000) duration = "<1m";
    else if (absolute < 3_600_000) duration = `${minutes}m`;
    else if (absolute < 86_400_000) duration = `${hours}h ${minutes % 60}m`;
    else duration = `${days}d ${hours % 24}h`;

    return difference <= 0 ? `Expired ${duration} ago` : `Expires in ${duration}`;
}

export function expiryUrgency(expiresAt: number | null, now = Date.now()): "normal" | "warning" | "danger" | "expired" {
    if (expiresAt == null) return "normal";
    const difference = expiresAt - now;
    if (difference <= 0) return "expired";
    if (difference < 3_600_000) return "danger";
    if (difference < 86_400_000) return "warning";
    return "normal";
}

function formatDuration(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remainingSeconds = safeSeconds % 60;

    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    if (minutes > 0) return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    return `${remainingSeconds}s`;
}

function taskTypeLabel(type: QuestTaskType): string {
    if (type === "play") return "Play";
    if (type === "stream") return "Stream";
    if (type === "video") return "Video";
    if (type === "activity") return "Activity";
    return "Quest";
}

function isTimedTask(task: NormalizedTask): boolean {
    if (task.key === "ACHIEVEMENT_IN_ACTIVITY" || task.key === "ACHIEVEMENT_IN_GAME") return false;
    return task.type === "play" || task.type === "stream" || task.type === "video" || task.key === "PLAY_ACTIVITY";
}

export function formatQuestProgress(quest: NormalizedQuest): string {
    if (quest.status === "claimable" || quest.status === "claimed") return "Completed";

    const task = quest.primaryTask;
    if (!task || task.target <= 0) return `${Math.round(Math.max(0, quest.progress))}%`;

    const label = taskTypeLabel(task.type);
    const timed = isTimedTask(task);
    if (quest.status === "available") {
        return timed
            ? `${label} · ${formatDuration(task.target)} required`
            : `${label} · target ${Math.floor(task.target)}`;
    }

    const current = Math.min(task.current, task.target);
    if (timed) return `${label} · ${formatDuration(current)} / ${formatDuration(task.target)}`;
    return `${label} · ${Math.floor(current)} / ${Math.floor(task.target)}`;
}
