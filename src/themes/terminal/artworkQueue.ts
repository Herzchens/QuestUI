/** Bounded, cancellable, shared artwork jobs. No DOM dependency. */
type Entry<T> = {
    url: string;
    users: number;
    started: boolean;
    controller: AbortController;
    promise: Promise<T | null>;
    resolve: (value: T | null) => void;
};

export const ARTWORK_CACHE_BYTES = {
    pixel: 8 * 1024 * 1024,
    panorama: 16 * 1024 * 1024,
    inactivePanorama: 2 * 1024 * 1024
} as const;

// Conservative accounting of JS strings (UTF-16); not a measurement of GPU/decoded images.
export function artworkStringBytes(value: string): number { return value.length * 2; }

export function createArtworkQueue<T = string>(
    load: (url: string, signal: AbortSignal) => Promise<T | null>,
    concurrency = 4,
    capacity = 128,
    now = Date.now,
    maxBytes = ARTWORK_CACHE_BYTES.pixel as number,
    valueBytes: (value: T) => number = value => typeof value === "string" ? artworkStringBytes(value) : 0
) {
    if (!Number.isInteger(concurrency) || concurrency < 1 ||
        !Number.isInteger(capacity) || capacity < 1 ||
        !Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError("Invalid artwork queue capacity");
    const cached = new Map<string, { value: T | null; expires: number; bytes: number; }>();
    const jobs = new Map<string, Entry<T>>();
    const waiting: Entry<T>[] = [];
    let running = 0, retainedBytes = 0, budget = maxBytes;
    let enabled = true;

    function remove(url: string) {
        const hit = cached.get(url);
        if (!hit) return;
        cached.delete(url);
        retainedBytes -= hit.bytes;
    }

    function peek(url: string): T | null | undefined {
        const hit = cached.get(url);
        if (!hit) return undefined;
        if (hit.expires <= now()) { remove(url); return undefined; }
        // LRU, not FIFO: frequently visible artwork survives scrolling.
        cached.delete(url);
        cached.set(url, hit);
        return hit.value;
    }

    function trim() {
        for (const [key, entry] of cached) if (entry.expires <= now()) remove(key);
        while (cached.size > capacity || retainedBytes > budget) {
            const oldest = cached.keys().next();
            if (oldest.done) break;
            remove(oldest.value);
        }
    }

    function store(url: string, value: T | null) {
        remove(url);
        const bytes = artworkStringBytes(url) + (value === null ? 0 : valueBytes(value));
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > budget || budget === 0) return;
        cached.set(url, { value, expires: value === null ? now() + 30_000 : Infinity, bytes });
        retainedBytes += bytes;
        trim();
    }

    function pump() {
        while (enabled && running < concurrency && waiting.length) {
            const job = waiting.shift()!;
            if (!job.users || job.controller.signal.aborted) continue;
            running++;
            job.started = true;
            void Promise.resolve().then(() => {
                if (job.controller.signal.aborted) return null;
                return load(job.url, job.controller.signal);
            }).catch(() => null).then(value => {
                if (!job.controller.signal.aborted && jobs.get(job.url) === job) {
                    store(job.url, value);
                    jobs.delete(job.url);
                    job.resolve(value);
                } else job.resolve(null);
            }).finally(() => {
                if (jobs.get(job.url) === job) jobs.delete(job.url);
                running--;
                pump();
            });
        }
    }

    function acquire(url: string) {
        if (!enabled) return { promise: Promise.resolve(null), release() {} };
        const hit = peek(url);
        if (hit !== undefined) return { promise: Promise.resolve(hit), release() {} };
        let entry = jobs.get(url);
        if (!entry) {
            if (jobs.size >= capacity) return { promise: Promise.resolve(null), release() {} };
            let resolve!: (value: T | null) => void;
            const promise = new Promise<T | null>(done => { resolve = done; });
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

    function stop() {
        enabled = false;
        const old = [...jobs.values()];
        jobs.clear();
        waiting.length = 0;
        cached.clear();
        retainedBytes = 0;
        for (const job of old) { job.controller.abort(); job.resolve(null); }
        // Do not zero running: canceled loaders still own their worker until settled.
    }

    return { acquire, peek, stop, start() { enabled = true; pump(); },
        setCacheBudget(bytes: number) {
            if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError("Invalid artwork cache budget");
            budget = Math.min(bytes, maxBytes);
            trim();
        },
        stats() { return { cached: cached.size, retainedBytes, budget, running, queued: waiting.length, jobs: jobs.size }; }
    };
}
