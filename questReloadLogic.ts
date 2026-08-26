export const QUEST_RELOAD_MIN_ROTATIONS = 3;

export function shouldFinishReloadSpin(
    completedRotations: number,
    requestSettled: boolean,
    minimumRotations = QUEST_RELOAD_MIN_ROTATIONS
): boolean {
    if (!requestSettled) return false;
    if (!Number.isFinite(completedRotations) || !Number.isFinite(minimumRotations)) return false;

    const completed = Math.max(0, Math.floor(completedRotations));
    const minimum = Math.max(1, Math.ceil(minimumRotations));
    return completed >= minimum;
}
