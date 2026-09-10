import type { NormalizedQuest, NormalizedTask } from "./questData";
import type { OrionControlSnapshot, OrionQuestControlState, OrionTaskAction } from "./orionCommandLogic";

export type OrionSmartAction = "start" | OrionTaskAction;
export type OrionQuestProgressSource = "native" | "stored";

export type GlobalOrionControlState = {
    action: OrionSmartAction;
    smartDisabled: boolean;
    stopDisabled: boolean;
};

export type QuestOrionControlState = {
    action: OrionSmartAction;
    disabled: boolean;
};

export function farmableQuestIds(quests: readonly Pick<NormalizedQuest, "id" | "status">[]): string[] {
    return quests
        .filter(quest => quest.status === "available" || quest.status === "in-progress")
        .map(quest => quest.id);
}

function statesFor(snapshot: OrionControlSnapshot, questIds: readonly string[]): Array<OrionQuestControlState | undefined> {
    return questIds.map(id => snapshot.quests[id]);
}

function collectionEntries(value: any): Array<[string, any]> {
    if (!value) return [];
    if (value instanceof Map) return Array.from(value.entries());
    if (typeof value === "object") return Object.entries(value);
    return [];
}

function selectedTaskEntries(rawQuest: any): Array<[string, any]> {
    const current = collectionEntries(rawQuest?.config?.taskConfigV2?.tasks);
    return current.length > 0 ? current : collectionEntries(rawQuest?.config?.taskConfig?.tasks);
}

/**
 * Read only Discord's persisted progress fields, deliberately excluding its active-desktop
 * optimistic projection. This remains live QuestStore data: it is not a QuestUI progress cache.
 */
export function storedQuestTaskProgress(
    rawQuest: any,
    task: Pick<NormalizedTask, "key" | "type" | "target">
): number {
    if (rawQuest?.userStatus?.completedAt) return Math.max(0, task.target);

    const progress = rawQuest?.userStatus?.progress;
    const rawTask = selectedTaskEntries(rawQuest).find(([key]) => key === task.key)?.[1];
    const typedKey = typeof rawTask?.type === "string" ? rawTask.type : null;
    const entries = collectionEntries(progress);
    const direct = entries.find(([key]) => key === task.key)?.[1];
    const typed = typedKey && typedKey !== task.key
        ? entries.find(([key]) => key === typedKey)?.[1]
        : null;
    const value = Number(direct?.value ?? typed?.value);
    if (Number.isFinite(value)) return Math.max(0, value);

    if (task.type === "stream") {
        const streamProgress = Number(rawQuest?.userStatus?.streamProgressSeconds);
        return Number.isFinite(streamProgress) ? Math.max(0, streamProgress) : 0;
    }

    return 0;
}

/**
 * Decide whether an Orion-owned Quest may use Discord's active-desktop optimistic progress.
 * Unknown Quest ids stay Discord-native: Orion must explicitly claim the Quest before its
 * control state can suppress a projection that may still tick after Pause/Stop.
 */
export function orionQuestProgressSource(
    snapshot: OrionControlSnapshot | null,
    questId: string
): OrionQuestProgressSource {
    if (!snapshot) return "native";
    const state = snapshot.quests[questId];
    if (state == null) return "native";
    return snapshot.running && state === "running" ? "native" : "stored";
}

/**
 * Derive the two global controls without inventing an Orion state mirror.
 * Discord's QuestStore decides whether there is work left; Orion decides running/queued/paused.
 */
export function deriveGlobalOrionControl(
    snapshot: OrionControlSnapshot,
    farmableIds: readonly string[]
): GlobalOrionControlState {
    if (farmableIds.length === 0) {
        // Keep the visual affordance stable when everything is done, but make both actions inert.
        return { action: "start", smartDisabled: true, stopDisabled: true };
    }

    const states = statesFor(snapshot, farmableIds);
    const hasActive = states.some(state => state === "running" || state === "queued");
    const hasPaused = states.some(state => state === "paused");

    if (!snapshot.running) {
        return {
            action: hasPaused ? "resume" : "start",
            smartDisabled: false,
            stopDisabled: true
        };
    }

    if (hasActive) return { action: "pause", smartDisabled: false, stopDisabled: false };
    if (hasPaused) return { action: "resume", smartDisabled: false, stopDisabled: false };

    // Orion is up but has not published a controllable task yet (startup/rescan/PENDING window).
    // Stop remains valid, while guessing Pause/Resume would create a misleading no-op.
    return { action: "pause", smartDisabled: true, stopDisabled: false };
}

export function deriveQuestOrionControl(
    snapshot: OrionControlSnapshot,
    questId: string
): QuestOrionControlState {
    const state = snapshot.quests[questId];

    if (!snapshot.running) {
        return { action: state === "paused" ? "resume" : "start", disabled: false };
    }
    if (state === "paused") return { action: "resume", disabled: false };
    if (state === "running" || state === "queued") return { action: "pause", disabled: false };

    // The quest is enrolled in Discord but Orion has not published its task row yet.
    return { action: "pause", disabled: true };
}
