import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

const rewardOptions = [
    { label: "All rewards", value: "all", default: true },
    { label: "Orbs only", value: "orbs" },
    { label: "Non-Orb rewards", value: "non-orbs" }
] as const;

export default definePluginSettings({
    showQuestsButtonTopBar: {
        type: OptionType.BOOLEAN,
        description: "Show the Quests button in Discord's top bar.",
        default: true,
        restartNeeded: true
    },
    showQuestsButtonSettingsBar: {
        type: OptionType.BOOLEAN,
        description: "Show the Quests button beside mute, deafen and settings.",
        default: false,
        restartNeeded: true
    },
    showQuestsButtonBadges: {
        type: OptionType.BOOLEAN,
        displayName: "Show colored Quest Home counters",
        description: "Show colored quest counters on Discord's Quest Home links: red = available, yellow = in progress, green = ready to claim, blurple = claimed.",
        default: false,
        restartNeeded: true
    },

    dashboardMode: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard Mode",
        description: "Open QuestUI's live mini dashboard when clicking a Quest button instead of navigating directly to Discord Quest Home.",
        default: false
    },
    dashboardShowAvailable: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Available",
        description: "Show quests that can be enrolled in.",
        default: true
    },
    dashboardShowInProgress: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • In Progress",
        description: "Show enrolled quests that are still in progress.",
        default: true
    },
    dashboardShowClaimable: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Ready to Claim",
        description: "Show completed quests whose rewards are ready to claim.",
        default: true
    },
    dashboardShowClaimed: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Claimed",
        description: "Show quests whose rewards have already been claimed.",
        default: false
    },
    dashboardShowExpired: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Expired",
        description: "Show expired quests.",
        default: false
    },
    dashboardRewardFilter: {
        type: OptionType.SELECT,
        displayName: "Dashboard • Reward Filter",
        description: "Choose which reward categories are shown in the dashboard.",
        options: rewardOptions
    },
    dashboardIncludeUnknownRewards: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Include Unknown Rewards",
        description: "When a specific reward filter is active, keep quests whose reward format QuestUI does not recognize yet.",
        default: true
    },
    dashboardShowPlay: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Play Quests",
        description: "Show play-game quests.",
        default: true
    },
    dashboardShowStream: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Stream Quests",
        description: "Show stream quests.",
        default: true
    },
    dashboardShowVideo: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Video Quests",
        description: "Show video quests.",
        default: true
    },
    dashboardShowActivity: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Activity Quests",
        description: "Show Discord Activity and achievement-in-activity quests.",
        default: true
    },
    dashboardShowOther: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Other / Unknown Quests",
        description: "Show quest task types QuestUI does not recognize. Keep this enabled for forward compatibility.",
        default: true
    },

    detailedStatus: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status",
        description: "Replace the single attention dot with one compact numeric badge. Priority is In Progress, then Ready to Claim, then Available.",
        default: false
    },
    detailedStatusScope: {
        type: OptionType.SELECT,
        displayName: "Detailed Status • Count Scope",
        description: "Use the Dashboard filters for the numeric badge, or configure a separate set of filters.",
        options: [
            { label: "Same as Dashboard filters", value: "dashboard", default: true },
            { label: "Custom filters", value: "custom" }
        ] as const
    },
    detailedShowAvailable: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Available",
        description: "Count available quests in the custom status scope.",
        default: true
    },
    detailedShowInProgress: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • In Progress",
        description: "Count in-progress quests in the custom status scope.",
        default: true
    },
    detailedShowClaimable: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Ready to Claim",
        description: "Count completed quests that are ready to claim in the custom status scope.",
        default: true
    },
    detailedRewardFilter: {
        type: OptionType.SELECT,
        displayName: "Detailed Status • Reward Filter",
        description: "Choose which reward categories can affect the numeric status badge.",
        options: rewardOptions
    },
    detailedIncludeUnknownRewards: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Include Unknown Rewards",
        description: "When a specific reward filter is active, count quests whose reward format QuestUI does not recognize yet.",
        default: true
    },
    detailedShowPlay: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Play Quests",
        description: "Allow play-game quests to affect Detailed Status.",
        default: true
    },
    detailedShowStream: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Stream Quests",
        description: "Allow stream quests to affect Detailed Status.",
        default: true
    },
    detailedShowVideo: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Video Quests",
        description: "Allow video quests to affect Detailed Status.",
        default: true
    },
    detailedShowActivity: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Activity Quests",
        description: "Allow Discord Activity quests to affect Detailed Status.",
        default: true
    },
    detailedShowOther: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Other / Unknown Quests",
        description: "Allow unknown quest task types to affect Detailed Status. Keep this enabled for forward compatibility.",
        default: true
    }
}, {
    dashboardShowAvailable: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardShowInProgress: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardShowClaimable: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardShowClaimed: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardShowExpired: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardRewardFilter: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardIncludeUnknownRewards: { hidden() {
        const scopeHidden = !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard");
        return scopeHidden || this.store.dashboardRewardFilter === "all";
    } },
    dashboardShowPlay: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardShowStream: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardShowVideo: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardShowActivity: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },
    dashboardShowOther: { hidden() { return !this.store.dashboardMode && !(this.store.detailedStatus && this.store.detailedStatusScope === "dashboard"); } },

    detailedStatusScope: { hidden() { return !this.store.detailedStatus; } },
    detailedShowAvailable: { hidden() { return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowInProgress: { hidden() { return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowClaimable: { hidden() { return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedRewardFilter: { hidden() { return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedIncludeUnknownRewards: { hidden() {
        return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom" || this.store.detailedRewardFilter === "all";
    } },
    detailedShowPlay: { hidden() { return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowStream: { hidden() { return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowVideo: { hidden() { return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowActivity: { hidden() { return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowOther: { hidden() { return !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } }
});
