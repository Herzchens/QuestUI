export interface DashboardTheme {
    id: string;
    label: string;
    styles: readonly string[];
    /** Trusted built-in services, owned for the plugin session, not each selection. */
    services?: readonly { start(): void; stop(): void; }[];
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
    const possiblyEnabled = new Set<string>();
    const listeners = new Set<() => void>();
    const notify = () => {
        for (const listener of [...listeners]) {
            try { listener(); } catch { /* A view cannot abort theme ownership changes. */ }
        }
    };
    const resolve = (id: unknown) => typeof id === "string" ? byId.get(id) ?? fallback : fallback;
    const getSnapshot = () => active?.id ?? fallback.id;
    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    };
    const disableOwned = () => {
        const failures: unknown[] = [];
        for (const style of [...possiblyEnabled].reverse()) {
            try {
                adapter.disable(style);
                possiblyEnabled.delete(style);
            } catch (error) {
                failures.push(error);
            }
        }
        if (failures.length) throw new AggregateError(failures, "Could not remove Dashboard styles.");
    };
    const enableAll = (theme: DashboardTheme) => {
        for (const style of theme.styles) {
            // A host may throw after attaching a style. Keep it in the cleanup set.
            possiblyEnabled.add(style);
            adapter.enable(style);
        }
    };

    function select(id: unknown): string {
        const target = resolve(id);
        if (active === target) return target.id;
        for (const style of target.styles) adapter.validate(style);
        const previous = active;
        active = null;
        try {
            disableOwned();
            enableAll(target);
            active = target;
        } catch (error) {
            const failures: unknown[] = [error];
            try {
                disableOwned();
                const restore = previous ?? (target !== fallback ? fallback : null);
                if (restore) {
                    for (const style of restore.styles) adapter.validate(style);
                    enableAll(restore);
                    active = restore;
                }
            } catch (cleanupError) {
                failures.push(cleanupError);
                // Retain any still-owned styles for a later explicit retry.
                try { disableOwned(); } catch (retryError) { failures.push(retryError); }
            }
            notify();
            if (failures.length > 1) throw new AggregateError(failures, "Dashboard theme transition and recovery failed.");
            throw error;
        }
        notify();
        return target.id;
    }

    function stop(): void {
        if (!active && possiblyEnabled.size === 0) return;
        active = null;
        try { disableOwned(); }
        finally { notify(); }
    }

    return { select, stop, subscribe, getSnapshot };
}
