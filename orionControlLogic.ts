import type { NormalizedQuest } from "./questData";
import type { OrionControlSnapshot, OrionQuestControlState, OrionTaskAction } from "./orionCommandLogic";

export type OrionSmartAction = "start" | OrionTaskAction;

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
