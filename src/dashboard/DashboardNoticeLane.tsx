import { useEffect, useRef, useState } from "@webpack/common";

import {
    getDashboardNotice,
    subscribeDashboardNotice,
    type DashboardNotice
} from "./notifications";

type NoticePhase = "hidden" | "mounted" | "visible" | "exiting";

export function DashboardNoticeLane() {
    const initialNotice = getDashboardNotice();
    const [notice, setNotice] = useState<DashboardNotice | null>(initialNotice);
    const [phase, setPhase] = useState<NoticePhase>(initialNotice ? "visible" : "hidden");
    const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const noticeRef = useRef<DashboardNotice | null>(initialNotice);

    useEffect(() => {
        const clearPhaseTimer = () => {
            if (phaseTimerRef.current != null) {
                clearTimeout(phaseTimerRef.current);
                phaseTimerRef.current = null;
            }
        };

        const unsubscribe = subscribeDashboardNotice(() => {
            clearPhaseTimer();
            const next = getDashboardNotice();

            if (next) {
                noticeRef.current = next;
                setNotice(next);
                setPhase("mounted");

                // Commit the collapsed bell island first, then grow only its right edge.
                // This keeps the vector child and bell icon on the exact resting center.
                phaseTimerRef.current = setTimeout(() => {
                    phaseTimerRef.current = null;
                    if (noticeRef.current?.id === next.id) setPhase("visible");
                }, 24);
                return;
            }

            if (!noticeRef.current) {
                setPhase("hidden");
                return;
            }

            setPhase("exiting");
            phaseTimerRef.current = setTimeout(() => {
                phaseTimerRef.current = null;
                noticeRef.current = null;
                setNotice(null);
                setPhase("hidden");
            }, 360);
        });

        return () => {
            clearPhaseTimer();
            unsubscribe();
        };
    }, []);

    const shown = notice != null && phase !== "hidden";
    const displayText = notice?.text ?? "Notification Center";

    return (
        <div
            className={`quest-ui-dashboard-notification-island${shown ? ` is-${phase} is-${notice.tone}` : " is-idle"}`}
            aria-label={shown ? undefined : "Notification Center"}
            aria-live="polite"
            aria-atomic="true"
        >
            <span className="quest-ui-dashboard-notification-bell" aria-hidden="true">
                <svg className="quest-ui-dashboard-notification-surface" aria-hidden="true">
                    <rect className="quest-ui-dashboard-notification-surface-rect" />
                </svg>
                <svg className="quest-ui-dashboard-notification-icon" viewBox="0 0 24 24">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                    <path d="M10 21h4" />
                </svg>
            </span>
            <span className="quest-ui-dashboard-notification-measure" aria-hidden="true">
                {displayText}
            </span>
            <span className="quest-ui-dashboard-notification-copy">
                <span className="quest-ui-dashboard-notification-text">{displayText}</span>
            </span>
        </div>
    );
}
