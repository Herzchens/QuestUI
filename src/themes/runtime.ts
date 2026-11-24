import "./default/tokens.css";

export const QUESTUI_THEME_ROOT_CLASS = "quest-ui-theme";
export const DEFAULT_DASHBOARD_THEME_CLASS = "quest-ui-theme-default";

export function dashboardThemeClassName(...classNames: Array<string | false | null | undefined>): string {
    return [QUESTUI_THEME_ROOT_CLASS, DEFAULT_DASHBOARD_THEME_CLASS, ...classNames]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .join(" ");
}
