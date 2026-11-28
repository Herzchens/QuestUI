import { realpath } from "fs/promises";

// Both native engines mutate the same runtime distribution. Reserve the
// canonical root for the entire transaction, including rollback and cleanup.
// Native bundles can be instantiated again in the same process during reload.
// Keep the reservation in the process realm rather than a module instance.
const lockKey = Symbol.for("QuestUI.vencordUpdateRoots.v1");
const registry = globalThis as unknown as Record<symbol, Set<string> | undefined>;
const activeRoots = registry[lockKey] ?? (registry[lockKey] = new Set<string>());

export async function tryAcquireVencordUpdate(root: string): Promise<(() => void) | null> {
    const canonical = await realpath(root);
    const key = process.platform === "win32" ? canonical.toLowerCase() : canonical;
    if (activeRoots.has(key)) return null;
    activeRoots.add(key);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        activeRoots.delete(key);
    };
}
