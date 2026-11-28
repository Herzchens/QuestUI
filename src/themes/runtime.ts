import { disableStyle, enableStyle, managedStyleRootNode, requireStyle } from "@api/Styles";
import { React } from "@webpack/common";

import { createThemePluginLifecycle } from "./lifecycle";
import { createDashboardThemeController } from "./controller";
import { useEffectiveReducedMotion, useGraphicsQualityPolicy, useGraphicsRootClasses } from "../graphics/runtime";
import { createThemeRendering, type ThemeSurface } from "./rendering";
import { createThemeSDK } from "./sdk";
import { prepareScopedThemeCSS } from "./scope";
import type { ThemeStyleAdapter } from "./controller";
import settings from "../plugin/settings";
import { DASHBOARD_THEMES, DEFAULT_DASHBOARD_THEME_ID } from "./registry";

const styleAdapter: ThemeStyleAdapter = {
    validate: name => { if (custom.styles.owns(name)) custom.styles.validate(name); else requireStyle(name); },
    enable: name => { if (custom.styles.owns(name)) custom.styles.enable(name, managedStyleRootNode); else enableStyle(name); },
    disable: name => {
        if (custom.styles.owns(name)) return custom.styles.disable(name);
        if (disableStyle(name)) return;
        // Also clean up an owned node appended before Vencord's root is connected.
        const style = requireStyle(name);
        style.dom?.remove();
        style.dom = null;
    }
};
const controller = createDashboardThemeController(DASHBOARD_THEMES, DEFAULT_DASHBOARD_THEME_ID, styleAdapter);

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
    try { return lifecycle.select(preference); }
    finally { if (controller.getSnapshot() !== previous) rendering.clear(); }
}

export function useThemeRenderingSurface(surface: ThemeSurface) {
    const root = React.useRef<HTMLDivElement>(null);
    const id = useDashboardThemeId();
    const graphics = useGraphicsQualityPolicy();
    const reducedMotion = useEffectiveReducedMotion();
    const epoch = React.useSyncExternalStore(rendering.subscribe, rendering.getEpoch, rendering.getEpoch);
    React.useEffect(() => {
        const element = root.current;
        const render = DASHBOARD_THEMES.find(theme => theme.id === id)?.render;
        if (!element || !render || controller.getSnapshot() !== id) return;
        return rendering.attach(render, { root: element, surface, graphics, reducedMotion });
    }, [id, surface, graphics, reducedMotion, epoch]);
    return root;
}

const custom = createThemeSDK({
    register: theme => controller.registerTheme(theme),
    catalogue: () => controller.getCatalogue(),
    active: () => controller.getSnapshot(),
    restore(id) {
        if (!rendering.isRunning() || settings.store.dashboardTheme !== id
            || controller.getSnapshot() !== DEFAULT_DASHBOARD_THEME_ID) return;
        try { selectDashboardTheme(id); }
        catch (error) { console.warn("[QuestUI] Could not restore registered theme.", error); }
    }
}, (id, css) => prepareScopedThemeCSS(".quest-ui-theme-" + id, css));

export const themeSDK = custom.api;

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
