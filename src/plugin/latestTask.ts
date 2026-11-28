/** At most one running task and one replacement. Cancel only pending work;
 * an external IPC already in flight must settle before its slot is reused. */
export function createLatestTask() {
    let running = false;
    let pending: (() => Promise<void>) | null = null;

    async function drain(): Promise<void> {
        if (running) return;
        running = true;
        try {
            while (pending) {
                const task = pending;
                pending = null;
                try { await task(); } catch { /* Owners handle their own failures. */ }
            }
        } finally {
            running = false;
        }
    }

    return {
        request(task: () => Promise<void>): void {
            pending = task;
            void drain();
        },
        cancelPending(): void {
            pending = null;
        }
    };
}

/** One running task globally, one replacement per live owner. Owners must
 * cancel their pending task on disposal; active external IPC is not cancelled. */
export function createOwnedTaskQueue<K extends object>() {
    const pending = new Map<K, () => Promise<void>>();
    let running = false;

    async function drain(): Promise<void> {
        if (running) return;
        running = true;
        try {
            while (pending.size) {
                const entry = pending.entries().next().value!;
                pending.delete(entry[0]);
                try { await entry[1](); } catch { }
            }
        } finally { running = false; }
    }

    return {
        request(owner: K, task: () => Promise<void>): void {
            pending.set(owner, task);
            void drain();
        },
        cancel(owner: K): void { pending.delete(owner); }
    };
}
