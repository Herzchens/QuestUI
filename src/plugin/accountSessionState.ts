export interface AccountSession {
    readonly accountId: string;
    readonly generation: number;
}

/** Identity tokens never become valid again, even for an A -> B -> A transition. */
export function createAccountSessionTracker(readAccountId: () => string | null) {
    let active = false;
    let generation = 0;
    let observed: string | null = null;
    let session: AccountSession | null = null;

    function observe(): void {
        if (!active) return;
        const next = readAccountId();
        if (next === observed) return;
        observed = next;
        generation++;
        session = next == null ? null : { accountId: next, generation };
    }

    function start(): void {
        if (active) return;
        active = true;
        observe();
    }

    function stop(): void {
        active = false;
        generation++;
        observed = null;
        session = null;
    }

    function capture(): AccountSession | null {
        observe();
        return session;
    }

    return {
        start,
        stop,
        observe,
        capture,
        isCurrent: (expected: AccountSession | null): boolean => expected != null && capture() === expected
    };
}
