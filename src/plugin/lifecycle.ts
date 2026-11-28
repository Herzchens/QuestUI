interface LifecycleService {
    start(): void;
    stop(): void;
}

/** Include partially started services in rollback; always attempt every disposer. */
export function createServiceLifecycle(services: readonly LifecycleService[]) {
    let owned: LifecycleService[] = [];
    let running = false;

    function stop(): void {
        running = false;
        const failures: unknown[] = [];
        const retry: LifecycleService[] = [];
        for (const service of [...owned].reverse()) {
            try { service.stop(); }
            catch (error) {
                failures.push(error);
                retry.unshift(service);
            }
        }
        owned = retry;
        if (failures.length) throw new AggregateError(failures, "QuestUI lifecycle cleanup failed.");
    }

    function start(): void {
        if (running) return;
        if (owned.length) stop();
        try {
            for (const service of services) {
                owned.push(service);
                service.start();
            }
            running = true;
        } catch (error) {
            try { stop(); }
            catch (cleanupError) {
                throw new AggregateError([error, cleanupError], "QuestUI startup and rollback failed.");
            }
            throw error;
        }
    }

    return { start, stop };
}
