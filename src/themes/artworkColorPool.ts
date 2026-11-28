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
export function createArtworkColorPool<T>(load: Loader<T>, cacheLimit = 256, concurrency = 4) {
    const limit = Number.isFinite(cacheLimit) ? Math.max(0, Math.floor(cacheLimit)) : 256;
    const workers = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 4;
    const entries = new Map<string, Entry<T>>();
    const catalogues = new Map<object, Set<string>>();
    const demand = new Set<Entry<T>>();
    const prewarm = new Set<Entry<T>>();
    let selected = new Set<string>();
    let running = 0;

    function discard(entry: Entry<T>): void {
        if (entries.get(entry.url) !== entry) return;
        entries.delete(entry.url);
        demand.delete(entry);
        prewarm.delete(entry);
        if (entry.state !== "done") {
            entry.controller.abort();
            entry.resolve(null);
        }
    }

    function pump(): void {
        while (running < workers && (demand.size || prewarm.size)) {
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
                    entry.state = "done";
                    entry.color = color;
                    entry.retryAt = color === null ? Date.now() + FAILED_RETRY_MS : 0;
                    entry.resolve(color);
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
                if (!entry.users && !selected.has(entry.url)) discard(entry);
            }
            for (const url of selected) ensure(url);
            pump();
        },
        acquire(url: string) {
            const entry = ensure(url);
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
                    if (!entry.users) {
                        if (!selected.has(url)) discard(entry);
                        else if (entry.state === "queued") {
                            demand.delete(entry);
                            prewarm.add(entry);
                        }
                    }
                }
            };
        },
        peek(url: string): T | null | undefined {
            return entries.get(url)?.color;
        }
    };
}
