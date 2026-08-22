import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { isOrionCommandReady, isOrionInstalled } from "./orionIntegration";

const rewardOptions = [
    { label: "All rewards", value: "all", default: true },
    { label: "Orbs only", value: "orbs" },
    { label: "Non-Orb rewards", value: "non-orbs" }
] as const;

function noShortcutButtons(this: any): boolean {
    return !this.store.showQuestsButtonTopBar && !this.store.showQuestsButtonSettingsBar;
}

function orionIntegrationDisabled(this: any): boolean {
    return !this.store.dashboardMode || !isOrionCommandReady();
}

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
        description: "Show colored numeric counters on Discord's official Quest Home links. This works independently of QuestUI's shortcut buttons.",
        default: false,
        restartNeeded: true
    },

    dashboardMode: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Mode",
        description: "Open the live mini dashboard when clicking a QuestUI shortcut. Requires the Top Bar Button or Settings Bar Button.",
        default: true
    },
    orionIntegration: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Orion Integration",
        description: "Show smart Start/Pause/Resume and Stop controls plus per-Quest controls from OrionQuests' live engine/task state. Requires Dashboard Mode and a compatible enabled OrionQuests plugin.",
        default: true
    },

    // Dashboard filter values live in settings so they persist, but they are configured
    // from the Dashboard's dedicated filter popout instead of flooding this settings page.
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
        displayName: "Detailed Status • Enabled",
        description: "Replace the QuestUI shortcut attention dot with a numeric badge. Requires the Top Bar Button or Settings Bar Button.",
        default: false
    },
    detailedStatusScope: {
        type: OptionType.SELECT,
        displayName: "Detailed Status • Count Scope",
        description: "Use Dashboard filters or a separate Detailed Status filter set.",
        options: [
            { label: "Same as Dashboard filters", value: "dashboard", default: true },
            { label: "Custom filters", value: "custom" }
        ] as const
    },
    detailedShowAvailable: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Filter • Available",
        description: "Count available quests.",
        default: true
    },
    detailedShowInProgress: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Filter • In Progress",
        description: "Count in-progress quests.",
        default: true
    },
    detailedShowClaimable: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Filter • Ready to Claim",
        description: "Count quests ready to claim.",
        default: true
    },
    detailedRewardFilter: {
        type: OptionType.SELECT,
        displayName: "Detailed Status • Filter • Reward",
        description: "Choose which rewards can affect Detailed Status.",
        options: rewardOptions
    },
    detailedIncludeUnknownRewards: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Filter • Include Unknown Rewards",
        description: "Count unknown reward formats while a reward filter is active.",
        default: true
    },
    detailedShowPlay: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Filter • Play",
        description: "Allow play-game quests to affect Detailed Status.",
        default: true
    },
    detailedShowStream: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Filter • Stream",
        description: "Allow stream quests to affect Detailed Status.",
        default: true
    },
    detailedShowVideo: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Filter • Video",
        description: "Allow video quests to affect Detailed Status.",
        default: true
    },
    detailedShowActivity: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Filter • Activity",
        description: "Allow Activity quests to affect Detailed Status.",
        default: true
    },
    detailedShowOther: {
        type: OptionType.BOOLEAN,
        displayName: "Detailed Status • Filter • Other / Unknown",
        description: "Allow unknown Quest task types to affect Detailed Status.",
        default: true
    }
}, {
    dashboardMode: { disabled: noShortcutButtons },
    orionIntegration: {
        hidden: () => !isOrionInstalled(),
        disabled: orionIntegrationDisabled
    },

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

    detailedStatus: { disabled: noShortcutButtons },
    detailedStatusScope: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus; } },
    detailedShowAvailable: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowInProgress: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowClaimable: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedRewardFilter: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedIncludeUnknownRewards: { hidden() {
        return noShortcutButtons.call(this)
            || !this.store.detailedStatus
            || this.store.detailedStatusScope !== "custom"
            || this.store.detailedRewardFilter === "all";
    } },
    detailedShowPlay: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowStream: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowVideo: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowActivity: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } },
    detailedShowOther: { hidden() { return noShortcutButtons.call(this) || !this.store.detailedStatus || this.store.detailedStatusScope !== "custom"; } }
});