import { useEffect, useState } from "@webpack/common";

import { getOrionSchedulerCapabilitySource } from "./orionCapabilities";
import { normalizeOrionSchedulerSnapshot, type OrionSchedulerSnapshot } from "./orionSchedulerLogic";

export type OrionSchedulerView = {
    state: "unsupported" | "available" | "invalid";
    snapshot: OrionSchedulerSnapshot | null;
};

const REBIND_INTERVAL_MS = 1000;
const EMPTY_VIEW: OrionSchedulerView = { state: "unsupported", snapshot: null };

export function useOrionSchedulerView(): OrionSchedulerView {
    const [view, setView] = useState<OrionSchedulerView>(EMPTY_VIEW);

    useEffect(() => {
        let disposed = false;
        let generation = 0;
        let identity: object | null = null;
        let getMethod: Function | null = null;
        let subscribeMethod: Function | null = null;
        let unsubscribe: (() => void) | null = null;
        let rejectedIdentity: object | null = null;
        let rejectedGetMethod: Function | null = null;
        let rejectedSubscribeMethod: Function | null = null;

        const publish = (state: OrionSchedulerView["state"], snapshot: OrionSchedulerSnapshot | null) => {
            if (!disposed) setView({ state, snapshot });
        };

        const detach = () => {
            generation++;
            const currentUnsubscribe = unsubscribe;
            unsubscribe = null;
            identity = null;
            getMethod = null;
            subscribeMethod = null;
            if (currentUnsubscribe) {
                try { currentUnsubscribe(); } catch { }
            }
        };

        const readAndPublish = (source: ReturnType<typeof getOrionSchedulerCapabilitySource>) => {
            if (!source) return;
            try {
                const snapshot = normalizeOrionSchedulerSnapshot(source.getSnapshot());
                publish(snapshot ? "available" : "invalid", snapshot);
            } catch {
                publish("invalid", null);
            }
        };

        const refresh = () => {
            if (disposed) return;
            const source = getOrionSchedulerCapabilitySource();
            if (!source) {
                if (identity || getMethod || subscribeMethod || unsubscribe) detach();
                rejectedIdentity = null;
                rejectedGetMethod = null;
                rejectedSubscribeMethod = null;
                publish("unsupported", null);
                return;
            }

            if (source.identity === identity
                && source.getMethod === getMethod
                && source.subscribeMethod === subscribeMethod
                && unsubscribe) {
                return;
            }
            if (source.identity === rejectedIdentity
                && source.getMethod === rejectedGetMethod
                && source.subscribeMethod === rejectedSubscribeMethod) {
                return;
            }

            if (identity || getMethod || subscribeMethod || unsubscribe) detach();
            const currentGeneration = ++generation;
            readAndPublish(source);

            try {
                const nextUnsubscribe = source.subscribe(() => {
                    if (disposed || currentGeneration !== generation) return;
                    readAndPublish(source);
                });
                if (!nextUnsubscribe) {
                    generation++;
                    rejectedIdentity = source.identity;
                    rejectedGetMethod = source.getMethod;
                    rejectedSubscribeMethod = source.subscribeMethod;
                    publish("invalid", null);
                    return;
                }
                identity = source.identity;
                getMethod = source.getMethod;
                subscribeMethod = source.subscribeMethod;
                unsubscribe = nextUnsubscribe;
                rejectedIdentity = null;
                rejectedGetMethod = null;
                rejectedSubscribeMethod = null;
            } catch {
                generation++;
                rejectedIdentity = source.identity;
                rejectedGetMethod = source.getMethod;
                rejectedSubscribeMethod = source.subscribeMethod;
                publish("invalid", null);
            }
        };

        refresh();
        const timer = setInterval(refresh, REBIND_INTERVAL_MS);
        return () => {
            disposed = true;
            clearInterval(timer);
            detach();
        };
    }, []);

    return view;
}
