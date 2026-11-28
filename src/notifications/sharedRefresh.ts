/** Share one in-flight read across all views. A newer refresh is not a new owner. */
export function createSharedRefresh<K extends object, V>(read: (key: K, hasConsumers: () => boolean) => Promise<V>, isCurrent: (key: K) => boolean) {
    type Consumer = (value: V) => void;
    const consumers = new Map<K, Set<Consumer>>();
    let running = false;
    let pending: K | null = null;

    async function drain(): Promise<void> {
        if (running) return;
        running = true;
        try {
            while (pending) {
                const key = pending;
                pending = null;
                if (!consumers.has(key) || !isCurrent(key)) continue;
                try {
                    const value = await read(key, () => consumers.has(key) && isCurrent(key));
                    if (!isCurrent(key)) continue;
                    for (const consumer of [...(consumers.get(key) ?? [])]) {
                        if (!isCurrent(key) || !consumers.get(key)?.has(consumer)) continue;
                        try { consumer(value); } catch { }
                    }
                } catch { /* A failed read does not discard the last good snapshot. */ }
            }
        } finally { running = false; }
    }

    function request(key: K): void {
        if (!consumers.has(key) || !isCurrent(key)) return;
        pending = key;
        void drain();
    }

    return {
        subscribe(key: K, consumer: Consumer) {
            let group = consumers.get(key);
            if (!group) consumers.set(key, group = new Set());
            group.add(consumer);
            request(key);
            return () => {
                group.delete(consumer);
                if (!group.size && consumers.get(key) === group) {
                    consumers.delete(key);
                    if (pending === key) pending = null;
                }
            };
        },
        request
    };
}
