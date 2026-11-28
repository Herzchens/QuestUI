import { disableStyle, enableStyle, managedStyleRootNode, requireStyle } from "@api/Styles";
import { React } from "@webpack/common";

import { createThemePluginLifecycle } from "./lifecycle";
import { createDashboardThemeController } from "./controller";
import { useEffectiveReducedMotion, useGraphicsQualityPolicy, useGraphicsRootClasses } from "../graphics/runtime";
import { createThemeRendering, type ThemeSurface } from "./rendering";
import { createThemeSDK } from "./sdk";
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

const custom = createThemeSDK({
    register: theme => controller.registerTheme(theme),
    catalogue: () => controller.getCatalogue(),
    active: () => controller.getSnapshot(),
    restore(id) {
        if (settings.store.dashboardTheme !== id || controller.getSnapshot() !== DEFAULT_DASHBOARD_THEME_ID) return;
        try { selectDashboardTheme(id); }
        catch (error) { console.warn("[QuestUI] Could not restore registered theme.", error); }
    }
}, prepareScopedThemeCSS);

export const themeSDK = custom.api;

/** Browser-parsed @scope prevents accidental global selector application.
 * CSS is trusted local code, not untrusted input; network URLs and CSS side
 * channels are not sandboxed. Reject top-level rule escapes and unsupported hosts. */
export function prepareScopedThemeCSS(id: string, css: string): string {
    if (!/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new TypeError("Invalid theme ID.");
    const selector = ".quest-ui-theme-" + id;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("@scope (" + selector + ") {\n" + css + "\n}");
    const rule = sheet.cssRules[0];
    if (sheet.cssRules.length !== 1 || !rule || !rule.cssText.startsWith("@scope (" + selector + ")")
        || !("cssRules" in rule) || !(rule as CSSGroupingRule).cssRules.length) {
        throw new Error("Invalid custom theme CSS or unsupported CSS scope.");
    }
    return rule.cssText;
}


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
