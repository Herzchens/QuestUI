/** Bounded, idle-expiring sessions. Explicit release remains the normal path. */
export function createPageSessionStore<T>(limit: number, ttlMs: number, now = Date.now) {
    const sessions = new Map<string, { value: T; lastAccess: number; }>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    function prune(): void {
        const cutoff = now() - ttlMs;
        for (const [id, entry] of sessions) {
            if (entry.lastAccess <= cutoff) sessions.delete(id);
        }
    }

    function schedule(): void {
        if (timer != null) clearTimeout(timer);
        timer = null;
        if (!sessions.size) return;
        const earliest = Math.min(...Array.from(sessions.values(), entry => entry.lastAccess));
        const handle = setTimeout(() => {
            if (timer !== handle) return;
            timer = null;
            prune();
            schedule();
        }, Math.max(1, earliest + ttlMs - now()));
        timer = handle;
        // A native session must not prevent the main process from exiting.
        if (typeof handle === "object") (handle as { unref?: () => void }).unref?.();
    }

    return {
        get(id: string): T | undefined {
            prune();
            const entry = sessions.get(id);
            if (entry) {
                entry.lastAccess = now();
                sessions.delete(id);
                sessions.set(id, entry);
            }
            schedule();
            return entry?.value;
        },
        set(id: string, value: T): void {
            prune();
            sessions.delete(id);
            sessions.set(id, { value, lastAccess: now() });
            while (sessions.size > limit) {
                const oldest = sessions.keys().next().value;
                if (oldest === undefined) break;
                sessions.delete(oldest);
            }
            schedule();
        },
        delete(id: string): void {
            sessions.delete(id);
            schedule();
        },
        clear(): void {
            sessions.clear();
            schedule();
        }
    };
}
