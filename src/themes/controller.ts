export interface DashboardTheme {
    id: string;
    label: string;
    styles: readonly string[];
}

export interface ThemeStyleAdapter {
    validate: (style: string) => void;
    enable: (style: string) => void;
    disable: (style: string) => void;
}

export function createDashboardThemeController(
    themes: readonly DashboardTheme[],
    defaultId: string,
    adapter: ThemeStyleAdapter
) {
    const byId = new Map<string, DashboardTheme>();
    const ownedStyles = new Set<string>();
    for (const theme of themes) {
        if (!/^[a-z][a-z0-9-]*$/.test(theme.id) || byId.has(theme.id) || !theme.styles.length) {
            throw new Error("Invalid or duplicate Dashboard theme: " + theme.id);
        }
        byId.set(theme.id, theme);
        for (const style of theme.styles) {
            if (ownedStyles.has(style)) throw new Error("Dashboard stylesheet has multiple owners: " + style);
            ownedStyles.add(style);
        }
    }
    const fallback = byId.get(defaultId);
    if (!fallback) throw new Error("Default Dashboard theme is missing.");

    let active: DashboardTheme | null = null;
    const listeners = new Set<() => void>();
    const notify = () => { for (const listener of listeners) listener(); };
    const resolve = (id: unknown) => typeof id === "string" ? byId.get(id) ?? fallback : fallback;
    const getSnapshot = () => active?.id ?? fallback.id;
    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    };
    const disableAll = (theme: DashboardTheme) => {
        const failures: unknown[] = [];
        for (const style of [...theme.styles].reverse()) {
            try { adapter.disable(style); }
            catch (error) { failures.push(error); }
        }
        if (failures.length) throw new Error("Could not remove Dashboard styles.");
    };
    const enableAll = (theme: DashboardTheme) => {
        for (const style of theme.styles) adapter.enable(style);
    };

    function select(id: unknown): string {
        const target = resolve(id);
        if (active === target) return target.id;
        for (const style of target.styles) adapter.validate(style);
        const previous = active;
        if (previous) disableAll(previous);
        active = null;
        try {
            enableAll(target);
            active = target;
        } catch (error) {
            // Remove every partially enabled target stylesheet before rollback.
            disableAll(target);
            const restore = previous ?? (target !== fallback ? fallback : null);
            if (restore) {
                try {
                    for (const style of restore.styles) adapter.validate(style);
                    enableAll(restore);
                    active = restore;
                } catch {
                    disableAll(restore);
                }
            }
            notify();
            throw error;
        }
        notify();
        return target.id;
    }

    function stop(): void {
        if (!active) return;
        disableAll(active);
        active = null;
        notify();
    }

    return { select, stop, subscribe, getSnapshot };
}
