/** Bounded, cancellable, shared artwork jobs. No DOM dependency. */
type Entry = {
    url: string;
    users: number;
    started: boolean;
    controller: AbortController;
    promise: Promise<string | null>;
    resolve: (value: string | null) => void;
};

export function createArtworkQueue(
    load: (url: string, signal: AbortSignal) => Promise<string | null>,
    concurrency = 4,
    capacity = 128,
    now = Date.now
) {
    if (!Number.isInteger(concurrency) || concurrency < 1 ||
        !Number.isInteger(capacity) || capacity < 1) throw new RangeError("Invalid artwork queue capacity");
    const cached = new Map<string, { value: string | null; expires: number; }>();
    const jobs = new Map<string, Entry>();
    const waiting: Entry[] = [];
    let running = 0;

    function peek(url: string): string | null | undefined {
        const hit = cached.get(url);
        if (!hit) return undefined;
        if (hit.expires <= now()) {
            cached.delete(url);
            return undefined;
        }
        return hit.value;
    }

    function store(url: string, value: string | null) {
        cached.delete(url);
        cached.set(url, { value, expires: value === null ? now() + 30_000 : Infinity });
        while (cached.size > capacity) {
            const oldest = cached.keys().next();
            if (!oldest.done) cached.delete(oldest.value);
        }
    }

    function pump() {
        while (running < concurrency && waiting.length) {
            const job = waiting.shift()!;
            if (!job.users || job.controller.signal.aborted) continue;
            running++;
            job.started = true;
            void Promise.resolve().then(() => {
                if (job.controller.signal.aborted) return null;
                return load(job.url, job.controller.signal);
            }).catch(() => null).then(value => {
                if (!job.controller.signal.aborted && jobs.get(job.url) === job) store(job.url, value);
                job.resolve(job.controller.signal.aborted ? null : value);
            }).finally(() => {
                if (jobs.get(job.url) === job) jobs.delete(job.url);
                running--;
                pump();
            });
        }
    }

    function acquire(url: string) {
        const hit = peek(url);
        if (hit !== undefined) return { promise: Promise.resolve(hit), release() {} };
        let entry = jobs.get(url);
        if (!entry) {
            // Bound queued work as well as retained raster data.
            if (jobs.size >= capacity) return { promise: Promise.resolve(null), release() {} };
            let resolve!: (value: string | null) => void;
            const promise = new Promise<string | null>(done => { resolve = done; });
            entry = { url, users: 0, started: false, controller: new AbortController(), promise, resolve };
            jobs.set(url, entry);
            waiting.push(entry);
        }
        const job = entry;
        job.users++;
        pump();
        let released = false;
        return {
            promise: job.promise,
            release() {
                if (released) return;
                released = true;
                if (--job.users !== 0 || jobs.get(url) !== job) return;
                jobs.delete(url);
                job.controller.abort();
                if (!job.started) {
                    const index = waiting.indexOf(job);
                    if (index !== -1) waiting.splice(index, 1);
                }
                job.resolve(null);
            }
        };
    }

    return { acquire, peek };
}
