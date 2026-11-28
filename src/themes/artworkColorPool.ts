type Loader<T> = (url: string, signal: AbortSignal) => Promise<T | null>;

interface Entry<T> {
    url: string;
    users: number;
    controller: AbortController;
    state: "queued" | "running" | "done";
    promise: Promise<T | null>;
    resolve: (color: T | null) => void;
    color?: T | null;
}

/** Own image work by catalogue and mounted consumers, independently of sampling. */
export function createArtworkColorPool<T>(load: Loader<T>, cacheLimit = Infinity, concurrency = 4) {
    const entries = new Map<string, Entry<T>>();
    const catalogues = new Map<object, Set<string>>();
    const queue = new Set<Entry<T>>();
    let running = 0;

    function inCatalogue(url: string): boolean {
        for (const urls of catalogues.values()) if (urls.has(url)) return true;
        return false;
    }

    function discard(entry: Entry<T>): void {
        if (entries.get(entry.url) !== entry) return;
        entries.delete(entry.url);
        queue.delete(entry);
        if (entry.state !== "done") {
            entry.controller.abort();
            entry.resolve(null);
        }
    }

    function trim(): void {
        let completed = 0;
        for (const entry of entries.values()) if (entry.state === "done") completed++;
        for (const entry of entries.values()) {
            if (completed <= cacheLimit) break;
            if (entry.state === "done" && entry.users === 0) {
                discard(entry);
                completed--;
            }
        }
    }

    function pump(): void {
        while (running < concurrency && queue.size) {
            const entry = queue.values().next().value!;
            queue.delete(entry);
            entry.state = "running";
            running++;
            void Promise.resolve()
                .then(() => entry.controller.signal.aborted ? null : load(entry.url, entry.controller.signal))
                .catch(() => null)
                .then(color => {
                    entry.state = "done";
                    entry.color = color;
                    entry.resolve(color);
                    running--;
                    trim();
                    pump();
                });
        }
    }

    function ensure(url: string): Entry<T> {
        const cached = entries.get(url);
        if (cached) return cached;
        let resolve!: Entry<T>["resolve"];
        const promise = new Promise<T | null>(done => { resolve = done; });
        const entry: Entry<T> = { url, users: 0, controller: new AbortController(), state: "queued", promise, resolve };
        entries.set(url, entry);
        queue.add(entry);
        return entry;
    }

    return {
        replaceCatalogue(owner: object, urls: Iterable<string | null>) {
            const previous = catalogues.get(owner);
            const next = new Set(Array.from(urls).filter((url): url is string => Boolean(url)));
            if (next.size) catalogues.set(owner, next);
            else catalogues.delete(owner);
            for (const entry of entries.values()) {
                if (!entry.users && !inCatalogue(entry.url)) discard(entry);
            }
            for (const url of next) if (!previous?.has(url)) ensure(url);
            pump();
        },
        acquire(url: string) {
            const entry = ensure(url);
            entry.users++;
            pump();
            let released = false;
            return {
                promise: entry.promise,
                release() {
                    if (released) return;
                    released = true;
                    entry.users--;
                    if (!entry.users && !inCatalogue(url)) discard(entry);
                    trim();
                }
            };
        },
        peek(url: string): T | null | undefined {
            return entries.get(url)?.color;
        }
    };
}
