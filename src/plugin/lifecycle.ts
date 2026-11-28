interface LifecycleService {
    start(): void;
    stop(): void;
}

/** Include partially started services in rollback; always attempt every disposer. */
export function createServiceLifecycle(services: readonly LifecycleService[]) {
    let owned: LifecycleService[] = [];
    let running = false;
    let phase: "idle" | "starting" | "stopping" = "idle";
    let stopRequested = false;

    function stop(): void {
        if (phase === "starting") { stopRequested = true; return; }
        if (phase === "stopping") return;
        running = false;
        phase = "stopping";
        const failures: unknown[] = [];
        const retry: LifecycleService[] = [];
        try {
            for (const service of [...owned].reverse()) {
                try { service.stop(); }
                catch (error) { failures.push(error); retry.unshift(service); }
            }
            owned = retry;
        } finally { phase = "idle"; }
        if (failures.length) throw new AggregateError(failures, "QuestUI lifecycle cleanup failed.");
    }

    function start(): void {
        if (running || phase !== "idle") return;
        if (owned.length) stop();
        phase = "starting";
        stopRequested = false;
        try {
            for (const service of services) {
                owned.push(service);
                service.start();
                if (stopRequested) break;
            }
            running = !stopRequested;
        } catch (error) {
            phase = "idle";
            try { stop(); }
            catch (cleanupError) {
                throw new AggregateError([error, cleanupError], "QuestUI startup and rollback failed.");
            }
            throw error;
        } finally { phase = "idle"; }
        if (stopRequested) stop();
    }

    return { start, stop, isRunning: () => running };
}
