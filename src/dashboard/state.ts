import settings from "../plugin/settings";
import type { NormalizedQuest } from "../quests/data";

export const DASHBOARD_SETTING_KEYS = [
    "dashboardShowAvailable",
    "dashboardShowInProgress",
    "dashboardShowClaimable",
    "dashboardShowClaimed",
    "dashboardShowExpired",
    "dashboardShowIgnored",
    "dashboardExpiredAgeDays",
    "dashboardRewardFilter",
    "dashboardIncludeUnknownRewards",
    "dashboardShowPlay",
    "dashboardShowStream",
    "dashboardShowVideo",
    "dashboardShowActivity",
    "dashboardShowOther",
    "dashboardSortMode"
] as const;

export function dashboardFilterCount(store: any): number {
    let count = 0;
    if (store.dashboardShowAvailable === false) count++;
    if (store.dashboardShowInProgress === false) count++;
    if (store.dashboardShowClaimable === false) count++;
    if (store.dashboardShowClaimed !== true) count++;
    if (store.dashboardShowExpired !== true) count++;
    if (store.dashboardShowIgnored === true) count++;
    if (store.dashboardRewardFilter !== "all") count++;
    if (store.dashboardShowExpired === true && Math.floor(Number(store.dashboardExpiredAgeDays ?? 0)) !== 0) count++;
    if (store.dashboardShowPlay === false) count++;
    if (store.dashboardShowStream === false) count++;
    if (store.dashboardShowVideo === false) count++;
    if (store.dashboardShowActivity === false) count++;
    if (store.dashboardShowOther === false) count++;
    return count;
}

export function ensureDashboardV16FilterDefaults(): void {
    if (settings.store.dashboardFiltersV16Initialized === true) return;

    // v1.5 defaulted Claimed and Expired off, which made a fresh-looking Dashboard
    // start with "Filter (2)". v1.6 starts from the full normal Quest history instead.
    settings.store.dashboardShowAvailable = true;
    settings.store.dashboardShowInProgress = true;
    settings.store.dashboardShowClaimable = true;
    settings.store.dashboardShowClaimed = true;
    settings.store.dashboardShowExpired = true;
    settings.store.dashboardExpiredAgeDays = 0;
    settings.store.dashboardRewardFilter = "all";
    settings.store.dashboardIncludeUnknownRewards = true;
    settings.store.dashboardShowPlay = true;
    settings.store.dashboardShowStream = true;
    settings.store.dashboardShowVideo = true;
    settings.store.dashboardShowActivity = true;
    settings.store.dashboardShowOther = true;
    settings.store.dashboardFiltersV16Initialized = true;
}

export function clearDashboardFilters(): void {
    settings.store.dashboardShowAvailable = true;
    settings.store.dashboardShowInProgress = true;
    settings.store.dashboardShowClaimable = true;
    settings.store.dashboardShowClaimed = true;
    settings.store.dashboardShowExpired = true;
    settings.store.dashboardShowIgnored = true;
    settings.store.dashboardExpiredAgeDays = 0;
    settings.store.dashboardRewardFilter = "all";
    settings.store.dashboardIncludeUnknownRewards = true;
    settings.store.dashboardShowPlay = true;
    settings.store.dashboardShowStream = true;
    settings.store.dashboardShowVideo = true;
    settings.store.dashboardShowActivity = true;
    settings.store.dashboardShowOther = true;
}

export function restoreRecommendedFilters(): void {
    settings.store.dashboardShowAvailable = true;
    settings.store.dashboardShowInProgress = true;
    settings.store.dashboardShowClaimable = true;
    settings.store.dashboardShowClaimed = false;
    settings.store.dashboardShowExpired = false;
    settings.store.dashboardShowIgnored = false;
    settings.store.dashboardExpiredAgeDays = 15;
    settings.store.dashboardRewardFilter = "all";
    settings.store.dashboardIncludeUnknownRewards = true;
    settings.store.dashboardShowPlay = true;
    settings.store.dashboardShowStream = true;
    settings.store.dashboardShowVideo = true;
    settings.store.dashboardShowActivity = true;
    settings.store.dashboardShowOther = true;
}


export function partitionIgnored(quests: NormalizedQuest[], ignoredIds: ReadonlySet<string>): {
    normal: NormalizedQuest[];
    ignored: NormalizedQuest[];
} {
    const normal: NormalizedQuest[] = [];
    const ignored: NormalizedQuest[] = [];
    for (const quest of quests) (ignoredIds.has(quest.id) ? ignored : normal).push(quest);
    return { normal, ignored };
}
