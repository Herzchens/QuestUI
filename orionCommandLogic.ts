export type OrionCommandAction = "start" | "stop";

export type OrionCompanionSurface = {
    getEngineRunning: () => boolean;
    subscribeEngineRunning: (listener: () => void) => () => void;
    controlEngine: (action: OrionCommandAction) => Promise<string> | string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasChoice(option: Record<string, unknown>, value: OrionCommandAction): boolean {
    if (!Array.isArray(option.choices)) return false;
    return option.choices.some(choice => isRecord(choice) && choice.value === value);
}

/** Validate the stable slash-command identity used to confirm the detected plugin is Orion. */
export function isCompatibleOrionCommand(candidate: unknown, stringOptionType: number): boolean {
    if (!isRecord(candidate)) return false;
    if (candidate.name !== "orion" || candidate.plugin !== "OrionQuests" || candidate.isVencordCommand !== true) return false;
    if (typeof candidate.execute !== "function" || !Array.isArray(candidate.options)) return false;

    const actionOptions = candidate.options.filter(option => isRecord(option) && option.name === "action");
    if (actionOptions.length !== 1) return false;

    const action = actionOptions[0] as Record<string, unknown>;
    if (action.required !== true || action.type !== stringOptionType) return false;
    return hasChoice(action, "start") && hasChoice(action, "stop");
}

/** Validate only the narrow Orion companion state/control surface QuestUI consumes. */
export function isCompatibleOrionCompanion(candidate: unknown): candidate is OrionCompanionSurface {
    if (!isRecord(candidate)) return false;
    return typeof candidate.getEngineRunning === "function"
        && typeof candidate.subscribeEngineRunning === "function"
        && typeof candidate.controlEngine === "function";
}
