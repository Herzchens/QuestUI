export const QUEST_RELOAD_MIN_SPIN_MS = 2000;

export function remainingReloadSpinMs(
    startedAt: number,
    now: number,
    minimumMs = QUEST_RELOAD_MIN_SPIN_MS
): number {
    if (!Number.isFinite(startedAt) || !Number.isFinite(now) || !Number.isFinite(minimumMs)) return 0;
    return Math.max(0, Math.max(0, minimumMs) - Math.max(0, now - startedAt));
}
