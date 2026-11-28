export interface ControlSource {
    identity: object;
    methods: readonly unknown[];
    subscribe(listener: () => void): (() => void) | null;
}

/** Failed acquisitions are retryable; failed releases remain owned until successful. */
export function createControlSubscription(readSource: () => ControlSource | null, intervalMs = 1000) {
    const listeners = new Set<() => void>();
    let enabled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let binding: { source: ControlSource; release: (() => void) | null; active: boolean; } | null = null;
    let reconciling = false;
    let generation = 0;
    function same(a: ControlSource | null, b: ControlSource | null): boolean {
        return a === b || Boolean(a && b && a.identity === b.identity
            && a.methods.length === b.methods.length && a.methods.every((method, i) => method === b.methods[i]));
    }
    function notify() {
        for (const listener of Array.from(listeners)) {
            if (!enabled) break;
            if (listeners.has(listener)) try { listener(); } catch { }
        }
    }
    function detach() {
        const old = binding;
        if (!old) return;
        old.active = false;
        if (old.release) old.release();
        if (binding === old) binding = null;
    }
    function reconcile() {
        if (!enabled || !listeners.size || reconciling) return;
        reconciling = true;
        try {
            let next: ControlSource | null = null;
            try { next = readSource(); } catch { }
            if (binding?.active && same(binding.source, next)) return;
            if (!binding && !next) return;
            try { detach(); } catch { return; }
            if (next) {
                const owner = { source: next, release: null as (() => void) | null, active: false };
                const epoch = generation;
                binding = owner;
                try {
                    owner.release = next.subscribe(() => {
                        if (!enabled || !owner.active || binding !== owner) return;
                        try { if (!same(owner.source, readSource())) return; } catch { return; }
                        notify();
                    });
                } catch { }
                if (!owner.release) {
                    if (binding === owner) binding = null;
                } else if (!enabled || !listeners.size || epoch !== generation || binding !== owner) {
                    // A synchronous host callback may have stopped us while acquiring.
                    binding = owner;
                    try { detach(); } catch { }
                } else owner.active = true;
            }
            notify();
        } finally { reconciling = false; }
    }
    function activate() {
        if (!enabled || !listeners.size || timer !== undefined) return;
        timer = setInterval(reconcile, intervalMs);
        reconcile();
    }
    function deactivate() {
        generation++;
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
        detach();
    }
    return {
        start() { enabled = true; activate(); },
        stop() { enabled = false; deactivate(); },
        subscribe(listener: () => void) {
            listeners.add(listener);
            activate();
            return () => {
                listeners.delete(listener);
                if (!listeners.size) {
                    try { deactivate(); } catch { /* retained for next reconciliation or stop */ }
                }
            };
        },
        reconcile
    };
}
