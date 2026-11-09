export const QUEST_AUTO_RELOAD_MINUTES = [10, 20, 30, 60, 120, 240, 300, 720, 1440] as const;
export const QUEST_AUTO_RELOAD_STEP_MARKERS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export const DEFAULT_QUEST_AUTO_RELOAD_MINUTES = 300;
export const DEFAULT_QUEST_AUTO_RELOAD_STEP = 6;

export function normalizeQuestAutoReloadStep(value: unknown): number {
    const numeric = Number(value);
    return QUEST_AUTO_RELOAD_STEP_MARKERS.includes(numeric as typeof QUEST_AUTO_RELOAD_STEP_MARKERS[number])
        ? numeric
        : DEFAULT_QUEST_AUTO_RELOAD_STEP;
}

export function questAutoReloadMinutesFromStep(value: unknown): number {
    return QUEST_AUTO_RELOAD_MINUTES[normalizeQuestAutoReloadStep(value)] ?? DEFAULT_QUEST_AUTO_RELOAD_MINUTES;
}

export function normalizeQuestAutoReloadMinutes(value: unknown): number {
    const numeric = Number(value);
    return QUEST_AUTO_RELOAD_MINUTES.includes(numeric as typeof QUEST_AUTO_RELOAD_MINUTES[number])
        ? numeric
        : DEFAULT_QUEST_AUTO_RELOAD_MINUTES;
}

export function questAutoReloadMarkerLabel(value: unknown): string {
    const minutes = questAutoReloadMinutesFromStep(value);
    return minutes < 60 ? `${minutes}m` : `${minutes / 60}h`;
}

function finiteTimestamp(value: unknown): number | null {
    if (value == null || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function nextQuestAutoReloadDelay(
    lastSuccessfulReloadAt: number | null | undefined,
    lastAttemptAt: number | null | undefined,
    now: number,
    configuredMinutes: unknown
): number {
    const intervalMs = normalizeQuestAutoReloadMinutes(configuredMinutes) * 60 * 1000;
    if (!Number.isFinite(now)) return intervalMs;

    const successfulAt = finiteTimestamp(lastSuccessfulReloadAt);
    const attemptedAt = finiteTimestamp(lastAttemptAt);
    const baseline = successfulAt == null
        ? attemptedAt
        : attemptedAt == null
            ? successfulAt
            : Math.max(successfulAt, attemptedAt);

    if (baseline == null) return 0;
    return Math.max(0, baseline + intervalMs - now);
}
