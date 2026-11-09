export type OrbBalanceDisplayState =
    | { kind: "loading"; }
    | { kind: "unavailable"; }
    | { kind: "ready"; balance: number; };

export function normalizeOrbBalance(value: unknown): number | null {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? value
        : null;
}

export function shouldFetchOrbBalance(
    balance: number | null,
    isFetching: boolean,
    hasFetchError: boolean,
    invocationFailed = false
): boolean {
    return balance == null && !isFetching && !hasFetchError && !invocationFailed;
}

export function deriveOrbBalanceDisplayState(
    balance: number | null,
    isFetching: boolean,
    hasFetchError: boolean,
    invocationFailed = false
): OrbBalanceDisplayState {
    if (balance != null) return { kind: "ready", balance };
    if (hasFetchError || invocationFailed) return { kind: "unavailable" };
    return { kind: "loading" };
}
