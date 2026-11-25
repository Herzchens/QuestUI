import { Popout, showToast, UserStore, useEffect, useMemo, useRef, useState, useStateFromStores } from "@webpack/common";

import { collectEventAccountUsernames, isLegacyUnscopedEvent } from "./account";
import {
    BroomIcon,
    CheckIcon,
    CloseIcon,
    EVENT_LOG_SORT_OPTIONS,
    EventLogCombinedFilterMenu,
    EventLogSortMenu,
    FilterIcon,
    FolderIcon,
    SearchIcon,
    SortIcon
} from "./controls";
import { EventLogWindowedScroller } from "./EventLogWindowedScroller";
import { useDashboardThemeClassName } from "../themes/runtime";
import { inferEventCategory } from "./logic";
import { queryEventLogPage } from "./page";
import type { EventLogCursor } from "./pagination";
import {
    BugLogIcon,
    CalendarDaysIcon,
    DatabaseIcon,
    EventDetail,
    SemanticText,
    SeverityIcon,
    buildVirtualRows,
    categoryLabel,
    copyDiagnosticReport,
    dayLabel,
    eventListSummary,
    eventRenderKey,
    formatStorageBytes,
    isAccountChangeEvent,
    matchingTone,
    sourceLabel,
    storageTone,
    timeLabel,
    visualSeverity,
    virtualRowHeight,
    type EventLogVirtualRow
} from "./presentation";
import { clearEventLog, getEventLogInfo, openEventLogFolder, subscribeEventLog } from "./runtime";
import type { EventLogAccountScope, EventLogCategory, EventLogEvent, EventLogSeverity, EventLogSort, EventLogSource } from "./types";

type EventLogStorageInfo = {
    path: string;
    size: number;
    maxBytes?: number;
    compactToBytes?: number;
};

const EVENT_LOG_PAGE_SIZE = 250;
const EVENT_LOG_AUTO_LOAD_DELAY_MS = 750;
const EVENT_LOG_LOAD_MARGIN_PX = 96;
const ALL_EVENT_LOG_SEVERITIES: readonly EventLogSeverity[] = ["error", "warning", "success", "info"];
const ALL_EVENT_LOG_CATEGORIES: readonly EventLogCategory[] = ["quest", "runtime", "network", "diagnostic"];
const ALL_EVENT_LOG_ACCOUNT_SCOPES: readonly EventLogAccountScope[] = ["current", "other"];

function toggleOrderedSelection<T extends string>(current: readonly T[], value: T, order: readonly T[]): T[] {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return order.filter(item => next.has(item));
}

function EventLogPanel() {
    // Keep the theme subscription unconditional when switching list/detail views.
    const themeClassName = useDashboardThemeClassName("quest-ui-event-log-panel");
    const currentUserId = useStateFromStores([UserStore], () => UserStore?.getCurrentUser?.()?.id ?? null);
    const currentUsername = useStateFromStores([UserStore], () => UserStore?.getCurrentUser?.()?.username ?? null);
    const [events, setEvents] = useState<EventLogEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<EventLogCursor | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [source, setSource] = useState<"all" | EventLogSource>("all");
    const [accountScopes, setAccountScopes] = useState<EventLogAccountScope[]>(() => [...ALL_EVENT_LOG_ACCOUNT_SCOPES]);
    const [severities, setSeverities] = useState<EventLogSeverity[]>(() => [...ALL_EVENT_LOG_SEVERITIES]);
    const [categories, setCategories] = useState<EventLogCategory[]>(() => [...ALL_EVENT_LOG_CATEGORIES]);
    const [sort, setSort] = useState<EventLogSort>("newest");
    const [sortOpen, setSortOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [selected, setSelected] = useState<EventLogEvent | null>(null);
    const [clearCountdown, setClearCountdown] = useState<number | null>(null);
    const [clearing, setClearing] = useState(false);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [newEventsAvailable, setNewEventsAvailable] = useState(false);
    const [refreshNonce, setRefreshNonce] = useState(0);
    const [info, setInfo] = useState<EventLogStorageInfo>({ path: "", size: 0 });

    const sortButtonRef = useRef<HTMLButtonElement | null>(null);
    const filterButtonRef = useRef<HTMLButtonElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const requestGenerationRef = useRef(0);
    const queryIdentityRef = useRef<string | null>(null);
    const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadMoreArmedRef = useRef(true);
    const atHeadRef = useRef(true);

    const virtualRows = useMemo(() => buildVirtualRows(events), [events]);
    const accountUsernameById = useMemo(() => {
        const names = collectEventAccountUsernames(events);
        if (currentUserId && currentUsername) names.set(currentUserId, currentUsername);

        for (const event of events) {
            if (!event.accountId || names.has(event.accountId)) continue;
            try {
                const cachedUsername = UserStore?.getUser?.(event.accountId)?.username;
                if (typeof cachedUsername === "string" && cachedUsername.trim()) {
                    names.set(event.accountId, cachedUsername.trim());
                }
            } catch { }
        }
        return names;
    }, [events, currentUserId, currentUsername]);
    const accountScopeFilter: "all" | EventLogAccountScope[] = accountScopes.length === ALL_EVENT_LOG_ACCOUNT_SCOPES.length ? "all" : accountScopes;
    const severityFilter: "all" | EventLogSeverity[] = severities.length === ALL_EVENT_LOG_SEVERITIES.length ? "all" : severities;
    const categoryFilter: "all" | EventLogCategory[] = categories.length === ALL_EVENT_LOG_CATEGORIES.length ? "all" : categories;

    useEffect(() => {
        const generation = ++requestGenerationRef.current;
        const queryIdentity = JSON.stringify([query, source, accountScopeFilter, severityFilter, categoryFilter, sort, currentUserId]);
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
                queryEventLogPage({ query, source, accountScope: accountScopeFilter, currentAccountId: currentUserId, severity: severityFilter, category: categoryFilter, sort, pageSize: EVENT_LOG_PAGE_SIZE, includeLegacy: true }),
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
    }, [query, source, accountScopeFilter, severityFilter, categoryFilter, sort, currentUserId, refreshNonce]);

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

    const closeControlPopouts = () => {
        setSortOpen(false);
        setFilterOpen(false);
    };

    const selectSort = (mode: EventLogSort) => {
        setSort(mode);
        closeControlPopouts();
    };

    const toggleControlPopout = (control: "sort" | "filter") => {
        const next = control === "sort" ? !sortOpen : !filterOpen;
        closeControlPopouts();
        if (!next) return;
        if (control === "sort") setSortOpen(true);
        else setFilterOpen(true);
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
                accountScope: accountScopeFilter,
                currentAccountId: currentUserId,
                severity: severityFilter,
                category: categoryFilter,
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

    if (selected) {
        const selectedOwner = selected.accountId && selected.accountId !== currentUserId
            ? selected.accountUsername ?? accountUsernameById.get(selected.accountId) ?? null
            : null;
        return (
            <EventDetail
                event={selected}
                availableEvents={events}
                accountLabel={isLegacyUnscopedEvent(selected)
                    ? "Legacy · unscoped"
                    : selected.accountId !== currentUserId
                        ? selectedOwner ?? "Username unavailable"
                        : "Current account"}
                onBack={() => setSelected(null)}
            />
        );
    }

    const maxBytes = Number(info.maxBytes) || 0;
    const compactToBytes = Number(info.compactToBytes) || 0;
    const storageState = storageTone(info.size, maxBytes);
    const storageUsedLabel = formatStorageBytes(info.size);
    const storageLimitLabel = maxBytes > 0 ? formatStorageBytes(maxBytes) : null;
    const storageTitle = maxBytes > 0
        ? `Event Log storage: ${formatStorageBytes(info.size)} of ${formatStorageBytes(maxBytes)}. After exceeding the hard limit, QuestUI compacts the file toward ${formatStorageBytes(compactToBytes)}.`
        : `Event Log storage: ${formatStorageBytes(info.size)}.`;
    const matchState = matchingTone(total);
    const matchingLabel = `${total.toLocaleString()} matching`;
    const activeFilterCount = Number(source !== "all")
        + Number(accountScopes.length !== ALL_EVENT_LOG_ACCOUNT_SCOPES.length)
        + Number(severities.length !== ALL_EVENT_LOG_SEVERITIES.length)
        + Number(categories.length !== ALL_EVENT_LOG_CATEGORIES.length);

    const renderVirtualRow = (row: EventLogVirtualRow | undefined) => {
        if (!row) return null;
        if (row.kind === "day") return (
            <div className="quest-ui-event-day quest-ui-event-virtual-day">
                <CalendarDaysIcon />
                <span>{dayLabel(row.timestamp)}</span>
                <span className="quest-ui-event-day-line" aria-hidden="true" />
            </div>
        );

        const event = row.event;
        const eventCategory = inferEventCategory(event);
        const legacy = isLegacyUnscopedEvent(event);
        const accountChange = isAccountChangeEvent(event);
        const displaySeverity = visualSeverity(event);
        const accountUsername = !legacy && event.accountId && event.accountId !== currentUserId
            ? event.accountUsername ?? accountUsernameById.get(event.accountId) ?? null
            : null;
        return (
            <article className={`quest-ui-event-row is-${event.severity} is-category-${eventCategory}${accountChange ? " is-account-change" : ""}`}>
                <div className="quest-ui-event-time-cell">
                    <span className="quest-ui-event-time">{timeLabel(event.timestamp)}</span>
                    {accountUsername && <span className="quest-ui-event-account-name" title={accountUsername}>{accountUsername}</span>}
                </div>
                <span className={`quest-ui-event-severity is-${displaySeverity}`} aria-hidden="true"><SeverityIcon severity={displaySeverity} /></span>
                <div className="quest-ui-event-copy">
                    <div>
                        <span className={`quest-ui-event-source is-${event.source}`}>{sourceLabel(event.source)}</span>
                        <span className={`quest-ui-event-category is-${eventCategory}`}>{categoryLabel(eventCategory).toUpperCase()}</span>
                        {legacy && <span className="quest-ui-event-account-legacy" title="Recorded before account-aware Event Log; account owner is unknown">LEGACY</span>}
                        {event.quest?.name && <strong>{event.quest.name}</strong>}
                    </div>
                    <span><SemanticText text={eventListSummary(event)} /></span>
                </div>
                <div className="quest-ui-event-row-actions">
                    <button type="button" className="quest-ui-event-view-detail" onClick={() => setSelected(event)}>View details</button>
                    {(displaySeverity === "error" || displaySeverity === "warning") && (
                        <button type="button" className="quest-ui-event-row-bug" onClick={() => void copyDiagnosticReport(event, events)} title="Copy diagnostic report" aria-label="Copy diagnostic report"><BugLogIcon /></button>
                    )}
                </div>
            </article>
        );
    };

    return (
        <div className={themeClassName} role="dialog" aria-label="QuestUI Event Log">
            <div className="quest-ui-event-log-header">
                <div>
                    <strong>Event Log</strong>
                </div>
                <div className="quest-ui-event-log-header-meta">
                    {newEventsAvailable && <button type="button" className="quest-ui-event-new-events" onClick={() => setRefreshNonce(value => value + 1)}>New events</button>}
                    <span className={`quest-ui-event-storage is-${storageState}`} title={storageTitle} aria-label={storageTitle}>
                        <DatabaseIcon />
                        <span className="quest-ui-event-storage-used">{storageUsedLabel}</span>
                        {storageLimitLabel && (
                            <>
                                <span className="quest-ui-event-storage-separator" aria-hidden="true">/</span>
                                <span className="quest-ui-event-storage-limit">{storageLimitLabel}</span>
                            </>
                        )}
                    </span>
                </div>
            </div>

            <div className="quest-ui-event-search-shell">
                <SearchIcon />
                <input className="quest-ui-event-search" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search quest, event code, HTTP status…" />
                <span className={`quest-ui-event-match-count is-${matchState}`} title={matchingLabel}>{matchingLabel}</span>
            </div>

            <div className="quest-ui-event-log-actions">
                <div className="quest-ui-event-controls-main">
                    <Popout position="bottom" align="left" animation={Popout.Animation.NONE} shouldShow={sortOpen} onRequestClose={() => setSortOpen(false)} targetElementRef={sortButtonRef} renderPopout={() => <EventLogSortMenu mode={sort} onChange={selectSort} />}>
                        {(_, { isShown }) => (
                            <button
                                ref={sortButtonRef}
                                type="button"
                                className={`quest-ui-event-flat-control quest-ui-event-sort-trigger${isShown ? " is-open" : ""}`}
                                onClick={() => toggleControlPopout("sort")}
                                aria-label={`Sort Event Log: ${EVENT_LOG_SORT_OPTIONS.find(option => option.value === sort)?.label ?? "Newest first"}`}
                                aria-expanded={isShown}
                                aria-haspopup="menu"
                            >
                                <SortIcon />
                                <span>Sort: {EVENT_LOG_SORT_OPTIONS.find(option => option.value === sort)?.label ?? "Newest first"}</span>
                            </button>
                        )}
                    </Popout>

                    <Popout
                        position="bottom"
                        align="left"
                        animation={Popout.Animation.NONE}
                        shouldShow={filterOpen}
                        onRequestClose={() => setFilterOpen(false)}
                        targetElementRef={filterButtonRef}
                        renderPopout={() => (
                            <EventLogCombinedFilterMenu
                                source={source}
                                accountScopes={accountScopes}
                                severities={severities}
                                categories={categories}
                                onSourceChange={setSource}
                                onAccountScopeToggle={value => setAccountScopes(current => toggleOrderedSelection(current, value, ALL_EVENT_LOG_ACCOUNT_SCOPES))}
                                onSeverityToggle={value => setSeverities(current => toggleOrderedSelection(current, value, ALL_EVENT_LOG_SEVERITIES))}
                                onCategoryToggle={value => setCategories(current => toggleOrderedSelection(current, value, ALL_EVENT_LOG_CATEGORIES))}
                            />
                        )}
                    >
                        {(_, { isShown }) => (
                            <button
                                ref={filterButtonRef}
                                type="button"
                                className={`quest-ui-event-flat-control quest-ui-event-filter-launcher${isShown ? " is-open" : ""}${activeFilterCount > 0 ? " has-active-filter" : ""}`}
                                onClick={() => toggleControlPopout("filter")}
                                aria-label={`Filter Event Log${activeFilterCount > 0 ? `: ${activeFilterCount} active` : ""}`}
                                aria-expanded={isShown}
                                aria-haspopup="menu"
                            >
                                <FilterIcon />
                                <span>Filter</span>
                                {activeFilterCount > 0 && <span className="quest-ui-event-filter-count" aria-hidden="true">{activeFilterCount}</span>}
                            </button>
                        )}
                    </Popout>
                </div>

                <div className="quest-ui-event-action-island">
                    <button
                        type="button"
                        className="quest-ui-event-island-icon-button"
                        onClick={() => void openEventLogFolder()}
                        title="Open Event Log folder"
                        aria-label="Open Event Log folder"
                        disabled={clearing}
                    >
                        <FolderIcon />
                    </button>

                    <div className={`quest-ui-event-clean-island${clearCountdown != null || clearing ? " is-expanded" : ""}${clearing ? " is-clearing" : ""}`}>
                        <button
                            type="button"
                            className="quest-ui-event-clean-trigger"
                            title="Clear Event Log"
                            aria-label="Clear Event Log"
                            aria-expanded={clearCountdown != null || clearing}
                            disabled={clearing || clearCountdown != null}
                            onClick={() => {
                                if (clearing || clearCountdown != null) return;
                                setClearCountdown(5);
                            }}
                        >
                            <BroomIcon />
                        </button>

                        <div className="quest-ui-event-clear-confirm" role="status" aria-live="polite">
                            <span className="quest-ui-event-clear-confirm-text">
                                {clearing ? "Clearing…" : clearCountdown != null ? `Clear log? ${clearCountdown}s` : ""}
                            </span>
                            {!clearing && clearCountdown != null && (
                                <div className="quest-ui-event-clear-confirm-actions">
                                    <button
                                        type="button"
                                        className="quest-ui-event-clear-confirm-button is-confirm"
                                        title="Confirm clear"
                                        aria-label="Confirm clear Event Log"
                                        onClick={() => {
                                            setClearing(true);
                                            void clearEventLog().then(() => {
                                                setClearCountdown(null);
                                                showToast({ text: "Event Log cleared successfully.", variant: "success" });
                                                setRefreshNonce(value => value + 1);
                                            }).finally(() => setClearing(false));
                                        }}
                                    >
                                        <CheckIcon />
                                    </button>
                                    <button
                                        type="button"
                                        className="quest-ui-event-clear-confirm-button is-cancel"
                                        title="Cancel"
                                        aria-label="Cancel clear Event Log"
                                        onClick={() => setClearCountdown(null)}
                                    >
                                        <CloseIcon />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
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
                    rowHeight={row => virtualRowHeight(virtualRows[row], currentUserId)}
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

