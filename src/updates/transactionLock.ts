import { realpath } from "fs/promises";

// Both native engines mutate the same runtime distribution. Reserve the
// canonical root for the entire transaction, including rollback and cleanup.
const activeRoots = new Set<string>();

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
