import { disableStyle, enableStyle, requireStyle } from "@api/Styles";
import { React } from "@webpack/common";

import { createDashboardThemeController } from "./controller";
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

let started = false;

export function startDashboardThemes(preference: unknown): void {
    if (started) return;
    try {
        controller.select(preference);
    } catch (error) {
        controller.select(DEFAULT_DASHBOARD_THEME_ID);
        console.warn("[QuestUI] Could not load preferred Dashboard theme; using Default.", error);
    }
    started = true;
}

export function stopDashboardThemes(): void {
    started = false;
    // A partially started or failed stop may still own managed styles.
    controller.stop();
}

export function selectDashboardTheme(preference: unknown): string {
    if (!started) throw new Error("Dashboard themes are not started.");
    return controller.select(preference);
}

export function useDashboardThemeId(): string {
    return React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}

export const QUESTUI_THEME_ROOT_CLASS = "quest-ui-theme";

export function useDashboardThemeClassName(...classNames: Array<string | false | null | undefined>): string {
    const id = useDashboardThemeId();
    return [QUESTUI_THEME_ROOT_CLASS, QUESTUI_THEME_ROOT_CLASS + "-" + id, ...classNames]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" ");
}
