import tokens from "./default/tokens.css?managed";
import dashboardComponents from "./default/dashboard-components.css?managed";
import scrollbar from "./default/scrollbar.css?managed";
import questActions from "./default/quest-actions.css?managed";
import questReload from "./default/quest-reload.css?managed";
import notifications from "./default/notifications.css?managed";
import updateCenter from "./default/update-center.css?managed";
import eventLog from "./default/event-log.css?managed";
import orion from "./default/orion.css?managed";
import dashboard from "./default/dashboard.css?managed";

import glassTokens from "./liquid-glass/tokens.css?managed";
import glassDashboardComponents from "./liquid-glass/dashboard-components.css?managed";
import glassScrollbar from "./liquid-glass/scrollbar.css?managed";
import glassQuestActions from "./liquid-glass/quest-actions.css?managed";
import glassQuestReload from "./liquid-glass/quest-reload.css?managed";
import glassNotifications from "./liquid-glass/notifications.css?managed";
import glassUpdateCenter from "./liquid-glass/update-center.css?managed";
import glassEventLog from "./liquid-glass/event-log.css?managed";
import glassOrion from "./liquid-glass/orion.css?managed";
import glassDashboard from "./liquid-glass/dashboard.css?managed";

import obsidianTokens from "./obsidian/tokens.css?managed";
import obsidianDashboardComponents from "./obsidian/dashboard-components.css?managed";
import obsidianScrollbar from "./obsidian/scrollbar.css?managed";
import obsidianQuestActions from "./obsidian/quest-actions.css?managed";
import obsidianQuestReload from "./obsidian/quest-reload.css?managed";
import obsidianNotifications from "./obsidian/notifications.css?managed";
import obsidianUpdateCenter from "./obsidian/update-center.css?managed";
import obsidianEventLog from "./obsidian/event-log.css?managed";
import obsidianOrion from "./obsidian/orion.css?managed";
import obsidianDashboard from "./obsidian/dashboard.css?managed";
import obsidianFractures from "./obsidian/fractures.css?managed";
import obsidianFractureAssets from "./obsidian/fracture-assets.css?managed";

import sakuraTokens from "./sakura/tokens.css?managed";
import sakuraDashboardComponents from "./sakura/dashboard-components.css?managed";
import sakuraScrollbar from "./sakura/scrollbar.css?managed";
import sakuraQuestActions from "./sakura/quest-actions.css?managed";
import sakuraQuestReload from "./sakura/quest-reload.css?managed";
import sakuraNotifications from "./sakura/notifications.css?managed";
import sakuraUpdateCenter from "./sakura/update-center.css?managed";
import sakuraEventLog from "./sakura/event-log.css?managed";
import sakuraOrion from "./sakura/orion.css?managed";
import sakuraDashboard from "./sakura/dashboard.css?managed";
import sakuraSceneAssets from "./sakura/scene-assets.css?managed";
import sakuraOrnaments from "./sakura/ornaments.css?managed";
import sakuraArtDirection from "./sakura/art-direction.css?managed";

import terminalTokens from "./terminal/tokens.css?managed";
import terminalDashboardComponents from "./terminal/dashboard-components.css?managed";
import terminalScrollbar from "./terminal/scrollbar.css?managed";
import terminalQuestActions from "./terminal/quest-actions.css?managed";
import terminalQuestReload from "./terminal/quest-reload.css?managed";
import terminalNotifications from "./terminal/notifications.css?managed";
import terminalUpdateCenter from "./terminal/update-center.css?managed";
import terminalEventLog from "./terminal/event-log.css?managed";
import terminalOrion from "./terminal/orion.css?managed";
import terminalDashboard from "./terminal/dashboard.css?managed";

import origamiTokens from "./origami/tokens.css?managed";
import origamiDashboardComponents from "./origami/dashboard-components.css?managed";
import origamiScrollbar from "./origami/scrollbar.css?managed";
import origamiQuestActions from "./origami/quest-actions.css?managed";
import origamiQuestReload from "./origami/quest-reload.css?managed";
import origamiNotifications from "./origami/notifications.css?managed";
import origamiUpdateCenter from "./origami/update-center.css?managed";
import origamiEventLog from "./origami/event-log.css?managed";
import origamiOrion from "./origami/orion.css?managed";
import origamiDashboard from "./origami/dashboard.css?managed";
import origamiPaperAssets from "./origami/paper-assets.css?managed";
import origamiCrumpledPaper from "./origami/crumpled-paper.css?managed";
import origamiHeaderRaster from "./origami/header-raster.css?managed";
import origamiControlRaster from "./origami/control-raster.css?managed";
import origamiAnimalAssets from "./origami/animal-assets.css?managed";
import origamiCardStock from "./origami/card-stock.css?managed";
import origamiSceneAssets from "./origami/scene-assets.css?managed";
import origamiPolishStock from "./origami/polish-stock.css?managed";
import origamiPaperArt from "./origami/paper-art.css?managed";
import origamiCardArt from "./origami/card-art.css?managed";

import graphics from "./default/graphics.css?managed";
import glassGraphics from "./liquid-glass/graphics.css?managed";
import obsidianGraphics from "./obsidian/graphics.css?managed";
import sakuraGraphics from "./sakura/graphics.css?managed";
import terminalGraphics from "./terminal/graphics.css?managed";
import origamiGraphics from "./origami/graphics.css?managed";
import type { DashboardTheme } from "./controller";

export const DEFAULT_DASHBOARD_THEME_ID = "default";

// Each registry entry owns its entire ordered stylesheet set.
export const DASHBOARD_THEMES: readonly DashboardTheme[] = [
    {
        id: DEFAULT_DASHBOARD_THEME_ID,
        label: "Default",
        styles: [
            tokens,
            dashboardComponents,
            scrollbar,
            questActions,
            questReload,
            notifications,
            updateCenter,
            eventLog,
            orion,
            dashboard,
            graphics,
        ]
    },
    {
        id: "liquid-glass",
        label: "Liquid Glass",
        styles: [
            glassTokens,
            glassDashboardComponents,
            glassScrollbar,
            glassQuestActions,
            glassQuestReload,
            glassNotifications,
            glassUpdateCenter,
            glassEventLog,
            glassOrion,
            glassDashboard,
            glassGraphics,
        ]
    },
    {
        id: "obsidian",
        label: "Obsidian",
        styles: [
            obsidianTokens,
            obsidianDashboardComponents,
            obsidianScrollbar,
            obsidianQuestActions,
            obsidianQuestReload,
            obsidianNotifications,
            obsidianUpdateCenter,
            obsidianEventLog,
            obsidianOrion,
            obsidianDashboard,
            obsidianFractureAssets,
            obsidianFractures,
            obsidianGraphics,
        ]
    },
    {
        id: "sakura",
        label: "Sakura",
        styles: [
            sakuraTokens,
            sakuraDashboardComponents,
            sakuraScrollbar,
            sakuraQuestActions,
            sakuraQuestReload,
            sakuraNotifications,
            sakuraUpdateCenter,
            sakuraEventLog,
            sakuraOrion,
            sakuraDashboard,
            sakuraSceneAssets,
            sakuraOrnaments,
            sakuraArtDirection,
            sakuraGraphics,
        ]
    },
    {
        id: "terminal",
        label: "Terminal",
        styles: [
            terminalTokens,
            terminalDashboardComponents,
            terminalScrollbar,
            terminalQuestActions,
            terminalQuestReload,
            terminalNotifications,
            terminalUpdateCenter,
            terminalEventLog,
            terminalOrion,
            terminalDashboard,
            terminalGraphics,
        ]
    },
    {
        id: "origami",
        label: "Origami",
        styles: [
            origamiTokens,
            origamiDashboardComponents,
            origamiScrollbar,
            origamiQuestActions,
            origamiQuestReload,
            origamiNotifications,
            origamiUpdateCenter,
            origamiEventLog,
            origamiOrion,
            origamiDashboard,
            origamiPaperAssets,
            origamiCrumpledPaper,
            origamiHeaderRaster,
            origamiControlRaster,
            origamiAnimalAssets,
            origamiCardStock,
            origamiSceneAssets,
            origamiPolishStock,
            origamiPaperArt,
            origamiCardArt,
            origamiGraphics,
        ]
    }
];

export const DASHBOARD_THEME_OPTIONS = DASHBOARD_THEMES.map(theme => ({
    label: theme.label,
    value: theme.id,
    default: theme.id === DEFAULT_DASHBOARD_THEME_ID
}));
