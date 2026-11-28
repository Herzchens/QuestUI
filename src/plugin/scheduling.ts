// Persisted clocks are data, not authority to schedule unbounded timers.
export const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export function finiteStoredTimestamp(value: unknown): number | null {
    const n = typeof value === "number" ? value
        : typeof value === "string" && /^\d{1,16}$/.test(value) ? Number(value) : NaN;
    return Number.isSafeInteger(n) && n >= 0 && n <= 8.64e15 ? n : null;
}

export function validSchedulerTimestamp(value: unknown, now: number): number | null {
    const n = finiteStoredTimestamp(value);
    return n !== null && Number.isFinite(now) && n <= now + MAX_CLOCK_SKEW_MS ? n : null;
}

export function boundedTimerDelay(value: number): number {
    return Number.isFinite(value) ? Math.max(250, Math.min(MAX_TIMER_DELAY_MS, value)) : MAX_TIMER_DELAY_MS;
}
