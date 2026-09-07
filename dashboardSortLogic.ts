import type { NormalizedQuest, QuestStatus } from "./questData";

export type DashboardSortMode = "recommended" | "expiring" | "orb-reward" | "name-asc" | "name-desc";

const STATUS_SORT_ORDER: Record<QuestStatus, number> = {
    "in-progress": 0,
    claimable: 1,
    available: 2,
    claimed: 3,
    expired: 4
};

export function normalizeDashboardSortMode(value: unknown): DashboardSortMode {
    if (value === "expiring" || value === "orb-reward" || value === "name-asc" || value === "name-desc") return value;
    return "recommended";
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

export function sortDashboardQuests(
    quests: NormalizedQuest[],
    mode: DashboardSortMode = "recommended",
    effectiveOrbReward: (quest: NormalizedQuest) => number = quest => quest.reward.kind === "orbs" ? quest.reward.orbQuantity : 0
): NormalizedQuest[] {
    const copy = [...quests];

    return copy.sort((left, right) => {
        if (mode === "name-asc" || mode === "name-desc") {
            const nameDifference = left.name.localeCompare(right.name);
            if (nameDifference !== 0) return mode === "name-asc" ? nameDifference : -nameDifference;
            return compareRecommended(left, right);
        }

        if (mode === "orb-reward") {
            const rewardDifference = effectiveOrbReward(right) - effectiveOrbReward(left);
            return rewardDifference !== 0 ? rewardDifference : compareRecommended(left, right);
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
