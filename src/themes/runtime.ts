import { disableStyle, enableStyle, requireStyle } from "@api/Styles";
import { React } from "@webpack/common";

import { createThemePluginLifecycle } from "./lifecycle";
import { createDashboardThemeController } from "./controller";
import { useGraphicsRootClasses } from "../graphics/runtime";
import { DASHBOARD_THEMES, DEFAULT_DASHBOARD_THEME_ID } from "./registry";

const controller = createDashboardThemeController(DASHBOARD_THEMES, DEFAULT_DASHBOARD_THEME_ID, {
    validate: name => { requireStyle(name); },
    enable: name => { enableStyle(name); },
    disable: name => {
        if (disableStyle(name)) return;
        // Also clean up an owned node appended before Vencord's root is connected.
        const style = requireStyle(name);
        style.dom?.remove();
        style.dom = null;
    }
});

const lifecycle = createThemePluginLifecycle(controller, DASHBOARD_THEMES, DEFAULT_DASHBOARD_THEME_ID, error => {
    console.warn("[QuestUI] Could not load preferred Dashboard theme; using Default.", error);
});

export const startDashboardThemes = lifecycle.start;
export const stopDashboardThemes = lifecycle.stop;
export const selectDashboardTheme = lifecycle.select;

export function useDashboardThemeId(): string {
    return React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export const QUESTUI_THEME_ROOT_CLASS = "quest-ui-theme";

export function useDashboardThemeClassName(...classNames: Array<string | false | null | undefined>): string {
    const id = useDashboardThemeId();
    const graphicsClasses = useGraphicsRootClasses();
    return [QUESTUI_THEME_ROOT_CLASS, QUESTUI_THEME_ROOT_CLASS + "-" + id, ...graphicsClasses, ...classNames]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" ");
}
