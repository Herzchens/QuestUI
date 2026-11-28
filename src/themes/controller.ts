import type { ThemeRenderer } from "./rendering";

export interface DashboardTheme {
    id: string;
    label: string;
    styles: readonly string[];
    /** Trusted built-in services, owned for the plugin session, not each selection. */
    services?: readonly { start(): void; stop(): void; }[];
    render?: ThemeRenderer;
}

export type DashboardThemeOption = Readonly<{ value: string; label: string; }>;
export type CustomDashboardTheme = Pick<DashboardTheme, "id" | "label" | "styles">;

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
    function addTheme(input: CustomDashboardTheme, custom = false): DashboardTheme {
        const { id, label } = input;
        const styles = [...input.styles];
        if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id) || id.length > 64
            || byId.has(id) || (custom && !id.startsWith("custom-"))
            || typeof label !== "string" || !label.trim() || label.length > 80
            || !styles.length || styles.length > 64) {
            throw new Error("Invalid or duplicate Dashboard theme: " + id);
        }
        const seen = new Set<string>();
        for (const style of styles) {
            if (typeof style !== "string" || !style.trim()) throw new Error("Invalid Dashboard stylesheet.");
            if (ownedStyles.has(style) || seen.has(style)) throw new Error("Dashboard stylesheet has multiple owners: " + style);
            seen.add(style);
            if (custom) adapter.validate(style);
        }
        const theme = Object.freeze({ id, label: label.trim(), styles: Object.freeze(styles) });
        byId.set(id, theme);
        for (const style of styles) ownedStyles.add(style);
        return theme;
    }
    for (const theme of themes) addTheme(theme);
    const builtInCount = byId.size;
    const fallback = byId.get(defaultId);
    if (!fallback) throw new Error("Default Dashboard theme is missing.");

    let active: DashboardTheme | null = null;
    const buildCatalogue = (): readonly DashboardThemeOption[] => Object.freeze(
        [...byId.values()].map(theme => Object.freeze({ value: theme.id, label: theme.label }))
    );
    let catalogue = buildCatalogue();
    let mutating = false;
    function mutate<T>(operation: () => T): T {
        if (mutating) throw new Error("Dashboard theme mutation already in progress.");
        mutating = true;
        try { return operation(); }
        finally { mutating = false; }
    }
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

    function selectInternal(id: unknown): string {
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

    function stopInternal(): void {
        if (!active && possiblyEnabled.size === 0) return;
        active = null;
        try { disableOwned(); }
        finally { notify(); }
    }

    function registerTheme(input: CustomDashboardTheme): () => void {
        return mutate(() => {
            if (byId.size - builtInCount >= 64) throw new Error("Too many custom Dashboard themes.");
            const theme = addTheme(input, true);
            catalogue = buildCatalogue();
            notify();
            return () => mutate(() => {
                // An old disposer must never remove a later registration with the same ID.
                if (byId.get(theme.id) !== theme) return;
                if (active === theme) selectInternal(defaultId);
                // Failed cleanup keeps ownership reserved; allow the caller to retry.
                if (theme.styles.some(style => possiblyEnabled.has(style))) {
                    throw new Error("Custom Dashboard theme still owns enabled styles.");
                }
                byId.delete(theme.id);
                for (const style of theme.styles) ownedStyles.delete(style);
                catalogue = buildCatalogue();
                notify();
            });
        });
    }

    return {
        select: (id: unknown) => mutate(() => selectInternal(id)),
        stop: () => mutate(stopInternal),
        subscribe,
        getSnapshot,
        getCatalogue: () => catalogue,
        registerTheme
    };
}
