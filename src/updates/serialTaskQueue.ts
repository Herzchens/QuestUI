/** A failure rejects its caller, not the next queued operation. */
export function createSerialTaskQueue() {
    let tail: Promise<void> = Promise.resolve();
    return function enqueue<T>(work: () => Promise<T>): Promise<T> {
        const result = tail.then(work);
        tail = result.then(() => undefined, () => undefined);
        return result;
    };
}
