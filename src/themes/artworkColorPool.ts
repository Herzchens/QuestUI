type Loader<T> = (url: string, signal: AbortSignal) => Promise<T | null>;

interface Entry<T> {
    url: string;
    users: number;
    controller: AbortController;
    state: "queued" | "running" | "done";
    promise: Promise<T | null>;
    resolve: (color: T | null) => void;
    color?: T | null;
    retryAt: number;
}

const FAILED_RETRY_MS = 30_000;

/** Demand takes precedence over a bounded prewarm catalogue. Mounted consumers
 * own their entries even when the idle cache is full. */
export function createArtworkColorPool<T>(load: Loader<T>, cacheLimit = 256, concurrency = 4, idleLimit = 0) {
    const limit = Number.isFinite(cacheLimit) ? Math.max(0, Math.floor(cacheLimit)) : 256;
    const workers = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 4;
    const entries = new Map<string, Entry<T>>();
    const catalogues = new Map<object, Set<string>>();
    const demand = new Set<Entry<T>>();
    const prewarm = new Set<Entry<T>>();
    let selected = new Set<string>();
    let running = 0;
    let enabled = true;
    const idleCapacity = Number.isSafeInteger(idleLimit) ? Math.max(0, idleLimit) : 0;
    const idle = new Map<string, Entry<T>>();

    function discard(entry: Entry<T>): void {
        if (entries.get(entry.url) !== entry) return;
        entries.delete(entry.url);
        idle.delete(entry.url);
        demand.delete(entry);
        prewarm.delete(entry);
        if (entry.state !== "done") {
            entry.controller.abort();
            entry.resolve(null);
        }
    }

    function retire(entry: Entry<T>): void {
        if (!idleCapacity || entry.state !== "done" || entry.color == null) return discard(entry);
        idle.delete(entry.url);
        idle.set(entry.url, entry);
        while (idle.size > idleCapacity) {
            const oldest = idle.values().next().value;
            if (!oldest) break;
            discard(oldest);
        }
    }

    function pump(): void {
        while (enabled && running < workers && (demand.size || prewarm.size)) {
            const entry = (demand.size ? demand : prewarm).values().next().value!;
            demand.delete(entry);
            prewarm.delete(entry);
            if (entries.get(entry.url) !== entry) continue;
            entry.state = "running";
            running++;
            void Promise.resolve()
                .then(() => entry.controller.signal.aborted ? null : load(entry.url, entry.controller.signal))
                .catch(() => null)
                .then(color => {
                    if (entries.get(entry.url) === entry && !entry.controller.signal.aborted) {
                        entry.state = "done";
                        entry.color = color;
                        entry.retryAt = color === null ? Date.now() + FAILED_RETRY_MS : 0;
                        entry.resolve(color);
                    } else entry.resolve(null);
                    running--;
                    pump();
                });
        }
    }

    function ensure(url: string): Entry<T> {
        const cached = entries.get(url);
        if (cached) {
            if (cached.state !== "done" || cached.color !== null || cached.users || Date.now() < cached.retryAt) return cached;
            discard(cached);
        }
        let resolve!: Entry<T>["resolve"];
        const promise = new Promise<T | null>(done => { resolve = done; });
        const entry: Entry<T> = { url, users: 0, controller: new AbortController(), state: "queued", promise, resolve, retryAt: 0 };
        entries.set(url, entry);
        prewarm.add(entry);
        return entry;
    }

    return {
        replaceCatalogue(owner: object, urls: Iterable<string | null>) {
            if (!enabled) return;
            // A catalogue may be much larger than the prewarm budget; keep only
            // the first unique URLs, and never evict mounted consumers.
            const next = new Set<string>();
            if (limit > 0) {
                for (const url of urls) {
                    if (url) next.add(url);
                    if (next.size >= limit) break;
                }
            }
            if (next.size) catalogues.set(owner, next);
            else catalogues.delete(owner);
            selected = new Set();
            for (const catalogue of catalogues.values()) {
                for (const url of catalogue) {
                    if (selected.size >= limit) break;
                    selected.add(url);
                }
                if (selected.size >= limit) break;
            }
            for (const entry of entries.values()) {
                if (selected.has(entry.url)) idle.delete(entry.url);
                else if (!entry.users && !idle.has(entry.url)) retire(entry);
            }
            for (const url of selected) ensure(url);
            pump();
        },
        acquire(url: string) {
            if (!enabled) return { promise: Promise.resolve(null), release() {} };
            const entry = ensure(url);
            idle.delete(url);
            entry.users++;
            if (entry.state === "queued") {
                prewarm.delete(entry);
                demand.add(entry);
            }
            pump();
            let released = false;
            return {
                promise: entry.promise,
                release() {
                    if (released) return;
                    released = true;
                    entry.users--;
                    if (entries.get(url) !== entry) return;
                    if (!entry.users) {
                        if (!selected.has(url)) retire(entry);
                        else if (entry.state === "queued") {
                            demand.delete(entry);
                            prewarm.add(entry);
                        }
                    }
                }
            };
        },
        peek(url: string): T | null | undefined {
            const entry = idle.get(url);
            if (entry) { idle.delete(url); idle.set(url, entry); }
            return entries.get(url)?.color;
        },
        start() { enabled = true; pump(); },
        stop() {
            enabled = false;
            selected.clear();
            catalogues.clear();
            for (const entry of entries.values()) discard(entry);
            idle.clear();
        },
        stats() { return { entries: entries.size, idle: idle.size, selected: selected.size, running, queued: demand.size + prewarm.size }; }
    };
}
