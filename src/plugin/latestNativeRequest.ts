/** One native operation and one latest undispatched owner. Never release an
 * already dispatched operation until the host settles it. */
export function createLatestNativeRequest<K extends object>(run: (key: K) => Promise<void>, isCurrent: (key: K) => boolean, stale: () => Error) {
    type Entry = { key: K; promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void; };
    let running: Entry | null = null;
    let pending: Entry | null = null;

    function pump(): void {
        if (running || !pending) return;
        const entry = pending;
        pending = null;
        if (!isCurrent(entry.key)) { entry.reject(stale()); return; }
        running = entry;
        void Promise.resolve().then(() => {
            if (!isCurrent(entry.key)) throw stale();
            return run(entry.key);
        }).then(() => {
            if (running === entry) running = null;
            entry.resolve();
            pump();
        }, error => {
            if (running === entry) running = null;
            entry.reject(error);
            pump();
        });
    }

    return function request(key: K): Promise<void> {
        if (!isCurrent(key)) return Promise.reject(stale());
        if (running?.key === key) return running.promise;
        if (pending?.key === key) return pending.promise;
        if (pending) {
            pending.reject(stale());
            pending = null;
        }
        let resolve!: () => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
        pending = { key, promise, resolve, reject };
        pump();
        return promise;
    };
}
