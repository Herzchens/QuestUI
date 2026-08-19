export type OrionEngineAction = "start" | "stop";
export type OrionTaskAction = "pause" | "resume";
export type OrionQuestControlState = "running" | "queued" | "paused" | "stopped";

export type OrionControlSnapshot = {
    running: boolean;
    quests: Record<string, OrionQuestControlState>;
};

export type OrionCompanionSurface = {
    // Legacy engine-only access remains part of the contract so a compatible fork can be
    // distinguished from unrelated plugin objects that happen to expose similarly named methods.
    getEngineRunning: () => boolean;
    subscribeEngineRunning: (listener: () => void) => () => void;
    getControlSnapshot: () => OrionControlSnapshot;
    subscribeControlState: (listener: () => void) => () => void;
    controlEngine: (action: OrionEngineAction) => Promise<string> | string;
    controlAll: (action: OrionTaskAction) => Promise<string> | string;
    controlQuest: (questId: string, action: OrionTaskAction) => Promise<string> | string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasChoice(option: Record<string, unknown>, value: string): boolean {
    if (!Array.isArray(option.choices)) return false;
    return option.choices.some(choice => isRecord(choice) && choice.value === value);
}

/** Validate the registered slash-command identity used to confirm the detected plugin is Orion. */
export function isCompatibleOrionCommand(candidate: unknown, stringOptionType: number): boolean {
    if (!isRecord(candidate)) return false;
    if (candidate.name !== "orion" || candidate.plugin !== "OrionQuests" || candidate.isVencordCommand !== true) return false;
    if (typeof candidate.execute !== "function" || !Array.isArray(candidate.options)) return false;

    const actionOptions = candidate.options.filter(option => isRecord(option) && option.name === "action");
    if (actionOptions.length !== 1) return false;

    const action = actionOptions[0] as Record<string, unknown>;
    if (action.required !== true || action.type !== stringOptionType) return false;
    return hasChoice(action, "start")
        && hasChoice(action, "stop")
        && hasChoice(action, "pause")
        && hasChoice(action, "resume");
}

function isControlSnapshot(value: unknown): value is OrionControlSnapshot {
    if (!isRecord(value) || typeof value.running !== "boolean" || !isRecord(value.quests)) return false;
    return Object.values(value.quests).every(state =>
        state === "running" || state === "queued" || state === "paused" || state === "stopped"
    );
}

/** Validate only the narrow Orion companion state/control surface QuestUI consumes. */
export function isCompatibleOrionCompanion(candidate: unknown): candidate is OrionCompanionSurface {
    if (!isRecord(candidate)) return false;
    if (typeof candidate.getEngineRunning !== "function"
        || typeof candidate.subscribeEngineRunning !== "function"
        || typeof candidate.getControlSnapshot !== "function"
        || typeof candidate.subscribeControlState !== "function"
        || typeof candidate.controlEngine !== "function"
        || typeof candidate.controlAll !== "function"
        || typeof candidate.controlQuest !== "function") {
        return false;
    }

    // Shape validation happens again on every runtime read. Do not invoke plugin code here:
    // compatibility checks are used while settings/UI are rendering and must stay side-effect free.
    return true;
}

export function readCompatibleOrionSnapshot(candidate: OrionCompanionSurface): OrionControlSnapshot | null {
    try {
        const snapshot = candidate.getControlSnapshot();
        return isControlSnapshot(snapshot) ? snapshot : null;
    } catch {
        return null;
    }
}
