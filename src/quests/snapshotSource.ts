type Store = {
    addChangeListener(listener: () => void): void;
    removeChangeListener(listener: () => void): void;
};

/** Start/stop is independent of React mounting, including surviving patched surfaces. */
export function createSnapshotSource<T>(read: () => T, getStore: () => Store | null | undefined, intervalMs: number) {
    type Listener = (value: T, force: boolean) => void;
    const listeners = new Set<Listener>();
    let enabled = false;
    let generation = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let binding: { store: Store; callback: () => void; active: boolean; } | null = null;

    function detach() {
        const old = binding;
        if (!old) return;
        old.active = false;
        old.store.removeChangeListener(old.callback);
        if (binding === old) binding = null;
    }

    function deactivate() {
        generation++;
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
        detach();
    }

    function activate() {
        if (!enabled || !listeners.size || timer !== undefined) return;
        const owner = ++generation;
        function refresh(force: boolean) {
            if (!enabled || generation !== owner || !listeners.size) return;
            const nextStore = getStore();
            if (!binding?.active || nextStore !== binding.store) {
                try { detach(); } catch { /* retry on the next poll */ }
                if (!binding && nextStore && typeof nextStore.addChangeListener === "function") {
                    const entry = { store: nextStore, callback: () => {
                        if (entry.active && binding === entry && getStore() === nextStore) refresh(false);
                    }, active: false };
                    binding = entry;
                    try {
                        nextStore.addChangeListener(entry.callback);
                        if (enabled && generation === owner && binding === entry) entry.active = true;
                        else {
                            binding = entry;
                            detach();
                        }
                    } catch {
                        try { detach(); } catch { /* preserve the release record */ }
                    }
                }
            }
            if (!enabled || generation !== owner) return;
            const value = read();
            for (const listener of Array.from(listeners)) {
                if (!enabled || generation !== owner) break;
                if (!listeners.has(listener)) continue;
                try { listener(value, force); } catch { }
            }
        }
        timer = setInterval(() => refresh(true), intervalMs);
        refresh(true);
    }

    return {
        start() { enabled = true; activate(); },
        stop() { enabled = false; deactivate(); },
        subscribe(listener: Listener) {
            listeners.add(listener);
            if (timer === undefined) activate();
            else if (enabled) listener(read(), true);
            return () => {
                listeners.delete(listener);
                if (!listeners.size) {
                    try { deactivate(); } catch { /* retained for explicit stop or restart */ }
                }
            };
        }
    };
}
