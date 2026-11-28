import { Popout, useEffect, useRef, useState } from "@webpack/common";

import { useEffectiveReducedMotion } from "../graphics/runtime";
import { NotificationCenterPanel, useNotificationCenterFeed } from "../notifications/NotificationCenter";

import {
    getDashboardNotice,
    subscribeDashboardNotice,
    type DashboardNotice
} from "./notifications";

type NoticePhase = "hidden" | "mounted" | "visible" | "exiting";

export function DashboardNoticeLane() {
    const reduced = useEffectiveReducedMotion();
    const reducedRef = useRef(reduced);
    reducedRef.current = reduced;
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const feed = useNotificationCenterFeed();
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
                if (reducedRef.current) { setPhase("visible"); return; }
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

            if (reducedRef.current) {
                noticeRef.current = null;
                setNotice(null);
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

    useEffect(() => {
        if (!reduced || (phase !== "mounted" && phase !== "exiting")) return;
        if (phaseTimerRef.current != null) { clearTimeout(phaseTimerRef.current); phaseTimerRef.current = null; }
        if (phase === "mounted") setPhase("visible");
        else { noticeRef.current = null; setNotice(null); setPhase("hidden"); }
    }, [reduced, phase]);

    const shown = notice != null && phase !== "hidden";
    const displayText = notice?.text ?? "Notification Center";
    const showUnread = !shown && feed.unreadCount > 0;
    const accessibilityLabel = shown
        ? `${displayText}. Open Notification Center.`
        : feed.unreadCount > 0
            ? `Notification Center, ${feed.unreadCount} unread`
            : "Notification Center";

    return (
        <Popout
            position="bottom"
            align="right"
            animation={Popout.Animation.NONE}
            shouldShow={open}
            onRequestClose={() => setOpen(false)}
            targetElementRef={buttonRef}
            renderPopout={() => <NotificationCenterPanel feed={feed} />}
        >
            {(_, { isShown }) => (
                <>
                    <button
                        ref={buttonRef}
                        type="button"
                        className={`quest-ui-dashboard-notification-island${shown ? ` is-${phase} is-${notice.tone}` : " is-idle"}${isShown ? " is-open" : ""}`}
                        onClick={() => setOpen(value => !value)}
                        aria-label={accessibilityLabel}
                        aria-expanded={isShown}
                        aria-haspopup="dialog"
                    >
                        <span className="quest-ui-dashboard-notification-bell" aria-hidden="true">
                            <svg className="quest-ui-dashboard-notification-surface" aria-hidden="true">
                                <rect className="quest-ui-dashboard-notification-surface-rect" rx="17" ry="17" />
                            </svg>
                            <svg className="quest-ui-dashboard-notification-icon" viewBox="0 0 24 24">
                                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                                <path d="M10 21h4" />
                            </svg>
                        </span>
                        <span className="quest-ui-dashboard-notification-measure" aria-hidden="true">
                            <span>{displayText}</span>
                            {showUnread && <span className="quest-ui-dashboard-notification-unread-chip">{feed.unreadCount} unread</span>}
                        </span>
                        <span className="quest-ui-dashboard-notification-copy" aria-live="polite" aria-atomic="true">
                            <span className="quest-ui-dashboard-notification-text">{displayText}</span>
                            {showUnread && <span className="quest-ui-dashboard-notification-unread-chip">{feed.unreadCount} unread</span>}
                        </span>
                        {showUnread && <span className="quest-ui-dashboard-notification-unread-dot" aria-hidden="true" />}
                    </button>
                </>
            )}
        </Popout>
    );
}
