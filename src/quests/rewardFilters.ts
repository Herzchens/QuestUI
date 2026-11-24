export type RewardKind =
    | "orbs"
    | "reward-code"
    | "in-game"
    | "avatar-decoration"
    | "profile-effect"
    | "nameplate"
    | "profile-frame"
    | "bundle"
    | "collectible"
    | "nitro-credits"
    | "unknown";

export type RewardFilter = "all" | readonly RewardKind[];
export type DashboardRewardPreset = "all" | "orbs" | "collectible" | "in-game" | "custom";

export const REWARD_DETAIL_KINDS: readonly RewardKind[] = [
    "orbs",
    "avatar-decoration",
    "profile-effect",
    "nameplate",
    "profile-frame",
    "bundle",
    "collectible",
    "nitro-credits",
    "reward-code",
    "in-game",
    "unknown"
];

export const COLLECTIBLE_REWARD_KINDS: readonly RewardKind[] = [
    "avatar-decoration",
    "profile-effect",
    "nameplate",
    "profile-frame",
    "bundle",
    "collectible"
];

const DASHBOARD_REWARD_PRESETS: readonly DashboardRewardPreset[] = [
    "all",
    "orbs",
    "collectible",
    "in-game",
    "custom"
];

export function isRewardKind(value: unknown): value is RewardKind {
    return typeof value === "string" && REWARD_DETAIL_KINDS.includes(value as RewardKind);
}

export function normalizeDashboardRewardPreset(value: unknown): DashboardRewardPreset {
    return DASHBOARD_REWARD_PRESETS.includes(value as DashboardRewardPreset)
        ? value as DashboardRewardPreset
        : "all";
}

export function parseDashboardRewardKinds(value: unknown): RewardKind[] {
    const raw = Array.isArray(value)
        ? value
        : typeof value === "string"
            ? value.split(",")
            : [];

    const selected = new Set(raw
        .map(item => typeof item === "string" ? item.trim() : "")
        .filter(isRewardKind));

    return REWARD_DETAIL_KINDS.filter(kind => selected.has(kind));
}

export function serializeDashboardRewardKinds(kinds: readonly RewardKind[]): string {
    const selected = new Set(kinds);
    return REWARD_DETAIL_KINDS.filter(kind => selected.has(kind)).join(",");
}

export function dashboardRewardKindsForPreset(
    presetValue: unknown,
    customKindsValue: unknown
): RewardKind[] {
    const preset = normalizeDashboardRewardPreset(presetValue);
    if (preset === "all") return [...REWARD_DETAIL_KINDS];
    if (preset === "orbs") return ["orbs"];
    if (preset === "collectible") return [...COLLECTIBLE_REWARD_KINDS];
    if (preset === "in-game") return ["in-game"];
    return parseDashboardRewardKinds(customKindsValue);
}

export function legacyDashboardRewardSelection(value: unknown): {
    preset: DashboardRewardPreset;
    customKinds: RewardKind[];
} {
    const legacy = typeof value === "string" ? value : "all";

    if (legacy === "orbs") return { preset: "orbs", customKinds: [...REWARD_DETAIL_KINDS] };
    if (legacy === "in-game") return { preset: "in-game", customKinds: [...REWARD_DETAIL_KINDS] };

    if (legacy === "non-orbs") {
        return {
            preset: "custom",
            customKinds: REWARD_DETAIL_KINDS.filter(kind => kind !== "orbs")
        };
    }

    if (legacy !== "all" && isRewardKind(legacy)) {
        return { preset: "custom", customKinds: [legacy] };
    }

    return { preset: "all", customKinds: [...REWARD_DETAIL_KINDS] };
}
