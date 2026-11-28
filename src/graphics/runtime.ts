import { React } from "@webpack/common";

import settings from "../plugin/settings";
import { effectiveReducedMotion, graphicsQualityPolicy, graphicsRootClasses } from "./policy";

const QUERY = "(prefers-reduced-motion: reduce)";
let media: MediaQueryList | undefined;
const listeners = new Set<() => void>();
function query(): MediaQueryList | undefined {
    if (!media && typeof window !== "undefined" && typeof window.matchMedia === "function") media = window.matchMedia(QUERY);
    return media;
}
function snapshot(): boolean { return query()?.matches ?? false; }
function notify() { for (const listener of [...listeners]) listener(); }
function subscribe(listener: () => void): () => void {
    const m = query();
    if (!m) return () => {};
    if (!listeners.size) m.addEventListener("change", notify);
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (!listeners.size) m.removeEventListener("change", notify);
    };
}

export function useSystemReducedMotion(): boolean {
    return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useGraphicsQualityPolicy() {
    const { dashboardGraphicsPreference } = settings.use(["dashboardGraphicsPreference"]);
    return graphicsQualityPolicy(dashboardGraphicsPreference);
}

export function useEffectiveReducedMotion(): boolean {
    const { dashboardGraphicsPreference } = settings.use(["dashboardGraphicsPreference"]);
    const system = useSystemReducedMotion();
    return effectiveReducedMotion(dashboardGraphicsPreference, system);
}

export function useGraphicsRootClasses(): string[] {
    const { dashboardGraphicsPreference } = settings.use(["dashboardGraphicsPreference"]);
    const system = useSystemReducedMotion();
    return graphicsRootClasses(dashboardGraphicsPreference, system);
}
