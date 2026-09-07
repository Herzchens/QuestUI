import type { NormalizedQuest, NormalizedTask, QuestStatus } from "./questData";

export type DashboardSortMode =
    | "recommended"
    | "expiring"
    | "orb-reward"
    | "required-time-asc"
    | "required-time-desc"
    | "name-asc"
    | "name-desc";

const STATUS_SORT_ORDER: Record<QuestStatus, number> = {
    "in-progress": 0,
    claimable: 1,
    available: 2,
    claimed: 3,
    expired: 4
};

export function normalizeDashboardSortMode(value: unknown): DashboardSortMode {
    if (
        value === "expiring"
        || value === "orb-reward"
        || value === "required-time-asc"
        || value === "required-time-desc"
        || value === "name-asc"
        || value === "name-desc"
    ) return value;
    return "recommended";
}

function activeAcceptedBucket(status: QuestStatus): number {
    return status === "in-progress" || status === "claimable" ? 0 : 1;
}

function compareRecommended(left: NormalizedQuest, right: NormalizedQuest): number {
    const statusDifference = STATUS_SORT_ORDER[left.status] - STATUS_SORT_ORDER[right.status];
    if (statusDifference !== 0) return statusDifference;

    const leftExpiry = left.expiresAt ?? Number.POSITIVE_INFINITY;
    const rightExpiry = right.expiresAt ?? Number.POSITIVE_INFINITY;
    if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;

    return left.name.localeCompare(right.name);
}

function expiryBucket(status: QuestStatus): number {
    if (status === "claimed") return 1;
    if (status === "expired") return 2;
    return 0;
}

function isTimedTask(task: NormalizedTask | null | undefined): task is NormalizedTask {
    if (!task || task.target <= 0) return false;
    if (task.key === "ACHIEVEMENT_IN_ACTIVITY" || task.key === "ACHIEVEMENT_IN_GAME") return false;
    return task.type === "play" || task.type === "stream" || task.type === "video" || task.key === "PLAY_ACTIVITY";
}

export function requiredQuestTimeSeconds(quest: NormalizedQuest): number | null {
    return isTimedTask(quest.primaryTask) ? quest.primaryTask.target : null;
}

export function sortDashboardQuests(
    quests: NormalizedQuest[],
    mode: DashboardSortMode = "recommended",
    effectiveOrbReward: (quest: NormalizedQuest) => number = quest => quest.reward.kind === "orbs" ? quest.reward.orbQuantity : 0
): NormalizedQuest[] {
    const copy = [...quests];

    return copy.sort((left, right) => {
        // Accepted active quests are a Dashboard invariant, not a sort mode. A user-selected
        // alphabetical/reward/time sort may reorder active quests among themselves, but can
        // never bury an enrolled quest below available/claimed/expired history.
        const activeDifference = activeAcceptedBucket(left.status) - activeAcceptedBucket(right.status);
        if (activeDifference !== 0) return activeDifference;

        if (mode === "name-asc" || mode === "name-desc") {
            const nameDifference = left.name.localeCompare(right.name);
            if (nameDifference !== 0) return mode === "name-asc" ? nameDifference : -nameDifference;
            return compareRecommended(left, right);
        }

        if (mode === "orb-reward") {
            const rewardDifference = effectiveOrbReward(right) - effectiveOrbReward(left);
            return rewardDifference !== 0 ? rewardDifference : compareRecommended(left, right);
        }

        if (mode === "required-time-asc" || mode === "required-time-desc") {
            const leftTime = requiredQuestTimeSeconds(left);
            const rightTime = requiredQuestTimeSeconds(right);
            if (leftTime != null && rightTime == null) return -1;
            if (leftTime == null && rightTime != null) return 1;
            if (leftTime != null && rightTime != null && leftTime !== rightTime) {
                return mode === "required-time-asc" ? leftTime - rightTime : rightTime - leftTime;
            }
            return compareRecommended(left, right);
        }

        if (mode === "expiring") {
            const bucketDifference = expiryBucket(left.status) - expiryBucket(right.status);
            if (bucketDifference !== 0) return bucketDifference;

            if (expiryBucket(left.status) === 0) {
                const leftExpiry = left.expiresAt ?? Number.POSITIVE_INFINITY;
                const rightExpiry = right.expiresAt ?? Number.POSITIVE_INFINITY;
                if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;
            }
            return compareRecommended(left, right);
        }

        return compareRecommended(left, right);
    });
}
