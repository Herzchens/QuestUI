import type { CustomDashboardTheme, DashboardThemeOption } from "./controller";

export const THEME_SDK_VERSION = 1;
export interface ThemePackageV1 {
    readonly apiVersion: 1;
    readonly id: string;
    readonly label: string;
    readonly css: string;
}
type SDKHost = {
    register(theme: CustomDashboardTheme): () => void;
    catalogue(): readonly DashboardThemeOption[];
    active(): string;
    restore(id: string): void;
};
type StyleEntry = { css: string; node?: HTMLStyleElement; };

/** Only trusted, locally installed plugins may supply CSS. This is not a sandbox. */
export function createThemeSDK(host: SDKHost, prepareCss: (id: string, css: string) => string) {
    const entries = new Map<string, StyleEntry>();
    const prefix = "questui-custom-css:";
    const key = (id: string) => prefix + id;
    const get = (style: string) => entries.get(style);

    function register(input: ThemePackageV1): () => void {
        if (!input || typeof input !== "object") throw new TypeError("Invalid theme package.");
        const { apiVersion, id, label, css } = input;
        if (apiVersion !== THEME_SDK_VERSION || typeof id !== "string"
            || !/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 64
            || typeof label !== "string" || !label.trim() || label.length > 80
            || typeof css !== "string" || !css.trim() || css.length > 262144) {
            throw new TypeError("Invalid or unsupported theme package.");
        }
        const style = key(id);
        if (entries.has(style)) throw new Error("Custom theme already registered.");
        if (entries.size >= 64) throw new Error("Too many custom themes.");
        const scoped = prepareCss(id, css);
        if (typeof scoped !== "string" || !scoped.trim() || scoped.length > 1048576) {
            throw new Error("Invalid or oversized prepared theme CSS.");
        }
        // Preparation may call into a host; re-check ownership before insertion.
        if (entries.has(style) || entries.size >= 64) throw new Error("Custom theme registration conflict.");
        const entry: StyleEntry = { css: scoped };
        entries.set(style, entry);
        let unregister: () => void;
        try { unregister = host.register({ id, label, styles: [style] }); }
        catch (error) { entries.delete(style); throw error; }
        // Late registration may restore an explicitly saved user preference.
        // A cosmetic restore failure cannot strand the registration without a disposer.
        try { host.restore(id); } catch { /* The host logs restore failures. */ }
        return () => {
            if (entries.get(style) !== entry) return;
            unregister();
            entries.delete(style);
        };
    }
    return {
        api: Object.freeze({
            apiVersion: THEME_SDK_VERSION,
            register,
            getThemes: host.catalogue,
            getActiveTheme: host.active
        }),
        styles: {
            owns: (style: string) => style.startsWith(prefix),
            validate(style: string) {
                if (!get(style)) throw new Error("Unknown QuestUI custom stylesheet.");
            },
            enable(style: string, root: HTMLElement) {
                const entry = get(style);
                if (!entry) throw new Error("Unknown QuestUI custom stylesheet.");
                if (entry.node?.parentNode === root) return;
                const node = entry.node ?? document.createElement("style");
                entry.node = node;
                node.textContent = entry.css;
                root.appendChild(node);
            },
            disable(style: string) {
                const entry = get(style);
                if (!entry) throw new Error("Unknown QuestUI custom stylesheet.");
                entry.node?.remove();
                entry.node = undefined;
            }
        }
    };
}
