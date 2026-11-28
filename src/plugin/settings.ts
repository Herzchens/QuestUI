import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { isOrionCommandReady, isOrionInstalled } from "../orion/integration";
import { notifyQuestAutoReloadSettingsChanged } from "../quests/reload/auto";
import {
    DASHBOARD_REWARD_PRESET_OPTIONS,
    DEFAULT_DASHBOARD_REWARD_CUSTOM_KINDS,
    REWARD_FILTER_OPTIONS
} from "../quests/rewardFilters";
import { DASHBOARD_SORT_OPTIONS } from "../dashboard/sort";
import { DASHBOARD_THEME_OPTIONS } from "../themes/registry";
import {
    DEFAULT_QUEST_AUTO_RELOAD_STEP,
    QUEST_AUTO_RELOAD_STEP_MARKERS,
    questAutoReloadMarkerLabel
} from "../quests/reload/autoLogic";
import { DEFAULT_UPDATE_CHECK_STEP, UPDATE_CHECK_STEP_MARKERS, updateCheckMarkerLabel } from "../updates/logic";
import { UpdateSettingsControl } from "../updates/UpdateCenter";
import { notifyUpdateSettingsChanged } from "../updates/runtime";

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
    autoReloadQuestList: {
        type: OptionType.BOOLEAN,
        displayName: "Quest List • Auto Reload",
        description: "Refresh Discord's Quest list in the background so new Quests can be discovered and notified without opening the Dashboard.",
        default: true,
        onChange: notifyQuestAutoReloadSettingsChanged
    },
    autoReloadQuestListStep: {
        type: OptionType.SLIDER,
        displayName: "Quest List • Auto Reload Frequency",
        description: "How often QuestUI asks Discord to refresh the Quest list in the background.",
        markers: [...QUEST_AUTO_RELOAD_STEP_MARKERS],
        default: DEFAULT_QUEST_AUTO_RELOAD_STEP,
        stickToMarkers: true,
        componentProps: {
            onValueRender: questAutoReloadMarkerLabel,
            onMarkerRender: questAutoReloadMarkerLabel
        },
        onChange: notifyQuestAutoReloadSettingsChanged
    },
    notifyQuestCompletion: {
        type: OptionType.BOOLEAN,
        displayName: "Notifications • Ready to Claim",
        description: "Notify once when an observed enrolled Quest becomes Ready to Claim. Initial startup state never generates a completion notification.",
        default: true
    },
    notifyNewQuestAvailable: {
        type: OptionType.BOOLEAN,
        displayName: "Notifications • New Quest Available",
        description: "Notify once when QuestUI observes a previously unseen Quest appear as Available. Startup/account hydration and Ignore/Unignore never generate this notification.",
        default: true
    },
    notifyRuntimeProblems: {
        type: OptionType.BOOLEAN,
        displayName: "Notifications • Problems",
        description: "Notify about actionable QuestUI/Orion errors and terminal warnings. Normal retries, fallbacks, and progress events are ignored.",
        default: true
    },

    updateCheckStep: {
        type: OptionType.SLIDER,
        displayName: "Updates • Check frequency",
        description: "How often QuestUI checks GitHub releases. 0 = manual only.",
        markers: [...UPDATE_CHECK_STEP_MARKERS],
        default: DEFAULT_UPDATE_CHECK_STEP,
        stickToMarkers: true,
        componentProps: {
            onValueRender: updateCheckMarkerLabel,
            onMarkerRender: updateCheckMarkerLabel
        },
        onChange: notifyUpdateSettingsChanged
    },
    updateIncludePrereleases: {
        type: OptionType.BOOLEAN,
        displayName: "Updates • QuestUI pre-releases",
        description: "Include newer QuestUI beta, release-candidate, and other pre-release versions.",
        default: false,
        onChange: notifyUpdateSettingsChanged
    },
    updateIncludeOrionPrereleases: {
        type: OptionType.BOOLEAN,
        displayName: "Updates • OrionQuests pre-releases",
        description: "Include newer OrionQuests beta, release-candidate, and other pre-release versions independently from QuestUI.",
        default: false,
        onChange: notifyUpdateSettingsChanged
    },
    updateCheckOrion: {
        type: OptionType.BOOLEAN,
        displayName: "Updates • Check OrionQuests",
        description: "Check the separate OrionQuests repository for newer releases. This preference stays saved when OrionQuests is not installed.",
        default: true,
        onChange: notifyUpdateSettingsChanged
    },
    updateStatus: {
        type: OptionType.COMPONENT,
        component: UpdateSettingsControl
    },

    // Dashboard filter values live in settings so they persist, but they are configured
    // from the Dashboard's dedicated filter popout instead of flooding this settings page.
    dashboardTheme: {
        type: OptionType.SELECT,
        displayName: "Dashboard • Theme",
        description: "Choose the Dashboard theme from its palette menu.",
        options: DASHBOARD_THEME_OPTIONS
    },
    dashboardGraphicsPreference: {
        type: OptionType.STRING,
        displayName: "Dashboard • Graphics Quality",
        description: "Internal graphics selector preference; rendering policy is not yet applied.",
        default: "3"
    },
    dashboardSortMode: {
        type: OptionType.SELECT,
        displayName: "Dashboard • Sort",
        description: "Choose how Quest cards are ordered.",
        options: DASHBOARD_SORT_OPTIONS
    },
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
        default: true
    },
    dashboardShowExpired: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Expired",
        description: "Show expired quests.",
        default: true
    },
    dashboardShowIgnored: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • Ignored",
        description: "Show Quests ignored locally by QuestUI.",
        default: false
    },
    dashboardExpiredAgeDays: {
        type: OptionType.NUMBER,
        displayName: "Dashboard • Expired Age",
        description: "Only show expired quests from the last N days. Zero means all history.",
        default: 0
    },
    dashboardFiltersV16Initialized: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • v1.6 filter defaults initialized",
        description: "Internal migration marker for the v1.6 Dashboard filter baseline.",
        default: false
    },
    dashboardRewardPreset: {
        type: OptionType.SELECT,
        displayName: "Dashboard • Reward Preset",
        description: "Internal Dashboard reward preset.",
        options: DASHBOARD_REWARD_PRESET_OPTIONS
    },
    dashboardRewardCustomKinds: {
        type: OptionType.STRING,
        displayName: "Dashboard • Custom Reward Types",
        description: "Internal persisted custom reward-type selection.",
        default: DEFAULT_DASHBOARD_REWARD_CUSTOM_KINDS
    },
    dashboardRewardFilterV2Initialized: {
        type: OptionType.BOOLEAN,
        displayName: "Dashboard • v1.6 reward filter initialized",
        description: "Internal migration marker for the v1.6 two-level reward filter.",
        default: false
    },
    dashboardRewardFilter: {
        type: OptionType.SELECT,
        displayName: "Dashboard • Legacy Reward Filter",
        description: "Legacy Dashboard reward filter retained for migration.",
        options: REWARD_FILTER_OPTIONS
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
        options: REWARD_FILTER_OPTIONS
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
    autoReloadQuestListStep: { hidden() { return this.store.autoReloadQuestList === false; } },
    updateCheckOrion: { disabled: () => !isOrionInstalled() },

    dashboardTheme: { hidden: true },
    dashboardGraphicsPreference: { hidden: true },
    dashboardSortMode: { hidden: true },
    dashboardShowAvailable: { hidden: true },
    dashboardShowInProgress: { hidden: true },
    dashboardShowClaimable: { hidden: true },
    dashboardShowClaimed: { hidden: true },
    dashboardShowExpired: { hidden: true },
    dashboardShowIgnored: { hidden: true },
    dashboardExpiredAgeDays: { hidden: true },
    dashboardFiltersV16Initialized: { hidden: true },
    dashboardRewardPreset: { hidden: true },
    dashboardRewardCustomKinds: { hidden: true },
    dashboardRewardFilterV2Initialized: { hidden: true },
    dashboardRewardFilter: { hidden: true },
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