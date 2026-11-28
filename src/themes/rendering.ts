import type { GraphicsQualityPolicy } from "../graphics/policy";

export type ThemeSurface = "dashboard" | "quest-home";
export interface ThemeRenderContext {
    readonly root: HTMLElement;
    readonly surface: ThemeSurface;
    readonly graphics: GraphicsQualityPolicy;
    readonly reducedMotion: boolean;
    readonly signal: AbortSignal;
    /** Register each disposer before acquiring a resource that may throw. */
    defer(dispose: () => void): void;
}
export type ThemeRenderer = (context: ThemeRenderContext) => void;

/** One synchronous, abortable ownership scope per mounted surface. */
export function createThemeRendering(onError: (error: unknown) => void) {
    const sessions = new Map<HTMLElement, () => void>();
    const pending = new Set<() => void>();
    let enabled = false;
    let generation = 0;

    function report(error: unknown) {
        try { onError(error); } catch { /* Diagnostics cannot break cleanup. */ }
    }

    function flush() {
        for (const dispose of [...pending]) {
            try { dispose(); pending.delete(dispose); }
            catch (error) { report(error); }
        }
    }

    function clear() {
        generation++;
        // Retry prior failures once per boundary, not in an unbounded loop.
        flush();
        for (const close of [...sessions.values()]) close();
    }

    function attach(renderer: ThemeRenderer, context: Omit<ThemeRenderContext, "signal" | "defer">): () => void {
        if (!enabled) return () => {};
        const epoch = generation;
        sessions.get(context.root)?.();
        if (!enabled || epoch !== generation || pending.size) return () => {};
        const abort = new AbortController();
        const disposers: Array<() => void> = [];
        let closed = false;
        function disposeOne(dispose: () => void) {
            try { dispose(); } catch (error) { pending.add(dispose); report(error); }
        }
        function close() {
            if (closed) return;
            closed = true;
            if (sessions.get(context.root) === close) sessions.delete(context.root);
            abort.abort();
            for (const dispose of disposers.splice(0).reverse()) disposeOne(dispose);
        }
        sessions.set(context.root, close);
        try {
            renderer(Object.freeze({
                ...context, signal: abort.signal,
                defer(dispose: () => void) {
                    if (typeof dispose !== "function") throw new TypeError("Invalid theme disposer.");
                    if (closed) disposeOne(dispose);
                    else disposers.push(dispose);
                }
            }));
        } catch (error) {
            close();
            report(error);
        }
        return close;
    }

    return {
        start() { enabled = true; },
        stop() { enabled = false; clear(); },
        clear,
        attach
    };
}
