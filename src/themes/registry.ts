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
        ]
    }
];

export const DASHBOARD_THEME_OPTIONS = DASHBOARD_THEMES.map(theme => ({
    label: theme.label,
    value: theme.id,
    default: theme.id === DEFAULT_DASHBOARD_THEME_ID
}));
