import { showToast, useEffect, useRef, useState } from "@webpack/common";

import { recordQuestUIEvent } from "../../eventLog/runtime";
import { useEffectiveReducedMotion } from "../../graphics/runtime";
import { pushDashboardNotice } from "../../dashboard/notifications";
import { markQuestReloadSuccessful } from "./auto";
import { reloadQuestList } from "./native";
import { shouldFinishReloadSpin } from "./logic";
import { captureAccountSession, isCurrentAccountSession } from "../../plugin/accountSession";

const ROTATION_EVENT_RECOVERY_MS = 5_000;

function ReloadIcon({ onIteration }: { onIteration: () => void; }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" onAnimationIteration={onIteration}>
            <path d="M19.4 7.35A8.5 8.5 0 1 0 20.5 14h-2.05A6.5 6.5 0 1 1 17.9 8.8L15 11.7h6.5V5.2l-2.1 2.15Z" />
        </svg>
    );
}

function ReloadSuccessIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9.2 16.4-4.4-4.4 1.5-1.5 2.9 2.9 8.5-8.5 1.5 1.5Z" />
        </svg>
    );
}

export function QuestReloadControl() {
    const reduced = useEffectiveReducedMotion();
    const reducedRef = useRef(reduced);
    reducedRef.current = reduced;
    const [pending, setPending] = useState(false);
    const [succeeded, setSucceeded] = useState(false);
    const pendingRef = useRef(false);
    const requestSettledRef = useRef(false);
    const completedRotationsRef = useRef(0);
    const finishBoundaryRef = useRef<(() => void) | null>(null);
    const successResetTimerRef = useRef<number | null>(null);
    const rotationRecoveryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (successResetTimerRef.current != null) {
                window.clearTimeout(successResetTimerRef.current);
                successResetTimerRef.current = null;
            }
            finishRotation();
        };
    }, []);

    useEffect(() => {
        if (reduced && requestSettledRef.current) finishRotation();
    }, [reduced]);

    function finishRotation(): void {
        if (rotationRecoveryRef.current != null) clearTimeout(rotationRecoveryRef.current);
        rotationRecoveryRef.current = null;
        const resolve = finishBoundaryRef.current;
        finishBoundaryRef.current = null;
        resolve?.();
    }

    function armRotationRecovery(): void {
        if (rotationRecoveryRef.current != null) clearTimeout(rotationRecoveryRef.current);
        if (!finishBoundaryRef.current || !requestSettledRef.current) return;
        // Normal motion completes at animationiteration. Only recover when events
        // stop arriving entirely (e.g. a removed style or suspended animation).
        rotationRecoveryRef.current = setTimeout(finishRotation, ROTATION_EVENT_RECOVERY_MS);
    }

    const onIteration = () => {
        if (!pendingRef.current) return;
        completedRotationsRef.current += 1;

        if (shouldFinishReloadSpin(completedRotationsRef.current, requestSettledRef.current)) finishRotation();
        else if (requestSettledRef.current) armRotationRecovery();
    };

    const run = async () => {
        const session = captureAccountSession();
        if (pendingRef.current || !mountedRef.current || !session) return;

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
            await markQuestReloadSuccessful(Date.now(), session);
        } catch (error) {
            failure = error;
        } finally {
            requestSettledRef.current = true;
            if (reducedRef.current) finishRotation();
            else armRotationRecovery();
        }

        // Full motion finishes at animationiteration; reduced motion does not wait. If the request settles halfway through a later
        // rotation, the spinner completes that full rotation instead of snapping back to 0deg.
        await finalRotationBoundary;

        if (!mountedRef.current || !isCurrentAccountSession(session)) {
            pendingRef.current = false;
            if (mountedRef.current) setPending(false);
            return;
        }

        try {
            if (failure) {
                void recordQuestUIEvent({
                    severity: "error",
                    eventCode: "QUEST_RELOAD_FAILED",
                    summary: "Quest list refresh failed",
                    accountId: session.accountId,
                    detail: { message: failure instanceof Error ? failure.message : String(failure), stack: failure instanceof Error ? failure.stack ?? null : null }
                });
                showToast({
                    text: failure instanceof Error ? failure.message : "Failed to refresh the Quest list.",
                    variant: "critical",
                    duration: 6000
                });
            } else {
                void recordQuestUIEvent({ severity: "success", eventCode: "QUEST_RELOAD_SUCCEEDED", summary: "Quest list refreshed", accountId: session.accountId });
                setSucceeded(true);
                pushDashboardNotice({
                    tone: "success",
                    text: "Quest list refreshed",
                    duration: 2100
                });
                if (successResetTimerRef.current != null) {
                    window.clearTimeout(successResetTimerRef.current);
                }
                successResetTimerRef.current = window.setTimeout(() => {
                    successResetTimerRef.current = null;
                    if (mountedRef.current) setSucceeded(false);
                }, 1200);
            }
        } finally {
            pendingRef.current = false;
            setPending(false);
        }
    };

    return (
        <button
            type="button"
            className={`quest-ui-filter-button quest-ui-reload-icon-button${pending ? " is-spinning" : ""}${succeeded ? " is-success" : ""}`}
            disabled={pending}
            aria-busy={pending}
            aria-label={succeeded ? "Quest list refreshed" : "Refresh Quest list"}
            title={succeeded ? "Quest list refreshed" : "Refresh Quest list"}
            onClick={() => void run()}
        >
            {succeeded ? <ReloadSuccessIcon /> : <ReloadIcon onIteration={onIteration} />}
        </button>
    );
}
