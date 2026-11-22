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

                // Give the collapsed node one committed frame before expanding it.
                // A short timer is more stable in Discord's React surface than swapping
                // animation classes at the exact keyframe boundary.
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

    return (
        <div className="quest-ui-dashboard-notice-slot">
            <div
                className={`quest-ui-dashboard-notice-lane${shown ? ` is-${phase} is-${notice.tone}` : ""}`}
                aria-live="polite"
                aria-atomic="true"
            >
                {notice && <span className="quest-ui-dashboard-notice-text">{notice.text}</span>}
            </div>
        </div>
    );
}
