import definePlugin from "@utils/types";

import { QuestButton, QuestsCount } from "./QuestButton";
import settings from "./settings";

export default definePlugin({
    name: "QuestUI",
    description: "Adds standalone Discord Quest shortcuts, status indicators, and color-coded counters.",
    authors: [
        {
            name: "Herzchens",
            id: 984085171408080897n
        }
    ],
    settings,

    patches: [
        {
            find: ".PlatformTypes.WEB",
            predicate: () => settings.store.showQuestsButtonTopBar,
            replacement: {
                match: /(\((\i)\){)(let{leading)/,
                replace: "$1$2?.trailing?.props?.children?.unshift($self.renderQuestButtonTopBar());$3"
            }
        },
        {
            find: "accountContainerRef:",
            predicate: () => settings.store.showQuestsButtonSettingsBar,
            replacement: {
                match: /className:\i\.Uo,style:\i,children:\[/,
                replace: "$&$self.renderQuestButtonSettingsBar(),"
            }
        },
        {
            find: "\"innerRef\",\"navigate\",\"onClick\"",
            predicate: () => settings.store.showQuestsButtonBadges,
            replacement: {
                match: /(\i).createElement\("a",(\i)\)/,
                replace: "$1.createElement(\"a\",$self.renderQuestButtonBadges($2))"
            }
        }
    ],

    renderQuestButtonTopBar() {
        return <QuestButton type="top-bar" />;
    },

    renderQuestButtonSettingsBar() {
        return <QuestButton type="settings-bar" />;
    },

    renderQuestButtonBadges(anchorProps: any) {
        if (!settings.store.showQuestsButtonBadges) return anchorProps;
        if (!anchorProps || typeof anchorProps !== "object") return anchorProps;
        if (!anchorProps.href?.startsWith?.("/quest-home")) return anchorProps;
        if (!Array.isArray(anchorProps.children)) return anchorProps;
        if (anchorProps.children.some((child: any) => child?.type === QuestsCount)) return anchorProps;

        return {
            ...anchorProps,
            children: [
                ...anchorProps.children,
                <QuestsCount key="quest-ui-counts" />
            ]
        };
    }
});
