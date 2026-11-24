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

export const REWARD_DETAIL_OPTIONS: ReadonlyArray<{ value: RewardKind; label: string; }> = [
    { value: "orbs", label: "Orbs" },
    { value: "avatar-decoration", label: "Avatar Decoration" },
    { value: "profile-effect", label: "Profile Effect" },
    { value: "nameplate", label: "Nameplate" },
    { value: "profile-frame", label: "Profile Frame" },
    { value: "bundle", label: "Bundle" },
    { value: "collectible", label: "Other Collectible" },
    { value: "nitro-credits", label: "Nitro Credits" },
    { value: "reward-code", label: "Gift Code" },
    { value: "in-game", label: "In Game Item" },
    { value: "unknown", label: "Unknown / Future" }
];

export const REWARD_DETAIL_KINDS: readonly RewardKind[] =
    REWARD_DETAIL_OPTIONS.map(option => option.value);

export const REWARD_FILTER_OPTIONS = [
    { label: "All rewards", value: "all", default: true },
    { label: "Orbs", value: "orbs" },
    { label: "Reward Code", value: "reward-code" },
    { label: "In-game Reward", value: "in-game" },
    { label: "Avatar Decoration", value: "avatar-decoration" },
    { label: "Profile Effect", value: "profile-effect" },
    { label: "Nameplate", value: "nameplate" },
    { label: "Profile Frame", value: "profile-frame" },
    { label: "Bundle", value: "bundle" },
    { label: "Collectible", value: "collectible" },
    { label: "Nitro Credits", value: "nitro-credits" }
] as const;

export const DASHBOARD_REWARD_PRESET_OPTIONS = [
    { label: "All", value: "all", default: true },
    { label: "Orbs", value: "orbs" },
    { label: "Collectible", value: "collectible" },
    { label: "In Game Reward", value: "in-game" },
    { label: "Custom", value: "custom" }
] as const;

export const DEFAULT_DASHBOARD_REWARD_CUSTOM_KINDS =
    REWARD_DETAIL_KINDS.join(",");

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
