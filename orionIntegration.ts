import { ApplicationCommandOptionType, commands } from "@api/Commands";
import { isPluginEnabled, plugins } from "@api/PluginManager";

import {
    isCompatibleOrionCommand,
    isCompatibleOrionCompanion,
    readCompatibleOrionSnapshot
} from "./orionCommandLogic";
import type {
    OrionCompanionSurface,
    OrionControlSnapshot,
    OrionEngineAction,
    OrionTaskAction
} from "./orionCommandLogic";

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

export function getOrionControlSnapshot(): OrionControlSnapshot | null {
    const current = plugin();
    if (!hasCompatibleCompanion(current)) return null;
    return readCompatibleOrionSnapshot(current);
}

export function subscribeOrionControlState(listener: () => void): (() => void) | null {
    const current = plugin();
    if (!hasCompatibleCompanion(current)) return null;
    try {
        const unsubscribe = current.subscribeControlState(listener);
        return typeof unsubscribe === "function" ? unsubscribe : null;
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
        && readCompatibleOrionSnapshot(current) !== null;
}

function requireCompatibleControl(): {
    current: CompatibleOrionPlugin;
    command: any;
} {
    const current = plugin();
    const command = getRegisteredOrionCommand(current);
    if (!current || !command || !isOrionCommandReady() || !hasCompatibleCompanion(current)) {
        throw new OrionIntegrationError("OrionQuests is no longer enabled, started, or exposing its compatible control surface.");
    }
    return { current, command };
}

function assertControlStillCurrent(current: CompatibleOrionPlugin, command: any): void {
    if (plugin() !== current
        || getRegisteredOrionCommand(current) !== command
        || current.started !== true
        || !isOrionEnabled()
        || !hasCompatibleCompanion(current)) {
        throw new OrionIntegrationError("OrionQuests changed while the control was being prepared. Reopen the Dashboard and try again.");
    }
}

async function withControlLock<T>(work: () => Promise<T>): Promise<T> {
    if (controlPending) throw new OrionIntegrationError("Another Orion control action is already in progress.");
    controlPending = true;
    try {
        return await work();
    } finally {
        controlPending = false;
    }
}

function wrapControlFailure(error: unknown): never {
    if (error instanceof OrionIntegrationError) throw error;
    throw new OrionIntegrationError("OrionQuests rejected the requested control action.", error);
}

/** Invoke Orion's watcher-aware engine lifecycle without fabricating a slash-command channel. */
export async function invokeOrionEngineControl(action: OrionEngineAction): Promise<string> {
    return withControlLock(async () => {
        try {
            const { current, command } = requireCompatibleControl();
            const snapshot = readCompatibleOrionSnapshot(current);
            if (!snapshot) throw new OrionIntegrationError("OrionQuests control state is unavailable.");
            if ((action === "start") === snapshot.running) {
                return action === "start" ? "Already running." : "Not running.";
            }

            const controlEngine = current.controlEngine;
            assertControlStillCurrent(current, command);
            if (current.controlEngine !== controlEngine) {
                throw new OrionIntegrationError("OrionQuests engine control changed before invocation.");
            }
            return await Promise.resolve(controlEngine.call(current, action));
        } catch (error) {
            return wrapControlFailure(error);
        }
    });
}

/**
 * Pause/resume Orion's current task set. Resume while the engine is stopped first starts the
 * engine, then clears Orion's persisted pause intent so the same unfinished quests become
 * eligible without resetting Discord progress.
 */
export async function invokeOrionGlobalTaskControl(action: OrionTaskAction): Promise<string> {
    return withControlLock(async () => {
        try {
            const { current, command } = requireCompatibleControl();
            const snapshot = readCompatibleOrionSnapshot(current);
            if (!snapshot) throw new OrionIntegrationError("OrionQuests control state is unavailable.");

            const controlEngine = current.controlEngine;
            const controlAll = current.controlAll;
            assertControlStillCurrent(current, command);
            if (current.controlEngine !== controlEngine || current.controlAll !== controlAll) {
                throw new OrionIntegrationError("OrionQuests task control changed before invocation.");
            }

            if (action === "pause") {
                if (!snapshot.running) return "Engine is not running.";
                return await Promise.resolve(controlAll.call(current, "pause"));
            }

            if (!snapshot.running) {
                await Promise.resolve(controlEngine.call(current, "start"));
                assertControlStillCurrent(current, command);
                if (current.controlAll !== controlAll) {
                    throw new OrionIntegrationError("OrionQuests task control changed while the engine was starting.");
                }
            }
            return await Promise.resolve(controlAll.call(current, "resume"));
        } catch (error) {
            return wrapControlFailure(error);
        }
    });
}

/** Target a single Orion task generation by exact Discord Quest id. */
export async function invokeOrionQuestTaskControl(questId: string, action: OrionTaskAction): Promise<string> {
    return withControlLock(async () => {
        try {
            const id = questId.trim();
            if (!id) throw new OrionIntegrationError("Quest id is unavailable.");

            const { current, command } = requireCompatibleControl();
            const snapshot = readCompatibleOrionSnapshot(current);
            if (!snapshot) throw new OrionIntegrationError("OrionQuests control state is unavailable.");

            const controlEngine = current.controlEngine;
            const controlQuest = current.controlQuest;
            assertControlStillCurrent(current, command);
            if (current.controlEngine !== controlEngine || current.controlQuest !== controlQuest) {
                throw new OrionIntegrationError("OrionQuests per-Quest control changed before invocation.");
            }

            if (action === "pause") {
                if (!snapshot.running) return "Engine is not running.";
                return await Promise.resolve(controlQuest.call(current, id, "pause"));
            }

            if (!snapshot.running) {
                await Promise.resolve(controlEngine.call(current, "start"));
                assertControlStillCurrent(current, command);
                if (current.controlQuest !== controlQuest) {
                    throw new OrionIntegrationError("OrionQuests per-Quest control changed while the engine was starting.");
                }
            }
            return await Promise.resolve(controlQuest.call(current, id, "resume"));
        } catch (error) {
            return wrapControlFailure(error);
        }
    });
}
