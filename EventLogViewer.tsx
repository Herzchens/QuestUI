import { Popout, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";

import { clearEventLog, getEventLogInfo, openEventLogFolder, queryEventLog, subscribeEventLog } from "./eventLog";
import type { EventLogEvent, EventLogSeverity, EventLogSort, EventLogSource } from "./eventLogTypes";

import "./eventLog.css";

function BugLogIcon() {
    return (
        <svg className="quest-ui-event-log-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7.2V5.8a3 3 0 0 1 6 0v1.4" />
            <rect x="6.8" y="7.2" width="10.4" height="12.2" rx="4.2" />
            <path d="M3.7 9.4h3.1M17.2 9.4h3.1M3.2 13.1h3.6M17.2 13.1h3.6M4 17h3.4M16.6 17H20M12 7.2v12.2" />
        </svg>
    );
}

function dayLabel(timestamp: number): string {
    const date = new Date(timestamp);
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((startToday - startDate) / 86_400_000);
    if (days === 0) return `Today · ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
    if (days === 1) return `Yesterday · ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function dayKey(timestamp: number): string {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function timeLabel(timestamp: number): string {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(timestamp);
}

function sourceLabel(source: EventLogSource): string {
    return source === "orion" ? "ORION" : "QUESTUI";
}

function severityGlyph(severity: EventLogSeverity): string {
    if (severity === "error") return "×";
    if (severity === "warning") return "!";
    if (severity === "success") return "✓";
    return "i";
}

function EventDetail({ event, onBack }: { event: EventLogEvent; onBack: () => void; }) {
    return (
        <div className="quest-ui-event-detail">
            <div className="quest-ui-event-detail-header">
                <button type="button" onClick={onBack}>← Back</button>
                <span className={`quest-ui-event-level is-${event.severity}`}>{severityGlyph(event.severity)} {sourceLabel(event.source)}</span>
            </div>
            <h3>{event.summary}</h3>
            <div className="quest-ui-event-detail-grid">
                <span>Event code</span><code>{event.eventCode}</code>
                <span>Time</span><strong>{new Date(event.timestamp).toLocaleString()}</strong>
                <span>Capture</span><strong>{event.captureSource}</strong>
                {event.quest?.name && <><span>Quest</span><strong>{event.quest.name}</strong></>}
                {event.quest?.id && <><span>Quest ID</span><code>{event.quest.id}</code></>}
                {event.quest?.taskType && <><span>Task type</span><code>{event.quest.taskType}</code></>}
                {event.detail?.httpStatus != null && <><span>HTTP</span><code>{String(event.detail.httpStatus)}</code></>}
                {event.detail?.upstreamCode != null && <><span>Upstream code</span><code>{String(event.detail.upstreamCode)}</code></>}
            </div>
            {event.detail?.reason && <section><span className="quest-ui-event-detail-label">Reason</span><p>{String(event.detail.reason)}</p></section>}
            {event.detail?.message && <section><span className="quest-ui-event-detail-label">Message</span><p>{String(event.detail.message)}</p></section>}
            {event.detail?.rawConsole && <section><span className="quest-ui-event-detail-label">Captured console detail</span><pre>{String(event.detail.rawConsole)}</pre></section>}
            {event.detail?.stack && <section><span className="quest-ui-event-detail-label">Stack</span><pre>{String(event.detail.stack)}</pre></section>}
        </div>
    );
}

function Choice<T extends string>({ value, active, children, onClick }: { value: T; active: boolean; children: any; onClick: (value: T) => void; }) {
    return <button type="button" className={active ? "is-selected" : ""} onClick={() => onClick(value)}>{children}</button>;
}

function EventLogPanel() {
    const [events, setEvents] = useState<EventLogEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [query, setQuery] = useState("");
    const [source, setSource] = useState<"all" | EventLogSource>("all");
    const [severity, setSeverity] = useState<"all" | EventLogSeverity>("all");
    const [sort, setSort] = useState<EventLogSort>("newest");
    const [limit, setLimit] = useState(200);
    const [selected, setSelected] = useState<EventLogEvent | null>(null);
    const [clearArmed, setClearArmed] = useState(false);
    const [info, setInfo] = useState<{ path: string; size: number; }>({ path: "", size: 0 });

    const load = async () => {
        const result = await queryEventLog({ query, source, severity, sort, limit });
        setEvents(result.events);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setInfo(await getEventLogInfo());
    };

    useEffect(() => {
        const timer = setTimeout(() => void load(), 120);
        return () => clearTimeout(timer);
    }, [query, source, severity, sort, limit]);

    useEffect(() => subscribeEventLog(() => void load()), [query, source, severity, sort, limit]);

    useEffect(() => {
        if (!clearArmed) return;
        const timer = setTimeout(() => setClearArmed(false), 4000);
        return () => clearTimeout(timer);
    }, [clearArmed]);

    if (selected) return <EventDetail event={selected} onBack={() => setSelected(null)} />;

    let previousDay = "";
    return (
        <div className="quest-ui-event-log-panel" role="dialog" aria-label="QuestUI Event Log preview">
            <div className="quest-ui-event-log-header">
                <div><strong>Event Log</strong><span className="quest-ui-event-preview-chip">PREVIEW</span></div>
                <span>{total} matching · {(info.size / 1024).toFixed(info.size >= 1024 * 1024 ? 0 : 1)} KB</span>
            </div>

            <input className="quest-ui-event-search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search quest, event code, HTTP status…" />

            <div className="quest-ui-event-filter-row">
                <span>Source</span>
                <div><Choice value="all" active={source === "all"} onClick={setSource}>All</Choice><Choice value="orion" active={source === "orion"} onClick={setSource}>Orion</Choice><Choice value="questui" active={source === "questui"} onClick={setSource}>QuestUI</Choice></div>
            </div>
            <div className="quest-ui-event-filter-row">
                <span>Level</span>
                <div><Choice value="all" active={severity === "all"} onClick={setSeverity}>All</Choice><Choice value="error" active={severity === "error"} onClick={setSeverity}>Error</Choice><Choice value="warning" active={severity === "warning"} onClick={setSeverity}>Warning</Choice><Choice value="success" active={severity === "success"} onClick={setSeverity}>Success</Choice><Choice value="info" active={severity === "info"} onClick={setSeverity}>Info</Choice></div>
            </div>

            <div className="quest-ui-event-log-actions">
                <label>Sort <select value={sort} onChange={event => setSort(event.currentTarget.value as EventLogSort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="severity">Errors first</option></select></label>
                <div>
                    <button type="button" onClick={() => void openEventLogFolder()}>Open file</button>
                    <button type="button" className={clearArmed ? "is-danger" : ""} onClick={() => {
                        if (!clearArmed) { setClearArmed(true); return; }
                        void clearEventLog().then(() => {
                            setClearArmed(false);
                            showToast("QuestUI Event Log cleared.", Toasts.Type.SUCCESS);
                        });
                    }}>{clearArmed ? "Confirm clear" : "Clear log"}</button>
                </div>
            </div>

            <div className="quest-ui-event-list">
                {events.length === 0 && <div className="quest-ui-event-empty">No matching Orion or QuestUI events yet.</div>}
                {events.map(event => {
                    const key = dayKey(event.timestamp);
                    const showDay = key !== previousDay;
                    previousDay = key;
                    return (
                        <div key={event.id}>
                            {showDay && <div className="quest-ui-event-day"><span>{dayLabel(event.timestamp)}</span></div>}
                            <article className={`quest-ui-event-row is-${event.severity}`}>
                                <span className="quest-ui-event-time">{timeLabel(event.timestamp)}</span>
                                <span className="quest-ui-event-severity" aria-hidden="true">{severityGlyph(event.severity)}</span>
                                <div className="quest-ui-event-copy">
                                    <div><span className={`quest-ui-event-source is-${event.source}`}>{sourceLabel(event.source)}</span>{event.quest?.name && <strong>{event.quest.name}</strong>}</div>
                                    <span>{event.summary}</span>
                                </div>
                                <button type="button" className="quest-ui-event-view-detail" onClick={() => setSelected(event)}>View details</button>
                            </article>
                        </div>
                    );
                })}
            </div>

            {hasMore && <button type="button" className="quest-ui-event-load-more" onClick={() => setLimit(value => Math.min(5000, value + 200))}>Load older events</button>}
        </div>
    );
}

export function EventLogButton() {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);

    return (
        <Popout
            position="bottom"
            align="right"
            animation={Popout.Animation.NONE}
            shouldShow={open}
            onRequestClose={() => setOpen(false)}
            targetElementRef={buttonRef}
            renderPopout={() => <EventLogPanel />}
        >
            {(_, { isShown }) => (
                <button
                    ref={buttonRef}
                    type="button"
                    className={`quest-ui-toolbar-button quest-ui-event-log-button${isShown ? " is-open" : ""}`}
                    onClick={() => setOpen(value => !value)}
                    aria-label="Open QuestUI Event Log preview"
                    aria-expanded={isShown}
                    title="Event Log (Preview)"
                >
                    <BugLogIcon />
                </button>
            )}
        </Popout>
    );
}
