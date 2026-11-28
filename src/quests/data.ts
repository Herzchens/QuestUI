import { createSnapshotSource } from "./snapshotSource";
import { findByCodeLazy, findStoreLazy } from "@webpack";
import { useEffect, useState } from "@webpack/common";

import { orbRewardAmounts } from "../orbs/rewards";
import {
    dashboardRewardKindsForPreset,
    normalizeDashboardRewardPreset,
    REWARD_DETAIL_KINDS,
    type RewardFilter,
    type RewardKind
} from "./rewardFilters";
import { sameQuestShortcutSnapshot } from "./shortcut";
import { findQuestByIdentity, taskTypeForKey } from "./presentationLogic";
import type { EventLogQuestRef } from "../eventLog/types";
import { QuestsStore } from "../plugin/stores";

export type QuestStatus = "available" | "in-progress" | "claimable" | "claimed" | "expired";
export type AttentionStatus = "available" | "in-progress" | "claimable";
export type QuestTaskType = "play" | "stream" | "video" | "activity" | "other";
export type { RewardFilter, RewardKind } from "./rewardFilters";
export type QuestSnapshotMode = "live" | "shortcut";

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
    kinds: RewardKind[];
    label: string;
    orbQuantity: number;
    boostedOrbQuantity: number;
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
    expiredAgeDays: number | null;
    rewards: RewardFilter;
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

const StorefrontProductStore = findStoreLazy("StorefrontProductStore") as {
    getProductsForSku?: (skuId: string) => any[] | undefined;
};

const REWARD_CODE = 1;
const IN_GAME_REWARD = 2;
const COLLECTIBLE_REWARD = 3;
const VIRTUAL_CURRENCY_REWARD = 4;
const FRACTIONAL_PREMIUM_REWARD = 5;

const AVATAR_DECORATION = 0;
const PROFILE_EFFECT = 1;
const NAMEPLATE = 2;
const PROFILE_FRAME = 3;
const COLLECTIBLE_BUNDLE = 1000;

function collectibleKindForSku(skuId: unknown): RewardKind {
    if (typeof skuId !== "string" || !skuId) return "collectible";

    try {
        const products = StorefrontProductStore?.getProductsForSku?.(skuId) ?? [];
        for (const product of products) {
            const rawType = product?.type ?? product?.tenantMetadata?.collectibles?.type;
            if (rawType === AVATAR_DECORATION) return "avatar-decoration";
            if (rawType === PROFILE_EFFECT) return "profile-effect";
            if (rawType === NAMEPLATE) return "nameplate";
            if (rawType === PROFILE_FRAME) return "profile-frame";
            if (rawType === COLLECTIBLE_BUNDLE) return "bundle";
        }
    } catch { }

    // Storefront metadata is cache-backed and may not be hydrated yet. Keep a truthful generic
    // Collectible bucket rather than guessing from the localized reward name.
    return "collectible";
}

function configuredRewardKind(rewards: any[]): RewardKind {
    // Match Discord's current reward-modal precedence so mixed/future configurations do not
    // disagree between the card action path and Dashboard filtering.
    if (rewards.some(reward => reward?.type === FRACTIONAL_PREMIUM_REWARD)) return "nitro-credits";

    const collectible = rewards.find(reward => reward?.type === COLLECTIBLE_REWARD);
    if (collectible) return collectibleKindForSku(collectible.skuId);

    if (rewards.some(reward => reward?.type === IN_GAME_REWARD)) return "in-game";
    if (rewards.some(reward => reward?.type === VIRTUAL_CURRENCY_REWARD)) return "orbs";
    if (rewards.some(reward => reward?.type === REWARD_CODE)) return "reward-code";
    return "unknown";
}

function configuredRewardKinds(rewards: any[]): RewardKind[] {
    if (rewards.length === 0) return ["unknown"];

    const found = new Set<RewardKind>();
    for (const reward of rewards) {
        if (reward?.type === FRACTIONAL_PREMIUM_REWARD) found.add("nitro-credits");
        else if (reward?.type === COLLECTIBLE_REWARD) found.add(collectibleKindForSku(reward?.skuId));
        else if (reward?.type === IN_GAME_REWARD) found.add("in-game");
        else if (reward?.type === VIRTUAL_CURRENCY_REWARD) found.add("orbs");
        else if (reward?.type === REWARD_CODE) found.add("reward-code");
        else found.add("unknown");
    }

    return REWARD_DETAIL_KINDS.filter(kind => found.has(kind));
}

// This is only a Dashboard/live-progress render clock. Shortcut surfaces use a
// store-driven subscription so their interactive Header Bar target is not forced
// through a new render four times per second when only progress changes.
const REFRESH_FALLBACK_MS = 250;
const SHORTCUT_REFRESH_FALLBACK_MS = 60_000;

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

    const { base: orbQuantity, boosted: boostedOrbQuantity } = orbRewardAmounts(rewards);
    const names = rewards
        .map((reward: any) => reward?.messages?.name)
        .filter((name: any): name is string => typeof name === "string" && name.trim().length > 0);

    let kind = configuredRewardKind(rewards);
    let kinds = configuredRewardKinds(rewards);
    // Older virtual-currency payloads can expose quantity/name before the numeric type reaches
    // the store. Preserve the already-proven Orb detector only as a compatibility fallback.
    if (kind === "unknown" && (orbQuantity > 0 || names.some((name: string) => /\borbs?\b/i.test(name)))) {
        kind = "orbs";
        kinds = ["orbs"];
    }

    if (kind === "orbs") {
        return {
            kind,
            kinds,
            label: orbQuantity > 0 ? `${Math.round(orbQuantity).toLocaleString()} Orbs` : names.join(" + ") || "Orbs",
            orbQuantity,
            boostedOrbQuantity
        };
    }

    if (kind !== "unknown") {
        return {
            kind,
            kinds,
            label: names.length > 0 ? names.join(" + ") : ({
                "reward-code": "Reward Code",
                "in-game": "In-game Reward",
                "avatar-decoration": "Avatar Decoration",
                "profile-effect": "Profile Effect",
                nameplate: "Nameplate",
                "profile-frame": "Profile Frame",
                bundle: "Collectible Bundle",
                collectible: "Collectible",
                "nitro-credits": "Nitro Credits"
            } as Record<Exclude<RewardKind, "orbs" | "unknown">, string>)[kind],
            orbQuantity: 0,
            boostedOrbQuantity: 0
        };
    }

    return { kind: "unknown", kinds, label: names.join(" + ") || "Unknown reward", orbQuantity: 0, boostedOrbQuantity: 0 };
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

export function readQuestByIdentity(identity: Pick<EventLogQuestRef, "id" | "name">): NormalizedQuest | null {
    const candidates = rawQuests().map(rawQuest => {
        const id = String(rawQuest?.id ?? rawQuest?.config?.id ?? "");
        const name = String(rawQuest?.config?.messages?.questName
            ?? rawQuest?.config?.application?.name
            ?? rawQuest?.config?.messages?.gameTitle
            ?? (id ? `Quest ${id}` : ""));
        return { id, name, rawQuest };
    });
    const matched = findQuestByIdentity(identity, candidates);
    return matched ? normalizeQuest(matched.rawQuest, Date.now()) : null;
}

function readSnapshot(): NormalizedQuest[] {
    const now = Date.now();
    return rawQuests().map(quest => normalizeQuest(quest, now));
}

const liveSource = createSnapshotSource(readSnapshot, () => QuestsStore, REFRESH_FALLBACK_MS);
const shortcutSource = createSnapshotSource(readSnapshot, () => QuestsStore, SHORTCUT_REFRESH_FALLBACK_MS);

export function startQuestSnapshotSources(): void {
    liveSource.start();
    shortcutSource.start();
}

export function stopQuestSnapshotSources(): void {
    const failures: unknown[] = [];
    for (const source of [liveSource, shortcutSource]) {
        try { source.stop(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Quest snapshot cleanup failed.");
}

export function useQuestSnapshot(mode: QuestSnapshotMode = "live"): NormalizedQuest[] {
    const [snapshot, setSnapshot] = useState<NormalizedQuest[]>(readSnapshot);
    useEffect(() => {
        const source = mode === "live" ? liveSource : shortcutSource;
        return source.subscribe((next, force) => {
            setSnapshot(previous => mode !== "live" && !force && sameQuestShortcutSnapshot(previous, next) ? previous : next);
        });
    }, [mode]);
    return snapshot;
}

export function filterQuests(quests: NormalizedQuest[], scope: QuestScope): NormalizedQuest[] {
    const now = Date.now();
    return quests.filter(quest => {
        if (!scope.statuses[quest.status]) return false;

        if (quest.status === "expired" && scope.expiredAgeDays != null && quest.expiresAt != null) {
            const ageMs = Math.max(0, now - quest.expiresAt);
            if (ageMs > scope.expiredAgeDays * 86_400_000) return false;
        }

        if (scope.rewards !== "all") {
            if (scope.rewards.length === 0) return false;
            const rewardKinds = quest.reward.kinds?.length > 0 ? quest.reward.kinds : [quest.reward.kind];
            if (!rewardKinds.some(kind => scope.rewards !== "all" && scope.rewards.includes(kind))) return false;
        }

        const taskTypes = quest.tasks.length > 0
            ? quest.tasks.map(task => task.type)
            : ["other" as QuestTaskType];

        return taskTypes.some(type => scope.taskTypes[type]);
    });
}

function normalizeDetailedRewardFilter(value: any, includeUnknownRewards: boolean): RewardFilter {
    if (value === "all") return "all";
    const selected = REWARD_DETAIL_KINDS.find(kind => kind !== "unknown" && kind === value);
    if (!selected) return "all";
    return includeUnknownRewards ? [selected, "unknown"] : [selected];
}

function normalizeExpiredAgeDays(value: any): number | null {
    const days = Math.floor(Number(value));
    return Number.isFinite(days) && days > 0 ? days : null;
}

export function dashboardScopeFromSettings(store: any): QuestScope {
    const rewardPreset = normalizeDashboardRewardPreset(store.dashboardRewardPreset);
    const selectedRewardKinds = rewardPreset === "all"
        ? "all"
        : dashboardRewardKindsForPreset(rewardPreset, store.dashboardRewardCustomKinds);

    return {
        statuses: {
            available: store.dashboardShowAvailable !== false,
            "in-progress": store.dashboardShowInProgress !== false,
            claimable: store.dashboardShowClaimable !== false,
            claimed: store.dashboardShowClaimed === true,
            expired: store.dashboardShowExpired === true
        },
        expiredAgeDays: normalizeExpiredAgeDays(store.dashboardExpiredAgeDays),
        rewards: selectedRewardKinds,
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
        expiredAgeDays: null,
        rewards: normalizeDetailedRewardFilter(
            store.detailedRewardFilter,
            store.detailedIncludeUnknownRewards !== false
        ),
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
