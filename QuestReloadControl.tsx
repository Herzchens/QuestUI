import { showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";

import { reloadQuestList } from "./questReload";
import { shouldFinishReloadSpin } from "./questReloadLogic";

import "./reload.css";

function ReloadIcon({ onIteration }: { onIteration: () => void; }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" onAnimationIteration={onIteration}>
            <path d="M19.4 7.35A8.5 8.5 0 1 0 20.5 14h-2.05A6.5 6.5 0 1 1 17.9 8.8L15 11.7h6.5V5.2l-2.1 2.15Z" />
        </svg>
    );
}

export function QuestReloadControl() {
    const [pending, setPending] = useState(false);
    const pendingRef = useRef(false);
    const requestSettledRef = useRef(false);
    const completedRotationsRef = useRef(0);
    const finishBoundaryRef = useRef<(() => void) | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            const resolve = finishBoundaryRef.current;
            finishBoundaryRef.current = null;
            resolve?.();
        };
    }, []);

    const onIteration = () => {
        if (!pendingRef.current) return;
        completedRotationsRef.current += 1;

        if (!shouldFinishReloadSpin(completedRotationsRef.current, requestSettledRef.current)) return;
        const resolve = finishBoundaryRef.current;
        finishBoundaryRef.current = null;
        resolve?.();
    };

    const run = async () => {
        if (pendingRef.current) return;

        pendingRef.current = true;
        requestSettledRef.current = false;
        completedRotationsRef.current = 0;
        setPending(true);

        const finalRotationBoundary = new Promise<void>(resolve => {
            finishBoundaryRef.current = resolve;
        });

        let failure: unknown = null;
        try {
            await reloadQuestList();
        } catch (error) {
            failure = error;
        } finally {
            requestSettledRef.current = true;
        }

        // Finish only from animationiteration. If the request settles halfway through a later
        // rotation, the spinner completes that full rotation instead of snapping back to 0deg.
        await finalRotationBoundary;

        if (!mountedRef.current) {
            pendingRef.current = false;
            return;
        }

        try {
            if (failure) {
                showToast(
                    failure instanceof Error ? failure.message : "Failed to refresh the Quest list.",
                    Toasts.Type.FAILURE,
                    { duration: 6000 }
                );
            } else {
                showToast("Quest list refreshed.", Toasts.Type.SUCCESS);
            }
        } finally {
            pendingRef.current = false;
            setPending(false);
        }
    };

    return (
        <button
            type="button"
            className={`quest-ui-filter-button quest-ui-reload-icon-button${pending ? " is-spinning" : ""}`}
            disabled={pending}
            aria-busy={pending}
            aria-label="Refresh Quest list"
            title="Refresh Quest list"
            onClick={() => void run()}
        >
            <ReloadIcon onIteration={onIteration} />
        </button>
    );
}
