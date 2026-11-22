import { Popout, showToast, UserStore, useEffect, useMemo, useRef, useState, useStateFromStores } from "@webpack/common";

import { isLegacyUnscopedEvent } from "./account";
import { Choice, EVENT_LOG_SORT_OPTIONS, EventLogSortMenu, SortChevronIcon } from "./controls";
import { EventLogWindowedScroller } from "./EventLogWindowedScroller";
import { inferEventCategory } from "./logic";
import { queryEventLogPage } from "./page";
import type { EventLogCursor } from "./pagination";
import {
    BugLogIcon,
    EventDetail,
    SemanticText,
    buildVirtualRows,
    categoryLabel,
    copyDiagnosticReport,
    dayLabel,
    eventRenderKey,
    formatStorageBytes,
    isAccountChangeEvent,
    matchingTone,
    severityGlyph,
    sourceLabel,
    storageTone,
    timeLabel,
    virtualRowHeight,
    type EventLogVirtualRow
} from "./presentation";
import { clearEventLog, getEventLogInfo, openEventLogFolder, subscribeEventLog } from "./runtime";
import type { EventLogCategory, EventLogEvent, EventLogSeverity, EventLogSort, EventLogSource } from "./types";

import "./styles/eventLog.css";
import "./styles/eventLogPagination.css";

type EventLogStorageInfo = {
    path: string;
    size: number;
    maxBytes?: number;
    compactToBytes?: number;
};

const EVENT_LOG_PAGE_SIZE = 250;
const EVENT_LOG_AUTO_LOAD_DELAY_MS = 750;
const EVENT_LOG_LOAD_MARGIN_PX = 96;
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
    const queryIdentityRef = useRef<string | null>(null);
    const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadMoreArmedRef = useRef(true);
    const atHeadRef = useRef(true);

    const virtualRows = useMemo(() => buildVirtualRows(events), [events]);

    useEffect(() => {
        const generation = ++requestGenerationRef.current;
        const queryIdentity = JSON.stringify([query, source, severity, category, sort, currentUserId]);
        const hardReset = queryIdentityRef.current !== queryIdentity;
        queryIdentityRef.current = queryIdentity;

        if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
        if (liveRefreshTimerRef.current) clearTimeout(liveRefreshTimerRef.current);
        loadMoreTimerRef.current = null;
        liveRefreshTimerRef.current = null;

        if (hardReset) {
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
        }

        const timer = setTimeout(() => {
            void Promise.all([
                queryEventLogPage({ query, source, severity, category, sort, pageSize: EVENT_LOG_PAGE_SIZE, includeLegacy: true }),
                getEventLogInfo() as Promise<EventLogStorageInfo>
            ]).then(([result, nextInfo]) => {
                if (generation !== requestGenerationRef.current) return;
                if (result.stale) {
                    if (hardReset) setLoadingInitial(false);
                    return;
                }

                // Live Event Log notifications refresh the current first page in place. Do not clear
                // the existing window first: update start/success events can arrive seconds apart,
                // and blanking the list on every notification makes the panel visibly flash.
                setEvents(result.events);
                setTotal(result.total);
                setHasMore(result.hasMore);
                setNextCursor(result.nextCursor);
                setSessionId(result.sessionId);
                setInfo(nextInfo);
                setNewEventsAvailable(false);
                if (hardReset) setLoadingInitial(false);
            }).catch(() => {
                if (generation === requestGenerationRef.current && hardReset) setLoadingInitial(false);
            });
        }, hardReset ? 120 : 0);

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
                                showToast({ text: "Event Log cleared successfully.", variant: "success" });
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

