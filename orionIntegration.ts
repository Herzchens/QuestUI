import { ApplicationCommandOptionType, commands } from "@api/Commands";
import { isPluginEnabled, plugins } from "@api/PluginManager";

import { isCompatibleOrionCommand, isCompatibleOrionCompanion } from "./orionCommandLogic";
import type { OrionCommandAction, OrionCompanionSurface } from "./orionCommandLogic";

let controlPending = false;

type OrionPlugin = Partial<OrionCompanionSurface> & {
    started?: boolean;
    commands?: unknown[];
};

type CompatibleOrionPlugin = OrionPlugin & OrionCompanionSurface;

function plugin(): OrionPlugin | null {
    return (plugins as any)?.OrionQuests ?? null;
}

function hasCompatibleCompanion(current: OrionPlugin | null): current is CompatibleOrionPlugin {
    return isCompatibleOrionCompanion(current);
}

export class OrionIntegrationError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = "OrionIntegrationError";
    }
}

export function isOrionInstalled(): boolean {
    return Boolean(plugin());
}

export function isOrionEnabled(): boolean {
    return isOrionInstalled() && isPluginEnabled("OrionQuests");
}

function pluginOwnsCommand(current: OrionPlugin, candidate: unknown): boolean {
    return Array.isArray(current.commands) && current.commands.includes(candidate);
}

function getRegisteredOrionCommand(current = plugin()): any | null {
    if (!current) return null;
    const candidate = (commands as any)?.orion;
    if (!candidate || !pluginOwnsCommand(current, candidate)) return null;
    return isCompatibleOrionCommand(candidate, ApplicationCommandOptionType.STRING) ? candidate : null;
}

export function getOrionEngineRunning(): boolean | null {
    const current = plugin();
    if (!hasCompatibleCompanion(current)) return null;
    try {
        return current.getEngineRunning();
    } catch {
        return null;
    }
}

export function subscribeOrionEngineRunning(listener: () => void): (() => void) | null {
    const current = plugin();
    if (!hasCompatibleCompanion(current)) return null;
    try {
        return current.subscribeEngineRunning(listener);
    } catch {
        return null;
    }
}

export function isOrionCommandReady(): boolean {
    const current = plugin();
    return current !== null
        && isOrionEnabled()
        && current.started === true
        && getRegisteredOrionCommand(current) !== null
        && hasCompatibleCompanion(current)
        && getOrionEngineRunning() !== null;
}

/**
 * Invoke Orion's narrow companion control surface rather than its slash-command callback.
 * The companion method delegates to the same watcher-aware ensureStart/ensureStop paths, but
 * does not require a Discord channel just to produce a local Clyde command response.
 */
export async function invokeOrionControl(action: OrionCommandAction): Promise<void> {
    if (controlPending) throw new OrionIntegrationError("Another Orion control action is already in progress.");

    const current = plugin();
    const command = getRegisteredOrionCommand(current);
    if (!current || !command || !isOrionCommandReady() || !hasCompatibleCompanion(current)) {
        throw new OrionIntegrationError("OrionQuests is no longer enabled, started, or exposing its compatible control surface.");
    }

    const running = getOrionEngineRunning();
    if (running === null) throw new OrionIntegrationError("OrionQuests engine state is unavailable.");
    if ((action === "start") === running) return;

    const control = current.controlEngine;
    controlPending = true;
    try {
        // Re-check identity immediately before invocation so a Dashboard opened before an
        // Orion reload cannot call a stale plugin object or a replaced command registration.
        if (plugin() !== current
            || getRegisteredOrionCommand(current) !== command
            || current.started !== true
            || !isOrionEnabled()
            || current.controlEngine !== control) {
            throw new OrionIntegrationError("OrionQuests changed while the control was being prepared. Reopen the Dashboard and try again.");
        }

        await Promise.resolve(control.call(current, action));
    } catch (error) {
        if (error instanceof OrionIntegrationError) throw error;
        throw new OrionIntegrationError("OrionQuests rejected the requested control action.", error);
    } finally {
        controlPending = false;
    }
}
