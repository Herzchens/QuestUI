import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export default definePluginSettings({
    showQuestsButtonTopBar: {
        type: OptionType.BOOLEAN,
        description: "Show the Quests button in Discord's top bar. Its status dot is red for available quests, yellow for quests in progress, and green for completed rewards waiting to be claimed.",
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
        description: "Show colored quest counters: red = enrollable, yellow = enrolled, green = claimable, blurple = claimed. Enable this after confirming the top-bar button works on your Discord build.",
        default: false,
        restartNeeded: true
    }
});
