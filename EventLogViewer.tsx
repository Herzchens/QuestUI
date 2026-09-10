import { Popout, showToast, Toasts, UserStore, useEffect, useMemo, useRef, useState, useStateFromStores } from "@webpack/common";

import { buildDiagnosticReport } from "./diagnosticReport";
import { EventLogWindowedScroller } from "./EventLogWindowedScroller";
import { clearEventLog, getEventLogInfo, openEventLogFolder, subscribeEventLog } from "./eventLog";
import { isLegacyUnscopedEvent } from "./eventLogAccountLogic";
import { inferEventCategory } from "./eventLogLogic";
import { queryEventLogPage } from "./eventLogPage";
import type { EventLogCursor } from "./eventLogPaginationLogic";
import type { EventLogCategory, EventLogEvent, EventLogSeverity, EventLogSort, EventLogSource } from "./eventLogTypes";

import "./eventLog.css";
import "./eventLogPagination.css";

type EventLogStorageInfo = {
    path: string;
    size: number;
    maxBytes?: number;
    compactToBytes?: number;
};

type EventLogStorageTone = "safe" | "watch" | "high" | "critical" | "unknown";
type EventLogMatchTone = "empty" | "few" | "active" | "dense";
type EventLogVirtualRow =
    | { kind: "day"; key: string; timestamp: number; }
    | { kind: "event"; key: string; event: EventLogEvent; };

const EVENT_LOG_PAGE_SIZE = 250;
const EVENT_LOG_AUTO_LOAD_DELAY_MS = 750;
const EVENT_LOG_LOAD_MARGIN_PX = 96;
const EVENT_LOG_DAY_ROW_HEIGHT = 30;
const EVENT_LOG_EVENT_ROW_HEIGHT = 64;
const EVENT_LOG_ACCOUNT_ROW_HEIGHT = 78;

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

function captureSourceLabel(event: EventLogEvent): string {
    if (event.captureSource === "console-preview") return "Console fallback";
    if (event.captureSource === "orion-api") return "Orion structured API";
    return "QuestUI";
}

function formatStorageBytes(bytes: number): string {
    const safeBytes = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
    if (safeBytes >= 1024 * 1024) return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(safeBytes / 1024).toFixed(safeBytes >= 1024 ? 0 : 1)} KB`;
}

function storageTone(size: number, maxBytes: number): EventLogStorageTone {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) return "unknown";
    const ratio = Math.max(0, size) / maxBytes;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.8) return "high";
    if (ratio >= 0.6) return "watch";
    return "safe";
}

function matchingTone(total: number): EventLogMatchTone {
    if (!Number.isFinite(total) || total <= 0) return "empty";
    if (total < 100) return "few";
    if (total < 1000) return "active";
    return "dense";
}

function isAccountChangeEvent(event: Pick<EventLogEvent, "eventCode">): boolean {
    const code = String(event.eventCode ?? "").toLocaleLowerCase();
    return code === "questui_account_changed"
        || code === "orion_account_changed"
        || code === "system.account_changed";
}

function eventRenderKey(event: EventLogEvent): string {
    return typeof event.id === "string" && event.id ? event.id : `${event.timestamp}:${event.source}:${event.eventCode}`;
}

function buildVirtualRows(events: EventLogEvent[]): EventLogVirtualRow[] {
    const rows: EventLogVirtualRow[] = [];
    let previousDay = "";
    for (const event of events) {
        const key = dayKey(event.timestamp);
        if (key !== previousDay) {
            rows.push({ kind: "day", key: `day:${key}:${rows.length}`, timestamp: event.timestamp });
            previousDay = key;
        }
        rows.push({ kind: "event", key: `event:${eventRenderKey(event)}`, event });
    }
    return rows;
}

function virtualRowHeight(row: EventLogVirtualRow | undefined): number {
    if (!row || row.kind === "day") return EVENT_LOG_DAY_ROW_HEIGHT;
    return isAccountChangeEvent(row.event) ? EVENT_LOG_ACCOUNT_ROW_HEIGHT : EVENT_LOG_EVENT_ROW_HEIGHT;
}

const SEMANTIC_TOKEN_RE = /(\[(?:System|Network|Quest|Task|Cycle|Enroll|Claim|Bypass|Achievement|Startup|Patcher)\]|HTTP\s+\d{3}|heartbeat|watchdog|retry(?:ing)?|block(?:ed|ing)?|aborted?|failed?|failure|error|warning|completed?|claimed?|accept(?:ing|ed)?|enrolled?|paused?|resum(?:ed|ing|e)?|started?|stopped?|queued?|captcha|required|unavailable|refus(?:ed|ing)|fallback|bypass|success(?:fully)?)/gi;

function semanticTokenClass(token: string): string | null {
    const normalized = token.toLowerCase();
    if (/^\[(network)\]$/.test(normalized) || normalized.startsWith("http ") || normalized === "heartbeat" || normalized === "watchdog") return "is-network";
    if (/^\[(cycle|system|startup|patcher)\]$/.test(normalized)) return "is-runtime";
    if (/^\[(quest|task|enroll|claim|achievement)\]$/.test(normalized)) return "is-quest";
    if (/^\[bypass\]$/.test(normalized) || normalized === "bypass" || normalized === "fallback") return "is-diagnostic";
    if (/aborted|failed|failure|error|refused/.test(normalized)) return "is-danger";
    if (/^block(?:ed|ing)?$/.test(normalized)) return "is-blocked";
    if (/retry|warning|captcha|required|unavailable|queued|paused|stopped/.test(normalized)) return "is-warning";
    if (/completed|claimed|accepted|enrolled|resumed|started|success/.test(normalized)) return "is-success";
    return null;
}

function SemanticText({ text }: { text: unknown; }) {
    const safeText = String(text ?? "");
    return (
        <>
            {safeText.split(SEMANTIC_TOKEN_RE).map((part, index) => {
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
    const legacy = isLegacyUnscopedEvent(event);
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
                <span>Capture</span><strong>{captureSourceLabel(event)}</strong>
                <span>Account</span><strong>{legacy ? "Legacy · unscoped" : "Current account"}</strong>
                {event.quest?.name && <><span>Quest</span><strong>{event.quest.name}</strong></>}
                {event.quest?.id && <><span>Quest ID</span><code>{event.quest.id}</code></>}
                {event.quest?.taskType && <><span>Task type</span><code>{event.quest.taskType}</code></>}
                {event.detail?.httpStatus != null && <><span>HTTP</span><code>{String(event.detail.httpStatus)}</code></>}
                {event.detail?.upstreamCode != null && <><span>Upstream code</span><code>{String(event.detail.upstreamCode)}</code></>}
                {typeof event.detail?.terminal === "boolean" && <><span>Terminal</span><strong>{event.detail.terminal ? "Yes" : "No"}</strong></>}
                {typeof event.detail?.retryable === "boolean" && <><span>Retryable</span><strong>{event.detail.retryable ? "Yes" : "No"}</strong></>}
                {event.detail?.attempt != null && <><span>Attempt</span><code>{String(event.detail.attempt)}{event.detail?.maxAttempts != null ? ` / ${String(event.detail.maxAttempts)}` : ""}</code></>}
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
                    <button key={option.value} type="button" className={option.value === mode ? "is-selected" : ""} role="menuitemradio" aria-checked={option.value === mode} onClick={() => onChange(option.value)}>
                        <span>{option.label}</span>
                        {option.value === mode && <span className="quest-ui-event-sort-check" aria-hidden="true">✓</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}

type ChoiceTone = "neutral" | "orion" | "questui" | "error" | "warning" | "success" | "info" | "quest" | "runtime" | "network" | "diagnostic";

function Choice<T extends string>({ value, active, tone = "neutral", children, onClick }: { value: T; active: boolean; tone?: ChoiceTone; children: any; onClick: (value: T) => void; }) {
    return <button type="button" className={`quest-ui-event-choice tone-${tone}${active ? " is-selected" : ""}`} aria-pressed={active} onClick={() => onClick(value)}>{children}</button>;
}

function EventLogPanel() {
    const currentUserId = useStateFromStores([UserStore], () => UserStore?.getCurrentUser?.()?.id ?? null);
    const currentUsername = useStateFromStores([UserStore], () => UserStore?.getCurrentUser?.()?.username ?? null);
    const [events, setEvents] = useState<EventLogEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<EventLogCursor | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [source, setSource] = useState<"all" | EventLogSource>("all");
    const [severity, setSeverity] = useState<"all" | EventLogSeverity>("all");
    const [category, setCategory] = useState<"all" | EventLogCategory>("all");
    const [sort, setSort] = useState<EventLogSort>("newest");
    const [sortOpen, setSortOpen] = useState(false);
    const [selected, setSelected] = useState<EventLogEvent | null>(null);
    const [clearCountdown, setClearCountdown] = useState<number | null>(null);
    const [clearing, setClearing] = useState(false);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [newEventsAvailable, setNewEventsAvailable] = useState(false);
    const [refreshNonce, setRefreshNonce] = useState(0);
    const [info, setInfo] = useState<EventLogStorageInfo>({ path: "", size: 0 });

    const sortButtonRef = useRef<HTMLButtonElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const requestGenerationRef = useRef(0);
    const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadMoreArmedRef = useRef(true);
    const atHeadRef = useRef(true);

    const virtualRows = useMemo(() => buildVirtualRows(events), [events]);

    useEffect(() => {
        const generation = ++requestGenerationRef.current;
        if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
        if (liveRefreshTimerRef.current) clearTimeout(liveRefreshTimerRef.current);
        loadMoreTimerRef.current = null;
        liveRefreshTimerRef.current = null;
        loadMoreArmedRef.current = true;
        atHeadRef.current = true;
        setEvents([]);
        setTotal(0);
        setHasMore(false);
        setNextCursor(null);
        setSessionId(null);
        setLoadingMore(false);
        setLoadingInitial(true);
        setNewEventsAvailable(false);
        if (listRef.current) listRef.current.scrollTop = 0;

        const timer = setTimeout(() => {
            void Promise.all([
                queryEventLogPage({ query, source, severity, category, sort, pageSize: EVENT_LOG_PAGE_SIZE, includeLegacy: true }),
                getEventLogInfo() as Promise<EventLogStorageInfo>
            ]).then(([result, nextInfo]) => {
                if (generation !== requestGenerationRef.current) return;
                if (result.stale) {
                    setLoadingInitial(false);
                    return;
                }
                setEvents(result.events);
                setTotal(result.total);
                setHasMore(result.hasMore);
                setNextCursor(result.nextCursor);
                setSessionId(result.sessionId);
                setInfo(nextInfo);
                setLoadingInitial(false);
            }).catch(() => {
                if (generation === requestGenerationRef.current) setLoadingInitial(false);
            });
        }, 120);

        return () => clearTimeout(timer);
    }, [query, source, severity, category, sort, currentUserId, refreshNonce]);

    useEffect(() => subscribeEventLog(() => {
        void (getEventLogInfo() as Promise<EventLogStorageInfo>).then(setInfo).catch(() => undefined);
        if (sort === "newest" && atHeadRef.current && !loadingMore) {
            if (liveRefreshTimerRef.current) clearTimeout(liveRefreshTimerRef.current);
            liveRefreshTimerRef.current = setTimeout(() => {
                liveRefreshTimerRef.current = null;
                setRefreshNonce(value => value + 1);
            }, 150);
        } else {
            setNewEventsAvailable(true);
        }
    }), [sort, loadingMore]);

    useEffect(() => {
        setSelected(null);
        setClearCountdown(null);
        setClearing(false);
    }, [currentUserId]);

    useEffect(() => {
        if (clearCountdown == null || clearing) return;
        const timer = setTimeout(() => setClearCountdown(value => value == null || value <= 1 ? null : value - 1), 1000);
        return () => clearTimeout(timer);
    }, [clearCountdown, clearing]);

    useEffect(() => () => {
        requestGenerationRef.current++;
        if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
        if (liveRefreshTimerRef.current) clearTimeout(liveRefreshTimerRef.current);
        loadMoreTimerRef.current = null;
        liveRefreshTimerRef.current = null;
    }, []);

    const selectSort = (mode: EventLogSort) => {
        setSort(mode);
        setSortOpen(false);
    };

    const loadNextPage = async () => {
        if (!hasMore || !nextCursor || !sessionId || loadingMore) return;
        const generation = requestGenerationRef.current;
        const cursor = nextCursor;
        const activeSession = sessionId;
        setLoadingMore(true);
        try {
            const result = await queryEventLogPage({
                query,
                source,
                severity,
                category,
                sort,
                pageSize: EVENT_LOG_PAGE_SIZE,
                cursor,
                sessionId: activeSession,
                includeLegacy: true
            });
            if (generation !== requestGenerationRef.current) return;
            if (result.stale || result.sessionId !== activeSession) {
                setRefreshNonce(value => value + 1);
                return;
            }

            setEvents(current => {
                const seen = new Set(current.map(eventRenderKey));
                const appended = result.events.filter(event => !seen.has(eventRenderKey(event)));
                return appended.length > 0 ? [...current, ...appended] : current;
            });
            setTotal(result.total);
            setHasMore(result.hasMore);
            setNextCursor(result.nextCursor);
        } finally {
            if (generation === requestGenerationRef.current) setLoadingMore(false);
        }
    };

    const scheduleNextPage = () => {
        if (!hasMore || !nextCursor || !sessionId || loadingMore || loadMoreTimerRef.current) return;
        loadMoreTimerRef.current = setTimeout(() => {
            loadMoreTimerRef.current = null;
            void loadNextPage();
        }, EVENT_LOG_AUTO_LOAD_DELAY_MS);
    };

    const handleListScroll = () => {
        const scroller = listRef.current;
        if (!scroller) return;
        const fromTop = Math.max(0, Number(scroller.scrollTop) || 0);
        const fromBottom = Math.max(0, scroller.scrollHeight - scroller.clientHeight - fromTop);

        atHeadRef.current = fromTop <= 24;
        if (fromTop <= 0) return;
        if (fromBottom > EVENT_LOG_LOAD_MARGIN_PX) {
            loadMoreArmedRef.current = true;
            return;
        }
        if (!loadMoreArmedRef.current) return;
        loadMoreArmedRef.current = false;
        scheduleNextPage();
    };

    if (selected) return <EventDetail event={selected} availableEvents={events} onBack={() => setSelected(null)} />;

    const maxBytes = Number(info.maxBytes) || 0;
    const compactToBytes = Number(info.compactToBytes) || 0;
    const storageState = storageTone(info.size, maxBytes);
    const storageLabel = maxBytes > 0 ? `${formatStorageBytes(info.size)} / ${formatStorageBytes(maxBytes)}` : formatStorageBytes(info.size);
    const storageTitle = maxBytes > 0
        ? `Event Log storage: ${formatStorageBytes(info.size)} of ${formatStorageBytes(maxBytes)}. After exceeding the hard limit, QuestUI compacts the file toward ${formatStorageBytes(compactToBytes)}.`
        : `Event Log storage: ${formatStorageBytes(info.size)}.`;
    const matchState = matchingTone(total);
    const matchingLabel = `${total.toLocaleString()} matching`;

    const renderVirtualRow = (row: EventLogVirtualRow | undefined) => {
        if (!row) return null;
        if (row.kind === "day") return <div className="quest-ui-event-day quest-ui-event-virtual-day"><span>{dayLabel(row.timestamp)}</span></div>;

        const event = row.event;
        const eventCategory = inferEventCategory(event);
        const legacy = isLegacyUnscopedEvent(event);
        const accountChange = isAccountChangeEvent(event);
        const accountUsername = accountChange && !legacy ? currentUsername : null;
        return (
            <article className={`quest-ui-event-row is-${event.severity} is-category-${eventCategory}${accountChange ? " is-account-change" : ""}`}>
                <div className="quest-ui-event-time-cell">
                    <span className="quest-ui-event-time">{timeLabel(event.timestamp)}</span>
                    {accountUsername && <span className="quest-ui-event-account-name" title={accountUsername}>{accountUsername}</span>}
                </div>
                <span className="quest-ui-event-severity" aria-hidden="true">{severityGlyph(event.severity)}</span>
                <div className="quest-ui-event-copy">
                    <div>
                        <span className={`quest-ui-event-source is-${event.source}`}>{sourceLabel(event.source)}</span>
                        <span className={`quest-ui-event-category is-${eventCategory}`}>{categoryLabel(eventCategory).toUpperCase()}</span>
                        {legacy && <span className="quest-ui-event-account-legacy" title="Recorded before account-aware Event Log; account owner is unknown">LEGACY</span>}
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
        );
    };

    return (
        <div className="quest-ui-event-log-panel" role="dialog" aria-label="QuestUI Event Log">
            <div className="quest-ui-event-log-header">
                <div>
                    <strong>Event Log</strong>
                </div>
                <div className="quest-ui-event-log-header-meta">
                    {newEventsAvailable && <button type="button" className="quest-ui-event-new-events" onClick={() => setRefreshNonce(value => value + 1)}>New events</button>}
                    <span className={`quest-ui-event-storage is-${storageState}`} title={storageTitle} aria-label={storageTitle}>
                        <span className="quest-ui-event-storage-dot" aria-hidden="true" />
                        {storageLabel}
                    </span>
                </div>
            </div>

            <div className="quest-ui-event-search-shell">
                <input className="quest-ui-event-search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search quest, event code, HTTP status…" />
                <span className={`quest-ui-event-match-count is-${matchState}`} title={matchingLabel}>{matchingLabel}</span>
            </div>

            <div className="quest-ui-event-filter-row">
                <span>Source</span>
                <div><Choice value="all" active={source === "all"} onClick={setSource}>All</Choice><Choice value="orion" active={source === "orion"} tone="orion" onClick={setSource}>Orion</Choice><Choice value="questui" active={source === "questui"} tone="questui" onClick={setSource}>QuestUI</Choice></div>
            </div>
            <div className="quest-ui-event-filter-row">
                <span>Level</span>
                <div><Choice value="all" active={severity === "all"} onClick={setSeverity}>All</Choice><Choice value="error" active={severity === "error"} tone="error" onClick={setSeverity}>Error</Choice><Choice value="warning" active={severity === "warning"} tone="warning" onClick={setSeverity}>Warning</Choice><Choice value="success" active={severity === "success"} tone="success" onClick={setSeverity}>Success</Choice><Choice value="info" active={severity === "info"} tone="info" onClick={setSeverity}>Info</Choice></div>
            </div>
            <div className="quest-ui-event-filter-row">
                <span>Category</span>
                <div><Choice value="all" active={category === "all"} onClick={setCategory}>All</Choice><Choice value="quest" active={category === "quest"} tone="quest" onClick={setCategory}>Quest</Choice><Choice value="runtime" active={category === "runtime"} tone="runtime" onClick={setCategory}>Runtime</Choice><Choice value="network" active={category === "network"} tone="network" onClick={setCategory}>Network</Choice><Choice value="diagnostic" active={category === "diagnostic"} tone="diagnostic" onClick={setCategory}>Diagnostic</Choice></div>
            </div>

            <div className="quest-ui-event-log-actions">
                <div className="quest-ui-event-sort-control">
                    <span>Sort</span>
                    <Popout position="bottom" align="left" animation={Popout.Animation.NONE} shouldShow={sortOpen} onRequestClose={() => setSortOpen(false)} targetElementRef={sortButtonRef} renderPopout={() => <EventLogSortMenu mode={sort} onChange={selectSort} />}>
                        {(_, { isShown }) => (
                            <button ref={sortButtonRef} type="button" className={`quest-ui-event-sort-trigger${isShown ? " is-open" : ""}`} onClick={() => setSortOpen(value => !value)} aria-label={`Sort Event Log: ${EVENT_LOG_SORT_OPTIONS.find(option => option.value === sort)?.label ?? "Newest first"}`} aria-expanded={isShown} aria-haspopup="menu">
                                <span>{EVENT_LOG_SORT_OPTIONS.find(option => option.value === sort)?.label ?? "Newest first"}</span>
                                <SortChevronIcon />
                            </button>
                        )}
                    </Popout>
                </div>
                <div>
                    <button type="button" onClick={() => void openEventLogFolder()}>Open file</button>
                    <button
                        type="button"
                        className={clearCountdown != null ? "is-danger" : ""}
                        disabled={clearing}
                        title="Clear Event Log entries owned by the current Discord account"
                        onClick={() => {
                            if (clearing) return;
                            if (clearCountdown == null) {
                                setClearCountdown(5);
                                return;
                            }
                            setClearing(true);
                            void clearEventLog().then(() => {
                                setClearCountdown(null);
                                showToast("Event Log cleared successfully.", Toasts.Type.SUCCESS);
                                setRefreshNonce(value => value + 1);
                            }).finally(() => setClearing(false));
                        }}
                    >
                        {clearing ? "Clearing…" : clearCountdown != null ? `Confirm Clear ${clearCountdown}` : "Clear log"}
                    </button>
                </div>
            </div>

            {loadingInitial ? (
                <div className="quest-ui-event-empty">Loading Event Log…</div>
            ) : events.length === 0 ? (
                <div className="quest-ui-event-empty">No matching Orion or QuestUI events yet.</div>
            ) : (
                <EventLogWindowedScroller
                    containerRef={listRef}
                    className="quest-ui-event-virtual-list"
                    rowCount={virtualRows.length}
                    rowHeight={row => virtualRowHeight(virtualRows[row])}
                    renderRow={row => renderVirtualRow(virtualRows[row])}
                    footerHeight={hasMore || loadingMore ? 34 : 0}
                    renderFooter={() => hasMore || loadingMore ? <div className="quest-ui-event-page-footer">{loadingMore ? `Loading ${EVENT_LOG_PAGE_SIZE} more events…` : "Scroll to continue…"}</div> : null}
                    onScroll={handleListScroll}
                />
            )}
        </div>
    );
}

export function EventLogButton() {
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    return (
        <Popout position="bottom" align="right" animation={Popout.Animation.NONE} shouldShow={open} onRequestClose={() => setOpen(false)} targetElementRef={buttonRef} renderPopout={() => <EventLogPanel />}>
            {(_, { isShown }) => (
                <button ref={buttonRef} type="button" className={`quest-ui-toolbar-button quest-ui-event-log-button${isShown ? " is-open" : ""}`} onClick={() => setOpen(value => !value)} aria-label="Open QuestUI Event Log" aria-expanded={isShown} title="Event Log">
                    <BugLogIcon />
                </button>
            )}
        </Popout>
    );
}
