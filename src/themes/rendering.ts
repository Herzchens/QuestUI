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
    let clearing = false;
    let disposing = 0;
    let mounting = false;
    const listeners = new Set<() => void>();

    function publish() {
        for (const listener of [...listeners]) {
            try { listener(); } catch (error) { report(error); }
        }
    }

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
        if (clearing) return;
        clearing = true;
        generation++;
        try {
            // Retry prior failures once per boundary, not in an unbounded loop.
            flush();
            for (const close of [...sessions.values()]) close();
        } finally {
            clearing = false;
            publish();
        }
    }

    function attach(renderer: ThemeRenderer, context: Omit<ThemeRenderContext, "signal" | "defer">): () => void {
        if (!enabled || clearing || disposing || mounting) return () => {};
        const epoch = generation;
        sessions.get(context.root)?.();
        if (!enabled || clearing || epoch !== generation || pending.size) return () => {};
        const abort = new AbortController();
        const disposers: Array<() => void> = [];
        let closed = false;
        function disposeOne(dispose: () => void) {
            disposing++;
            try { dispose(); } catch (error) { pending.add(dispose); report(error); }
            finally { disposing--; }
        }
        function close() {
            if (closed) return;
            closed = true;
            if (sessions.get(context.root) === close) sessions.delete(context.root);
            disposing++;
            try {
                abort.abort();
                for (const dispose of disposers.splice(0).reverse()) disposeOne(dispose);
            } finally { disposing--; }
        }
        sessions.set(context.root, close);
        mounting = true;
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
        } finally { mounting = false; }
        return close;
    }

    return {
        start() {
            if (enabled || clearing || disposing || mounting) return;
            enabled = true;
            clear();
        },
        stop() { enabled = false; clear(); },
        isRunning: () => enabled,
        getEpoch: () => generation,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        clear,
        attach
    };
}
