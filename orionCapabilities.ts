import { isPluginEnabled, plugins } from "@api/PluginManager";

import { isKnownOrionVersionIncompatible } from "./orionStatusLogic";

export type OrionEventListener = (event: unknown) => void;

export interface OrionEventCapabilitySource {
    identity: object;
    method: Function;
    subscribe(listener: OrionEventListener): (() => void) | null;
}

export interface OrionSchedulerCapabilitySource {
    identity: object;
    getMethod: Function;
    subscribeMethod: Function;
    getSnapshot(): unknown;
    subscribe(listener: () => void): (() => void) | null;
}

type OptionalOrionPlugin = {
    started?: boolean;
    version?: unknown;
    subscribeEvents?: unknown;
    getSchedulerSnapshot?: unknown;
    subscribeSchedulerState?: unknown;
};

function eligibleOptionalPlugin(): OptionalOrionPlugin | null {
    const current = (plugins as any)?.OrionQuests as OptionalOrionPlugin | null | undefined;
    if (!current || !isPluginEnabled("OrionQuests") || current.started !== true) return null;
    if (isKnownOrionVersionIncompatible(current.version)) return null;
    return current;
}

function safeUnsubscribe(value: unknown): (() => void) | null {
    return typeof value === "function" ? value as () => void : null;
}

/** Feature-detect Orion's additive structured-event capability without raising the core v4.10.7 floor. */
export function getOrionEventCapabilitySource(): OrionEventCapabilitySource | null {
    const current = eligibleOptionalPlugin();
    const method = current?.subscribeEvents;
    if (!current || typeof method !== "function") return null;
    return {
        identity: current as object,
        method,
        subscribe: listener => safeUnsubscribe(method.call(current, listener))
    };
}

/** Feature-detect Orion's additive scheduler metadata capability independently of control compatibility. */
export function getOrionSchedulerCapabilitySource(): OrionSchedulerCapabilitySource | null {
    const current = eligibleOptionalPlugin();
    const getMethod = current?.getSchedulerSnapshot;
    const subscribeMethod = current?.subscribeSchedulerState;
    if (!current || typeof getMethod !== "function" || typeof subscribeMethod !== "function") return null;
    return {
        identity: current as object,
        getMethod,
        subscribeMethod,
        getSnapshot: () => getMethod.call(current),
        subscribe: listener => safeUnsubscribe(subscribeMethod.call(current, listener))
    };
}
