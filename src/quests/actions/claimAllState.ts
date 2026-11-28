import type { BatchActionMode } from "./claimAll";

export interface ClaimAllRuntimeState {
    active: boolean;
    mode: BatchActionMode | null;
    position: number;
    total: number;
}

const IDLE_STATE: ClaimAllRuntimeState = {
    active: false,
    mode: null,
    position: 0,
    total: 0
};

let state: ClaimAllRuntimeState = IDLE_STATE;
let generation = 0;
let activeGeneration = 0;
const listeners = new Set<() => void>();

function publish(next: ClaimAllRuntimeState): void {
    state = next;
    for (const listener of [...listeners]) {
        try { listener(); } catch { /* View failures cannot leave the batch lock half-published. */ }
    }
}

export function getClaimAllRuntimeState(): ClaimAllRuntimeState {
    return state;
}

export function subscribeClaimAllRuntimeState(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function beginClaimAllRuntime(total: number, mode: BatchActionMode = "claim"): boolean {
    if (state.active || !Number.isSafeInteger(total) || total < 1) return false;

    activeGeneration = ++generation;
    publish({
        active: true,
        mode,
        position: 1,
        total
    });
    return true;
}

export function getClaimAllRuntimeGeneration(): number | null {
    return state.active ? activeGeneration : null;
}

export function isClaimAllRuntimeGenerationActive(expectedGeneration: number): boolean {
    return state.active && activeGeneration === expectedGeneration;
}

export function updateClaimAllRuntimeProgress(position: number, expectedGeneration?: number): void {
    if (!state.active) return;
    if (expectedGeneration != null && activeGeneration !== expectedGeneration) return;

    const normalized = Math.max(1, Math.min(state.total, Math.floor(position)));
    if (normalized === state.position) return;

    publish({
        ...state,
        position: normalized
    });
}

export function endClaimAllRuntime(expectedGeneration?: number): void {
    if (expectedGeneration != null && activeGeneration !== expectedGeneration) return;
    activeGeneration = 0;
    if (!state.active && state.position === 0 && state.total === 0) return;
    publish(IDLE_STATE);
}

export function resetClaimAllRuntime(): void {
    generation++;
    activeGeneration = 0;
    if (!state.active && state.position === 0 && state.total === 0) return;
    publish(IDLE_STATE);
}
