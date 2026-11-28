/** Reads submitted between two mutations share one ordered snapshot.
 * A later mutation closes the batch immediately, even before it executes. */
export function createOrderedReadBatch<T>(enqueue: (read: () => Promise<T>) => Promise<T>, read: () => Promise<T>) {
    let current: Promise<T> | null = null;
    return {
        peek: () => current,
        invalidate() { current = null; },
        read(): Promise<T> {
            if (current) return current;
            const result = enqueue(read);
            current = result;
            const release = () => { if (current === result) current = null; };
            void result.then(release, release);
            return result;
        }
    };
}
