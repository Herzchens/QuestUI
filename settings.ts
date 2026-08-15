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
        displayName: "Top Bar Button",
        description: "Show the Quests shortcut in Discord's top bar.",
        default: true,
        restartNeeded: true
    },
    showQuestsButtonSettingsBar: {
        type: OptionType.BOOLEAN,
        displayName: "Settings Bar Button",
        description: "Show the Quests shortcut beside mute, deafen and settings.",
        default: false,
        restartNeeded: true
    },
    showQuestsButtonBadges: {
        type: OptionType.BOOLEAN,
        displayName: "Quest Home Counters",
        description: "Show colored numeric counters on Discord's Quest Home links.",
        default: false,
        restartNeeded: true
    },

    dashboardMode: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard Mode",
        description: "Open the live mini dashboard when clicking a Quest button. Configure Dashboard filters from the filter button inside the dashboard.",
        default: false
    },

    // Dashboard filter values live in settings so they persist, but they are configured
    // from the Dashboard's dedicated filter panel instead of flooding this settings page.
    dashboardShowAvailable: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Available",
        description: "Show available quests.",
        default: true
    },
    dashboardShowInProgress: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • In Progress",
        description: "Show in-progress quests.",
        default: true
    },
    dashboardShowClaimable: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Ready to Claim",
        description: "Show quests ready to claim.",
        default: true
    },
    dashboardShowClaimed: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Claimed",
        description: "Show claimed quests.",
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
        description: "Dashboard reward filter.",
        options: rewardOptions
    },
    dashboardIncludeUnknownRewards: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Include Unknown Rewards",
        description: "Keep unknown reward formats while a reward filter is active.",
        default: true
    },
    dashboardShowPlay: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Play",
        description: "Show play-game quests.",
        default: true
    },
    dashboardShowStream: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Stream",
        description: "Show stream quests.",
        default: true
    },
    dashboardShowVideo: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Video",
        description: "Show video quests.",
        default: true
    },
    dashboardShowActivity: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Activity",
        description: "Show Activity and achievement quests.",
        default: true
    },
    dashboardShowOther: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Other / Unknown",
        description: "Show unknown Quest task types for forward compatibility.",
        default: true
    },

    detailedStatus: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status",
        description: "Replace the attention dot with a numeric badge. Priority: In Progress, Ready to Claim, Available.",
        default: false
    },
    detailedStatusScope: {
        type: OptionType.SELECT,
        displayName: "↳ Count Scope",
        description: "Use Dashboard filters or a separate Detailed Status filter set.",
        options: [
            { label: "Same as Dashboard filters", value: "dashboard", default: true },
            { label: "Custom filters", value: "custom" }
        ] as const
    },
    detailedShowAvailable: {
        type: OptionType.BOOLEAN,
        displayName: "↳ Available",
        description: "Count available quests.",
        default: true
    },
    detailedShowInProgress: {
        type: OptionType.BOOLEAN,
        displayName: "↳ In Progress",
        description: "Count in-progress quests.",
        default: true
    },
    detailedShowClaimable: {
        type: OptionType.BOOLEAN,
        displayName: "↳ Ready to Claim",
        description: "Count quests ready to claim.",
        default: true
    },
    detailedRewardFilter: {
        type: OptionType.SELECT,
        displayName: "↳ Reward Filter",
        description: "Choose which rewards can affect Detailed Status.",
        options: rewardOptions
    },
    detailedIncludeUnknownRewards: {
        type: OptionType.BOOLEAN,
        displayName: "↳ Include Unknown Rewards",
        description: "Count unknown reward formats while a reward filter is active.",
        default: true
    },
    detailedShowPlay: {
        type: OptionType.BOOLEAN,
        displayName: "↳ Play",
        description: "Allow play-game quests to affect Detailed Status.",
        default: true
    },
    detailedShowStream: {
        type: OptionType.BOOLEAN,
        displayName: "↳ Stream",
        description: "Allow stream quests to affect Detailed Status.",
        default: true
    },
    detailedShowVideo: {
        type: OptionType.BOOLEAN,
        displayName: "↳ Video",
        description: "Allow video quests to affect Detailed Status.",
        default: true
    },
    detailedShowActivity: {
        type: OptionType.BOOLEAN,
        displayName: "↳ Activity",
        description: "Allow Activity quests to affect Detailed Status.",
        default: true
    },
    detailedShowOther: {
        type: OptionType.BOOLEAN,
        displayName: "↳ Other / Unknown",
        description: "Allow unknown Quest task types to affect Detailed Status.",
        default: true
    }
}, {
    // Dashboard filters are edited in-context from the Dashboard filter button.
    dashboardShowAvailable: { hidden: true },
    dashboardShowInProgress: { hidden: true },
    dashboardShowClaimable: { hidden: true },
    dashboardShowClaimed: { hidden: true },
    dashboardShowExpired: { hidden: true },
    dashboardRewardFilter: { hidden: true },
    dashboardIncludeUnknownRewards: { hidden: true },
    dashboardShowPlay: { hidden: true },
    dashboardShowStream: { hidden: true },
    dashboardShowVideo: { hidden: true },
    dashboardShowActivity: { hidden: true },
    dashboardShowOther: { hidden: true },

    // Detailed Status stays compact until Custom filters are selected. The Dashboard
    // filter rows remain out of this modal and are edited in-context from the dashboard.
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
