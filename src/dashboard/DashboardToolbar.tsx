import { NavigationRouter, Popout, useRef, useState } from "@webpack/common";

import settings from "../plugin/settings";
import { useIgnoredQuests } from "../quests/ignored/runtime";
import { dashboardScopeFromSettings, filterQuests, useQuestSnapshot } from "../quests/data";
import { normalizeDashboardSortMode, type DashboardSortMode } from "./sort";
import {
    DASHBOARD_SETTING_KEYS,
    clearDashboardFilters,
    dashboardFilterCount,
    partitionIgnored,
    restoreRecommendedFilters
} from "./state";

function openQuestHome(closePopout?: () => void): void {
    closePopout?.();
    NavigationRouter.transitionTo("/quest-home");
}

function QuestHomeIcon() {
    return (
        <svg className="quest-ui-home-glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.2 10.6 12 2.8l8.8 7.8" />
            <path d="M5.7 13.7v3.4A3.9 3.9 0 0 0 9.6 21h4.8a3.9 3.9 0 0 0 3.9-3.9v-3.4" />
        </svg>
    );
}

function FilterIcon() {
    return (
        <svg className="quest-ui-filter-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.5 5.25A1.25 1.25 0 0 1 4.75 4h14.5a1.25 1.25 0 0 1 .96 2.05l-5.46 6.52v4.68a1.25 1.25 0 0 1-.58 1.05l-3 1.9A1.25 1.25 0 0 1 9.25 19v-6.43L3.79 6.05a1.25 1.25 0 0 1-.29-.8Zm2.2.25 5.05 6.03v6.1l2.5-1.58v-4.52L18.3 5.5H5.7Z" />
        </svg>
    );
}

function SortIcon() {
    return (
        <svg className="quest-ui-sort-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4 3.5 7.5 5 9l1-1v9.5H8V8l1 1 1.5-1.5L7 4Zm10 16 3.5-3.5L19 15l-1 1V6.5h-2V16l-1-1-1.5 1.5L17 20Z" />
        </svg>
    );
}

function FilterChip({ active, label, tone, onClick }: {
    active: boolean;
    label: string;
    tone?: "danger" | "warning" | "positive" | "brand";
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={`quest-ui-filter-chip${active ? " is-selected" : ""}${tone ? ` quest-ui-filter-chip-${tone}` : ""}`}
            aria-pressed={active}
            onClick={onClick}
        >
            <span className="quest-ui-filter-chip-check" aria-hidden="true">✓</span>
            {label}
        </button>
    );
}


function DashboardFilters({ hiddenCount, ignoredCount }: { hiddenCount: number; ignoredCount: number; }) {
    const store = settings.store;
    const expiredAgeDays = Math.max(0, Math.floor(Number(store.dashboardExpiredAgeDays ?? 15)) || 0);
    const expiredAgePresets = [7, 15, 30, 90, 0] as const;
    const customExpiredAge = expiredAgeDays > 0 && !expiredAgePresets.includes(expiredAgeDays as any)
        ? String(expiredAgeDays)
        : "";
    const visibilityCopy = hiddenCount > 0 || ignoredCount > 0
        ? `${hiddenCount} hidden by filters · ${ignoredCount} ignored`
        : "All matching quests are visible";

    return (
        <div className="quest-ui-filter-panel" role="group" aria-label="Quest filters">
            <div className="quest-ui-filter-panel-heading">
                <div>
                    <strong>Filters</strong>
                    <span>{visibilityCopy}</span>
                </div>
                <div className="quest-ui-filter-panel-actions">
                    <button type="button" className="quest-ui-filter-reset" onClick={restoreRecommendedFilters}>Recommended</button>
                    <button type="button" className="quest-ui-filter-clear" onClick={clearDashboardFilters}>Clear all</button>
                </div>
            </div>

            <div className="quest-ui-filter-section">
                <span className="quest-ui-filter-label">Status</span>
                <div className="quest-ui-filter-chips">
                    <FilterChip active={store.dashboardShowAvailable !== false} label="Available" tone="danger" onClick={() => { store.dashboardShowAvailable = store.dashboardShowAvailable === false; }} />
                    <FilterChip active={store.dashboardShowClaimable !== false} label="Ready" tone="positive" onClick={() => { store.dashboardShowClaimable = store.dashboardShowClaimable === false; }} />
                    <FilterChip active={store.dashboardShowInProgress !== false} label="In Progress" tone="warning" onClick={() => { store.dashboardShowInProgress = store.dashboardShowInProgress === false; }} />
                    <FilterChip active={store.dashboardShowClaimed === true} label="Claimed" tone="brand" onClick={() => { store.dashboardShowClaimed = store.dashboardShowClaimed !== true; }} />
                    <FilterChip active={store.dashboardShowExpired === true} label="Expired" onClick={() => { store.dashboardShowExpired = store.dashboardShowExpired !== true; }} />
                    <FilterChip active={store.dashboardShowIgnored === true} label={`Ignored (${ignoredCount})`} onClick={() => { store.dashboardShowIgnored = store.dashboardShowIgnored !== true; }} />
                </div>
            </div>

            {store.dashboardShowExpired === true && (
                <div className="quest-ui-filter-section quest-ui-expired-age-section">
                    <span className="quest-ui-filter-label">Expired age</span>
                    <div className="quest-ui-filter-chips quest-ui-expired-age-chips">
                        <FilterChip active={expiredAgeDays === 7} label="7d" onClick={() => { store.dashboardExpiredAgeDays = 7; }} />
                        <FilterChip active={expiredAgeDays === 15} label="15d" onClick={() => { store.dashboardExpiredAgeDays = 15; }} />
                        <FilterChip active={expiredAgeDays === 30} label="30d" onClick={() => { store.dashboardExpiredAgeDays = 30; }} />
                        <FilterChip active={expiredAgeDays === 90} label="90d" onClick={() => { store.dashboardExpiredAgeDays = 90; }} />
                        <FilterChip active={expiredAgeDays === 0} label="All" onClick={() => { store.dashboardExpiredAgeDays = 0; }} />
                        <label className={`quest-ui-expired-age-custom${customExpiredAge ? " is-selected" : ""}`}>
                            <span>Custom</span>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                inputMode="numeric"
                                placeholder="days"
                                value={customExpiredAge}
                                onChange={event => {
                                    const days = Math.floor(Number(event.currentTarget.value));
                                    if (Number.isFinite(days) && days > 0) store.dashboardExpiredAgeDays = days;
                                }}
                                aria-label="Custom expired Quest age in days"
                            />
                        </label>
                    </div>
                </div>
            )}

            <div className="quest-ui-filter-section quest-ui-filter-section-row">
                <span className="quest-ui-filter-label">Reward</span>
                <div className="quest-ui-filter-chips">
                    <FilterChip active={store.dashboardRewardFilter === "all"} label="All" onClick={() => { store.dashboardRewardFilter = "all"; }} />
                    <FilterChip active={store.dashboardRewardFilter === "orbs"} label="Orbs" tone="brand" onClick={() => { store.dashboardRewardFilter = "orbs"; }} />
                    <FilterChip active={store.dashboardRewardFilter === "non-orbs"} label="Other" onClick={() => { store.dashboardRewardFilter = "non-orbs"; }} />
                </div>
            </div>

            <div className="quest-ui-filter-section">
                <span className="quest-ui-filter-label">Quest type</span>
                <div className="quest-ui-filter-chips">
                    <FilterChip active={store.dashboardShowPlay !== false} label="Play" onClick={() => { store.dashboardShowPlay = store.dashboardShowPlay === false; }} />
                    <FilterChip active={store.dashboardShowStream !== false} label="Stream" onClick={() => { store.dashboardShowStream = store.dashboardShowStream === false; }} />
                    <FilterChip active={store.dashboardShowVideo !== false} label="Video" onClick={() => { store.dashboardShowVideo = store.dashboardShowVideo === false; }} />
                    <FilterChip active={store.dashboardShowActivity !== false} label="Activity" onClick={() => { store.dashboardShowActivity = store.dashboardShowActivity === false; }} />
                    <FilterChip active={store.dashboardShowOther !== false} label="Other" onClick={() => { store.dashboardShowOther = store.dashboardShowOther === false; }} />
                </div>
            </div>

        </div>
    );
}

const DASHBOARD_SORT_OPTIONS: ReadonlyArray<{ value: DashboardSortMode; label: string; }> = [
    { value: "recommended", label: "Recommended" },
    { value: "expiring", label: "Expiring Soon" },
    { value: "orb-reward", label: "Highest Orb Reward" },
    { value: "required-time-asc", label: "Shortest Required Time" },
    { value: "required-time-desc", label: "Longest Required Time" },
    { value: "name-asc", label: "Name A → Z" },
    { value: "name-desc", label: "Name Z → A" }
];

function DashboardSorts({ mode, onChange }: { mode: DashboardSortMode; onChange: (mode: DashboardSortMode) => void; }) {
    return (
        <div className="quest-ui-sort-panel" role="menu" aria-label="Sort quests">
            <div className="quest-ui-sort-panel-heading">
                <strong>Sort Quests</strong>
                <span>Choose how cards are ordered</span>
            </div>
            <div className="quest-ui-sort-options">
                {DASHBOARD_SORT_OPTIONS.map(option => (
                    <button
                        key={option.value}
                        type="button"
                        className={option.value === mode ? "is-selected" : ""}
                        role="menuitemradio"
                        aria-checked={option.value === mode}
                        onClick={() => onChange(option.value)}
                    >
                        <span>{option.label}</span>
                        {option.value === mode && <span className="quest-ui-sort-check" aria-hidden="true">✓</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}


export function QuestDashboardToolbar({ closePopout }: { closePopout?: () => void; }) {
    const dashboardSettings = settings.use([...DASHBOARD_SETTING_KEYS]);
    const quests = useQuestSnapshot();
    const { ids: ignoredIds } = useIgnoredQuests();
    const partition = partitionIgnored(quests, ignoredIds);
    const filtered = filterQuests(partition.normal, dashboardScopeFromSettings(dashboardSettings));
    const hiddenCount = Math.max(0, partition.normal.length - filtered.length);
    const ignoredCount = partition.ignored.length;
    const activeFilterCount = dashboardFilterCount(dashboardSettings);
    const sortMode = normalizeDashboardSortMode(dashboardSettings.dashboardSortMode);
    const filterButtonRef = useRef<HTMLButtonElement | null>(null);
    const sortButtonRef = useRef<HTMLButtonElement | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);

    const selectSort = (mode: DashboardSortMode) => {
        settings.store.dashboardSortMode = mode;
        setSortOpen(false);
    };

    return (
        <div className="quest-ui-dashboard-local-tools">
            <Popout
                position="bottom"
                align="right"
                animation={Popout.Animation.NONE}
                shouldShow={sortOpen}
                onRequestClose={() => setSortOpen(false)}
                targetElementRef={sortButtonRef}
                renderPopout={() => <DashboardSorts mode={sortMode} onChange={selectSort} />}
            >
                {(_, { isShown }) => (
                    <button
                        ref={sortButtonRef}
                        type="button"
                        className={`quest-ui-toolbar-button quest-ui-sort-button${isShown ? " is-open" : ""}${sortMode !== "recommended" ? " is-active" : ""}`}
                        onClick={() => {
                            setFiltersOpen(false);
                            setSortOpen(open => !open);
                        }}
                        aria-label={`Sort quests: ${DASHBOARD_SORT_OPTIONS.find(option => option.value === sortMode)?.label ?? "Recommended"}`}
                        aria-expanded={isShown}
                        title={`Sort: ${DASHBOARD_SORT_OPTIONS.find(option => option.value === sortMode)?.label ?? "Recommended"}`}
                    >
                        <SortIcon />
                    </button>
                )}
            </Popout>

            <Popout
                position="bottom"
                align="right"
                animation={Popout.Animation.NONE}
                shouldShow={filtersOpen}
                onRequestClose={() => setFiltersOpen(false)}
                targetElementRef={filterButtonRef}
                renderPopout={() => <DashboardFilters hiddenCount={hiddenCount} ignoredCount={ignoredCount} />}
            >
                {(_, { isShown }) => (
                    <button
                        ref={filterButtonRef}
                        type="button"
                        className={`quest-ui-toolbar-button quest-ui-filter-button${isShown ? " is-open" : ""}${activeFilterCount > 0 ? " is-active" : ""}`}
                        onClick={() => {
                            setSortOpen(false);
                            setFiltersOpen(open => !open);
                        }}
                        aria-label={activeFilterCount > 0 ? `Quest filters, ${activeFilterCount} active` : "Quest filters, off"}
                        aria-expanded={isShown}
                        title={activeFilterCount > 0 ? `${activeFilterCount} active filters` : "Filters off"}
                    >
                        <FilterIcon />
                        {activeFilterCount > 0 && <span className="quest-ui-filter-count" aria-hidden="true">{activeFilterCount > 9 ? "9+" : activeFilterCount}</span>}
                    </button>
                )}
            </Popout>

            <button
                type="button"
                className="quest-ui-toolbar-button quest-ui-home-button"
                onClick={() => openQuestHome(closePopout)}
                aria-label="Open Quest Home"
                title="Open Quest Home"
            >
                <QuestHomeIcon />
            </button>
        </div>
    );
}

