import { Popout, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";

import { buildDiagnosticReport } from "./diagnosticReport";
import { clearEventLog, getEventLogInfo, openEventLogFolder, queryEventLog, subscribeEventLog } from "./eventLog";
import { inferEventCategory } from "./eventLogLogic";
import type { EventLogCategory, EventLogEvent, EventLogSeverity, EventLogSort, EventLogSource } from "./eventLogTypes";

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

function FlaskIcon() {
    return (
        <svg className="quest-ui-event-preview-icon" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 2.8h6M8.2 2.8v4.1l-4.4 7.3A1.7 1.7 0 0 0 5.25 16.8h9.5a1.7 1.7 0 0 0 1.45-2.6l-4.4-7.3V2.8" />
            <path d="M6.2 12h7.6" />
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

function categoryLabel(category: EventLogCategory): string {
    if (category === "quest") return "Quest";
    if (category === "runtime") return "Runtime";
    if (category === "network") return "Network";
    return "Diagnostic";
}

function severityGlyph(severity: EventLogSeverity): string {
    if (severity === "error") return "×";
    if (severity === "warning") return "!";
    if (severity === "success") return "✓";
    return "i";
}

const SEMANTIC_TOKEN_RE = /(\[(?:System|Network|Task|Cycle|Enroll|Claim|Bypass|Achievement|Startup|Patcher)\]|HTTP\s+\d{3}|heartbeat|watchdog|retry(?:ing)?|aborted?|failed?|failure|error|warning|completed?|claimed?|accept(?:ing|ed)?|enrolled?|paused?|resum(?:ed|ing|e)?|started?|stopped?|queued?|captcha|required|unavailable|refus(?:ed|ing)|fallback|bypass|success(?:fully)?)/gi;

function semanticTokenClass(token: string): string | null {
    const normalized = token.toLowerCase();

    if (/^\[(network)\]$/.test(normalized) || normalized.startsWith("http ") || normalized === "heartbeat" || normalized === "watchdog") {
        return "is-network";
    }
    if (/^\[(cycle|system|startup|patcher)\]$/.test(normalized)) return "is-runtime";
    if (/^\[(task|enroll|claim|achievement)\]$/.test(normalized)) return "is-quest";
    if (/^\[bypass\]$/.test(normalized) || normalized === "bypass" || normalized === "fallback") return "is-diagnostic";
    if (/aborted|failed|failure|error|refused/.test(normalized)) return "is-danger";
    if (/retry|warning|captcha|required|unavailable|queued|paused|stopped/.test(normalized)) return "is-warning";
    if (/completed|claimed|accepted|enrolled|resumed|started|success/.test(normalized)) return "is-success";
    return null;
}

function SemanticText({ text }: { text: string; }) {
    return (
        <>
            {text.split(SEMANTIC_TOKEN_RE).map((part, index) => {
                if (!part) return null;
                const className = semanticTokenClass(part);
                return className
                    ? <span key={`${index}-${part}`} className={`quest-ui-event-semantic ${className}`}>{part}</span>
                    : part;
            })}
        </>
    );
}

async function copyDiagnosticReport(event: EventLogEvent, availableEvents: EventLogEvent[]): Promise<void> {
    try {
        await navigator.clipboard.writeText(buildDiagnosticReport(event, availableEvents));
        showToast("Diagnostic report copied.", Toasts.Type.SUCCESS);
    } catch {
        showToast("Could not copy the diagnostic report.", Toasts.Type.FAILURE);
    }
}

function EventDetail({ event, availableEvents, onBack }: { event: EventLogEvent; availableEvents: EventLogEvent[]; onBack: () => void; }) {
    const category = inferEventCategory(event);
    return (
        <div className="quest-ui-event-detail">
            <div className="quest-ui-event-detail-header">
                <button type="button" onClick={onBack}>← Back</button>
                <div className="quest-ui-event-detail-header-actions">
                    <span className={`quest-ui-event-level is-${event.severity}`}>{severityGlyph(event.severity)} {sourceLabel(event.source)}</span>
                    <button type="button" className="quest-ui-event-copy-report" onClick={() => void copyDiagnosticReport(event, availableEvents)} title="Copy diagnostic report"><BugLogIcon /> Copy report</button>
                </div>
            </div>
            <h3><SemanticText text={event.summary} /></h3>
            <div className="quest-ui-event-detail-grid">
                <span>Event code</span><code>{event.eventCode}</code>
                <span>Category</span><strong>{categoryLabel(category)}</strong>
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

const EVENT_LOG_SORT_OPTIONS: ReadonlyArray<{ value: EventLogSort; label: string; }> = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "severity", label: "Errors first" }
];

function SortChevronIcon() {
    return (
        <svg className="quest-ui-event-sort-chevron" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
        </svg>
    );
}

function EventLogSortMenu({ mode, onChange }: { mode: EventLogSort; onChange: (mode: EventLogSort) => void; }) {
    return (
        <div className="quest-ui-event-sort-menu" role="menu" aria-label="Sort Event Log">
            <div className="quest-ui-event-sort-menu-heading">
                <strong>Sort events</strong>
                <span>Order the current log view</span>
            </div>
            <div className="quest-ui-event-sort-options">
                {EVENT_LOG_SORT_OPTIONS.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        className={option.value === mode ? "is-selected" : ""}
                        role="menuitemradio"
                        aria-checked={option.value === mode}
                        onClick={() => onChange(option.value)}
                    >
                        <span>{option.label}</span>
                        {option.value === mode && <span className="quest-ui-event-sort-check" aria-hidden="true">✓</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}

type ChoiceTone =
    | "neutral"
    | "orion"
    | "questui"
    | "error"
    | "warning"
    | "success"
    | "info"
    | "quest"
    | "runtime"
    | "network"
    | "diagnostic";

function Choice<T extends string>({ value, active, tone = "neutral", children, onClick }: {
    value: T;
    active: boolean;
    tone?: ChoiceTone;
    children: any;
    onClick: (value: T) => void;
}) {
    return (
        <button
            type="button"
            className={`quest-ui-event-choice tone-${tone}${active ? " is-selected" : ""}`}
            aria-pressed={active}
            onClick={() => onClick(value)}
        >
            {children}
        </button>
    );
}

function EventLogPanel() {
    const [events, setEvents] = useState<EventLogEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [query, setQuery] = useState("");
    const [source, setSource] = useState<"all" | EventLogSource>("all");
    const [severity, setSeverity] = useState<"all" | EventLogSeverity>("all");
    const [category, setCategory] = useState<"all" | EventLogCategory>("all");
    const [sort, setSort] = useState<EventLogSort>("newest");
    const [sortOpen, setSortOpen] = useState(false);
    const sortButtonRef = useRef<HTMLButtonElement | null>(null);
    const [limit, setLimit] = useState(200);
    const [selected, setSelected] = useState<EventLogEvent | null>(null);
    const [clearArmed, setClearArmed] = useState(false);
    const [info, setInfo] = useState<{ path: string; size: number; }>({ path: "", size: 0 });

    const load = async () => {
        const result = await queryEventLog({ query, source, severity, category, sort, limit });
        setEvents(result.events);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setInfo(await getEventLogInfo());
    };

    useEffect(() => {
        const timer = setTimeout(() => void load(), 120);
        return () => clearTimeout(timer);
    }, [query, source, severity, category, sort, limit]);

    useEffect(() => subscribeEventLog(() => void load()), [query, source, severity, category, sort, limit]);

    useEffect(() => {
        if (!clearArmed) return;
        const timer = setTimeout(() => setClearArmed(false), 4000);
        return () => clearTimeout(timer);
    }, [clearArmed]);

    const selectSort = (mode: EventLogSort) => {
        setSort(mode);
        setSortOpen(false);
    };

    if (selected) return <EventDetail event={selected} availableEvents={events} onBack={() => setSelected(null)} />;

    let previousDay = "";
    return (
        <div className="quest-ui-event-log-panel" role="dialog" aria-label="QuestUI Event Log preview">
            <div className="quest-ui-event-log-header">
                <div>
                    <strong>Event Log</strong>
                    <span className="quest-ui-event-preview-chip"><FlaskIcon /><span>Preview Feature</span></span>
                </div>
                <span>{total} matching · {(info.size / 1024).toFixed(info.size >= 1024 * 1024 ? 0 : 1)} KB</span>
            </div>

            <input className="quest-ui-event-search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search quest, event code, HTTP status…" />

            <div className="quest-ui-event-filter-row">
                <span>Source</span>
                <div><Choice value="all" active={source === "all"} tone="neutral" onClick={setSource}>All</Choice><Choice value="orion" active={source === "orion"} tone="orion" onClick={setSource}>Orion</Choice><Choice value="questui" active={source === "questui"} tone="questui" onClick={setSource}>QuestUI</Choice></div>
            </div>
            <div className="quest-ui-event-filter-row">
                <span>Level</span>
                <div><Choice value="all" active={severity === "all"} tone="neutral" onClick={setSeverity}>All</Choice><Choice value="error" active={severity === "error"} tone="error" onClick={setSeverity}>Error</Choice><Choice value="warning" active={severity === "warning"} tone="warning" onClick={setSeverity}>Warning</Choice><Choice value="success" active={severity === "success"} tone="success" onClick={setSeverity}>Success</Choice><Choice value="info" active={severity === "info"} tone="info" onClick={setSeverity}>Info</Choice></div>
            </div>
            <div className="quest-ui-event-filter-row">
                <span>Category</span>
                <div><Choice value="all" active={category === "all"} tone="neutral" onClick={setCategory}>All</Choice><Choice value="quest" active={category === "quest"} tone="quest" onClick={setCategory}>Quest</Choice><Choice value="runtime" active={category === "runtime"} tone="runtime" onClick={setCategory}>Runtime</Choice><Choice value="network" active={category === "network"} tone="network" onClick={setCategory}>Network</Choice><Choice value="diagnostic" active={category === "diagnostic"} tone="diagnostic" onClick={setCategory}>Diagnostic</Choice></div>
            </div>

            <div className="quest-ui-event-log-actions">
                <div className="quest-ui-event-sort-control">
                    <span>Sort</span>
                    <Popout
                        position="bottom"
                        align="left"
                        animation={Popout.Animation.NONE}
                        shouldShow={sortOpen}
                        onRequestClose={() => setSortOpen(false)}
                        targetElementRef={sortButtonRef}
                        renderPopout={() => <EventLogSortMenu mode={sort} onChange={selectSort} />}
                    >
                        {(_, { isShown }) => (
                            <button
                                ref={sortButtonRef}
                                type="button"
                                className={`quest-ui-event-sort-trigger${isShown ? " is-open" : ""}`}
                                onClick={() => setSortOpen(value => !value)}
                                aria-label={`Sort Event Log: ${EVENT_LOG_SORT_OPTIONS.find(option => option.value === sort)?.label ?? "Newest first"}`}
                                aria-expanded={isShown}
                                aria-haspopup="menu"
                            >
                                <span>{EVENT_LOG_SORT_OPTIONS.find(option => option.value === sort)?.label ?? "Newest first"}</span>
                                <SortChevronIcon />
                            </button>
                        )}
                    </Popout>
                </div>
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
                    const eventCategory = inferEventCategory(event);
                    return (
                        <div key={event.id}>
                            {showDay && <div className="quest-ui-event-day"><span>{dayLabel(event.timestamp)}</span></div>}
                            <article className={`quest-ui-event-row is-${event.severity}`}>
                                <span className="quest-ui-event-time">{timeLabel(event.timestamp)}</span>
                                <span className="quest-ui-event-severity" aria-hidden="true">{severityGlyph(event.severity)}</span>
                                <div className="quest-ui-event-copy">
                                    <div>
                                        <span className={`quest-ui-event-source is-${event.source}`}>{sourceLabel(event.source)}</span>
                                        <span className={`quest-ui-event-category is-${eventCategory}`}>{categoryLabel(eventCategory).toUpperCase()}</span>
                                        {event.quest?.name && <strong>{event.quest.name}</strong>}
                                    </div>
                                    <span><SemanticText text={event.summary} /></span>
                                </div>
                                <div className="quest-ui-event-row-actions">
                                    <button type="button" className="quest-ui-event-view-detail" onClick={() => setSelected(event)}>View details</button>
                                    {(event.severity === "error" || event.severity === "warning") && (
                                        <button type="button" className="quest-ui-event-row-bug" onClick={() => void copyDiagnosticReport(event, events)} title="Copy diagnostic report" aria-label="Copy diagnostic report"><BugLogIcon /></button>
                                    )}
                                </div>
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
