import { disableStyle, enableStyle, requireStyle } from "@api/Styles";
import { React } from "@webpack/common";

import { createThemePluginLifecycle } from "./lifecycle";
import { createDashboardThemeController } from "./controller";
import { useEffectiveReducedMotion, useGraphicsQualityPolicy, useGraphicsRootClasses } from "../graphics/runtime";
import { createThemeRendering, type ThemeSurface } from "./rendering";
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

const rendering = createThemeRendering(error => console.warn("[QuestUI] Theme renderer failed.", error));

export function startDashboardThemes(preference: unknown): void {
    lifecycle.start(preference);
    rendering.start();
}

export function stopDashboardThemes(): void {
    rendering.stop();
    lifecycle.stop();
}

export function selectDashboardTheme(preference: unknown): string {
    const previous = controller.getSnapshot();
    const selected = lifecycle.select(preference);
    if (selected !== previous) rendering.clear();
    return selected;
}

export function useThemeRenderingSurface(surface: ThemeSurface) {
    const root = React.useRef<HTMLDivElement>(null);
    const id = useDashboardThemeId();
    const graphics = useGraphicsQualityPolicy();
    const reducedMotion = useEffectiveReducedMotion();
    React.useEffect(() => {
        const element = root.current;
        const render = DASHBOARD_THEMES.find(theme => theme.id === id)?.render;
        if (!element || !render || controller.getSnapshot() !== id) return;
        return rendering.attach(render, { root: element, surface, graphics, reducedMotion });
    }, [id, surface, graphics, reducedMotion]);
    return root;
}

export const registerDashboardTheme = controller.registerTheme;

export function useDashboardThemeOptions() {
    return React.useSyncExternalStore(controller.subscribe, controller.getCatalogue, controller.getCatalogue);
}

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
