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
