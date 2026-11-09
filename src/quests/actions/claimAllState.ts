export interface ClaimAllRuntimeState {
    active: boolean;
    position: number;
    total: number;
}

const IDLE_STATE: ClaimAllRuntimeState = {
    active: false,
    position: 0,
    total: 0
};

let state: ClaimAllRuntimeState = IDLE_STATE;
const listeners = new Set<() => void>();

function publish(next: ClaimAllRuntimeState): void {
    state = next;
    for (const listener of listeners) listener();
}

export function getClaimAllRuntimeState(): ClaimAllRuntimeState {
    return state;
}

export function subscribeClaimAllRuntimeState(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function beginClaimAllRuntime(total: number): boolean {
    if (state.active || !Number.isSafeInteger(total) || total < 1) return false;

    publish({
        active: true,
        position: 1,
        total
    });
    return true;
}

export function updateClaimAllRuntimeProgress(position: number): void {
    if (!state.active) return;

    const normalized = Math.max(1, Math.min(state.total, Math.floor(position)));
    if (normalized === state.position) return;

    publish({
        ...state,
        position: normalized
    });
}

export function endClaimAllRuntime(): void {
    if (!state.active && state.position === 0 && state.total === 0) return;
    publish(IDLE_STATE);
}
