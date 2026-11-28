import { ignoredQuestIds, isIgnoredQuestStateReady } from "../quests/ignored/runtime";
import settings from "../plugin/settings";
import { resumableQuestIds } from "./ignorePolicy";
import { captureAccountSession, isCurrentAccountSession } from "../plugin/accountSession";
import { createControlSubscription, type ControlSource } from "./controlSubscription";
import { ApplicationCommandOptionType, commands } from "@api/Commands";
import { isPluginEnabled, plugins } from "@api/PluginManager";

import { getOrionSchedulerCapabilitySource } from "./capabilities";
import {
    isCompatibleOrionCommand,
    isCompatibleOrionCompanion,
    readCompatibleOrionSnapshot
} from "./companion";
import type {
    OrionCompanionSurface,
    OrionControlSnapshot,
    OrionEngineAction,
    OrionTaskAction
} from "./companion";
import { normalizeOrionSchedulerSnapshot } from "./schedulerState";
import {
    deriveOrionIntegrationHealth,
    isKnownOrionVersionIncompatible
} from "./status";
import type { OrionIntegrationHealth } from "./status";

let controlPending = false;

type OrionPlugin = Partial<OrionCompanionSurface> & {
    started?: boolean;
    commands?: unknown[];
    version?: unknown;
};

type CompatibleOrionPlugin = OrionPlugin & OrionCompanionSurface;

function plugin(): OrionPlugin | null {
    return (plugins as any)?.OrionQuests ?? null;
}

function hasCompatibleCompanion(current: OrionPlugin | null): current is CompatibleOrionPlugin {
    return isCompatibleOrionCompanion(current);
}

function schedulerQuestStates(current: OrionPlugin): OrionControlSnapshot["schedulerQuests"] | undefined {
    const source = getOrionSchedulerCapabilitySource();
    if (!source || source.identity !== current) return undefined;

    try {
        const snapshot = normalizeOrionSchedulerSnapshot(source.getSnapshot());
        if (!snapshot) return undefined;
        return Object.fromEntries(
            Object.entries(snapshot.quests).map(([questId, quest]) => [questId, quest.state])
        );
    } catch {
        return undefined;
    }
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

    const snapshot = readCompatibleOrionSnapshot(current);
    if (!snapshot) return null;

    const schedulerQuests = schedulerQuestStates(current);
    return schedulerQuests === undefined ? snapshot : { ...snapshot, schedulerQuests };
}

function readControlSource(): ControlSource | null {
    const current = plugin();
    if (!hasCompatibleCompanion(current) || current.started !== true || !isOrionEnabled()) return null;
    const method = current.subscribeControlState;
    const candidate = getOrionSchedulerCapabilitySource();
    const scheduler = candidate?.identity === current ? candidate : null;
    return {
        identity: current,
        methods: [method, scheduler?.getMethod, scheduler?.subscribeMethod],
        subscribe(listener) {
            const releaseControl = method.call(current, listener);
            if (typeof releaseControl !== "function") return null;
            let releaseScheduler: (() => void) | null = null;
            try { releaseScheduler = scheduler?.subscribe(listener) ?? null; } catch { }
            let releasePrimary: (() => void) | null = releaseControl;
            return () => {
                const failures: unknown[] = [];
                try { releasePrimary?.(); releasePrimary = null; } catch (error) { failures.push(error); }
                try { releaseScheduler?.(); releaseScheduler = null; } catch (error) { failures.push(error); }
                if (failures.length) throw new AggregateError(failures, "Orion subscription cleanup failed.");
            };
        }
    };
}

const controlSubscription = createControlSubscription(readControlSource);
export const startOrionControlSubscriptions = controlSubscription.start;
export const stopOrionControlSubscriptions = controlSubscription.stop;
export const subscribeOrionControlState = controlSubscription.subscribe;

export function getOrionIntegrationHealth(integrationEnabled: boolean): OrionIntegrationHealth {
    const current = plugin();
    const installed = current !== null;
    const enabled = installed && isPluginEnabled("OrionQuests");
    const versionIncompatible = installed && isKnownOrionVersionIncompatible(current.version);
    const started = current?.started === true;

    // Avoid invoking plugin-owned code while Orion is absent, disabled, explicitly detached from
    // QuestUI, known-too-old, or not yet started. Only the final compatibility stage reads the
    // companion snapshot.
    const shouldValidateSurface = installed
        && enabled
        && integrationEnabled
        && !versionIncompatible
        && started;
    const commandCompatible = shouldValidateSurface && getRegisteredOrionCommand(current) !== null;
    const companionCompatible = shouldValidateSurface && hasCompatibleCompanion(current);
    const snapshotCompatible = companionCompatible && readCompatibleOrionSnapshot(current) !== null;

    return deriveOrionIntegrationHealth({
        installed,
        enabled,
        integrationEnabled,
        started,
        version: current?.version,
        commandCompatible,
        companionCompatible,
        snapshotCompatible
    });
}

export function isOrionCommandReady(): boolean {
    const current = plugin();
    return current !== null
        && isOrionEnabled()
        && !isKnownOrionVersionIncompatible(current.version)
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
        || isKnownOrionVersionIncompatible(current.version)
        || !hasCompatibleCompanion(current)) {
        throw new OrionIntegrationError("OrionQuests changed while the control was being prepared. Reopen the Dashboard and try again.");
    }
}

async function withControlLock<T>(work: () => Promise<T>): Promise<T> {
    if (controlPending) throw new OrionIntegrationError("Another Orion control action is already in progress.");
    const session = captureAccountSession();
    if (!session) throw new OrionIntegrationError("No current Discord account session.");
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

/** A native exclusion acknowledgment is optional; never assume a method name alone is enough. */
let syncingExclusions = false;
export function syncOrionExclusions(): boolean {
    if (syncingExclusions || !settings.store.orionIntegration || !isIgnoredQuestStateReady()) return false;
    const session = captureAccountSession();
    if (!session || !isOrionCommandReady()) return false;
    const current = plugin();
    if (!current || typeof current.setExcludedQuests !== "function") return false;
    syncingExclusions = true;
    try {
        const ids = [...ignoredQuestIds(session.accountId)].sort();
        const method = current.setExcludedQuests;
        if (!isCurrentAccountSession(session)) return false;
        const accepted = method.call(current, session.accountId, ids) === true;
        return accepted && isCurrentAccountSession(session) && plugin() === current
            && current.started === true && isOrionEnabled() && current.setExcludedQuests === method;
    } catch { return false; }
    finally { syncingExclusions = false; }
}

function requireIgnoreReady(): void {
    if (!isIgnoredQuestStateReady()) throw new OrionIntegrationError("Ignored Quests are still loading. Try again shortly.");
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
            if (action === "start") {
                requireIgnoreReady();
                const session = captureAccountSession();
                syncOrionExclusions();
                if (!isCurrentAccountSession(session)) throw new OrionIntegrationError("Discord account changed while Orion was starting.");
                assertControlStillCurrent(current, command);
                if (current.controlEngine !== controlEngine) throw new OrionIntegrationError("OrionQuests engine control changed.");
            }
            return await Promise.resolve(controlEngine.call(current, action));
        } catch (error) {
            return wrapControlFailure(error);
        }
    });
}

/**
 * Pause/resume Orion's current task set. Resume while the engine is stopped first starts the
 * engine, then resumes only non-ignored paused tasks without resetting Discord progress.
 */
export async function invokeOrionGlobalTaskControl(action: OrionTaskAction): Promise<string> {
    const session = captureAccountSession();
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

            requireIgnoreReady();
            syncOrionExclusions();
            if (!isCurrentAccountSession(session)) throw new OrionIntegrationError("Discord account changed before Orion control.");
            assertControlStillCurrent(current, command);
            if (current.controlEngine !== controlEngine) throw new OrionIntegrationError("OrionQuests engine control changed.");
            if (!snapshot.running) {
                await Promise.resolve(controlEngine.call(current, "start"));
                if (!isCurrentAccountSession(session)) throw new OrionIntegrationError("Discord account changed while Orion was starting.");
                assertControlStillCurrent(current, command);
                if (current.controlAll !== controlAll) {
                    throw new OrionIntegrationError("OrionQuests task control changed while the engine was starting.");
                }
            }
            if (!isCurrentAccountSession(session)) throw new OrionIntegrationError("Discord account changed while Orion was resuming.");
            // Native Orion owns the exclusion invariant. Re-sync after any awaited Start,
            // then use its normal global resume contract only on an acknowledged snapshot.
            const nativeExclusion = syncOrionExclusions();
            if (!isCurrentAccountSession(session)) throw new OrionIntegrationError("Discord account changed before Resume.");
            assertControlStillCurrent(current, command);
            if (current.controlAll !== controlAll) throw new OrionIntegrationError("OrionQuests task control changed.");
            if (nativeExclusion) return await Promise.resolve(controlAll.call(current, "resume"));

            const ignored = ignoredQuestIds(session?.accountId);
            const latest = readCompatibleOrionSnapshot(current);
            if (!latest) throw new OrionIntegrationError("OrionQuests control state is unavailable.");
            const resume = current.controlQuest;
            let count = 0;
            for (const id of resumableQuestIds(latest, ignored)) {
                if (!isCurrentAccountSession(session)) throw new OrionIntegrationError("Discord account changed while Orion was resuming.");
                assertControlStillCurrent(current, command);
                if (current.controlQuest !== resume) throw new OrionIntegrationError("OrionQuests task control changed.");
                if (ignoredQuestIds(session?.accountId).has(id)) continue;
                await Promise.resolve(resume.call(current, id, "resume"));
                count++;
            }
            return `Resumed ${count} non-ignored Quest(s).`;
        } catch (error) {
            return wrapControlFailure(error);
        }
    });
}

/** Target a single Orion task generation by exact Discord Quest id. */
export async function invokeOrionQuestTaskControl(questId: string, action: OrionTaskAction): Promise<string> {
    const session = captureAccountSession();
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

            requireIgnoreReady();
            if (ignoredQuestIds(session?.accountId).has(id)) throw new OrionIntegrationError("Unignore this Quest before resuming it.");
            syncOrionExclusions();
            if (!isCurrentAccountSession(session)) throw new OrionIntegrationError("Discord account changed before Orion control.");
            assertControlStillCurrent(current, command);
            if (current.controlEngine !== controlEngine) throw new OrionIntegrationError("OrionQuests engine control changed.");
            if (!snapshot.running) {
                await Promise.resolve(controlEngine.call(current, "start"));
                if (!isCurrentAccountSession(session)) throw new OrionIntegrationError("Discord account changed while Orion was starting.");
                assertControlStillCurrent(current, command);
                if (current.controlQuest !== controlQuest) {
                    throw new OrionIntegrationError("OrionQuests per-Quest control changed while the engine was starting.");
                }
            }
            if (!isCurrentAccountSession(session) || ignoredQuestIds(session?.accountId).has(id)) throw new OrionIntegrationError("Quest Ignore or account state changed before Resume.");
            return await Promise.resolve(controlQuest.call(current, id, "resume"));
        } catch (error) {
            return wrapControlFailure(error);
        }
    });
}
