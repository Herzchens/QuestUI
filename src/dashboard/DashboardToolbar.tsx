import { plugins } from "@api/PluginManager";
import { openPluginModal } from "@components/settings";
import { NavigationRouter, Popout, useRef, useState } from "@webpack/common";

import settings from "../plugin/settings";
import { useDashboardThemeClassName } from "../themes/runtime";
import { useIgnoredQuests } from "../quests/ignored/runtime";
import { useQuestSnapshot } from "../quests/data";
import {
    DASHBOARD_REWARD_PRESET_OPTIONS,
    REWARD_DETAIL_OPTIONS,
    dashboardRewardKindsForPreset,
    normalizeDashboardRewardPreset,
    serializeDashboardRewardKinds,
    type DashboardRewardPreset,
    type RewardKind
} from "../quests/rewardFilters";
import { DASHBOARD_SORT_OPTIONS, normalizeDashboardSortMode, type DashboardSortMode } from "./sort";
import { DashboardChoiceMenu } from "./DashboardChoiceMenu";
import {
    DASHBOARD_SETTING_KEYS,
    dashboardFilterCount,
    partitionIgnored
} from "./state";

function openQuestHome(closePopout?: () => void): void {
    closePopout?.();
    NavigationRouter.transitionTo("/quest-home");
}

function openDiscordShop(closePopout?: () => void): void {
    closePopout?.();
    NavigationRouter.transitionTo("/shop");
}

function openPluginSettings(pluginName: "QuestUI" | "OrionQuests", closePopout?: () => void): void {
    const plugin = plugins[pluginName];
    if (!plugin) return;

    closePopout?.();
    openPluginModal(plugin);
}

function MarketIcon() {
    return (
        <svg className="quest-ui-market-glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9.2V20h16V9.2" />
            <path d="M3 9.2 5.2 4h13.6L21 9.2" />
            <path d="M3 9.2c0 1.55 1.15 2.8 2.6 2.8s2.6-1.25 2.6-2.8c0 1.55 1.15 2.8 2.6 2.8s2.6-1.25 2.6-2.8c0 1.55 1.15 2.8 2.6 2.8s2.6-1.25 2.6-2.8" />
            <path d="M9 20v-5h6v5" />
        </svg>
    );
}

function QuestHomeIcon() {
    return (
        <svg className="quest-ui-home-glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.2 10.6 12 2.8l8.8 7.8" />
            <path d="M5.7 13.7v3.4A3.9 3.9 0 0 0 9.6 21h4.8a3.9 3.9 0 0 0 3.9-3.9v-3.4" />
        </svg>
    );
}

function QuestUISettingsIcon() {
    return (
        <svg
            className="quest-ui-plugin-settings-glyph"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065" />
            <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0" />
        </svg>
    );
}

function FilterIcon() {
    return (
        <svg
            className="quest-ui-filter-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M5 3v8" />
            <circle cx="5" cy="15" r="2" />
            <path d="M5 19v2" />
            <path d="M12 3v2" />
            <circle cx="12" cy="9" r="2" />
            <path d="M12 13v8" />
            <path d="M19 3v8" />
            <circle cx="19" cy="15" r="2" />
            <path d="M19 19v2" />
        </svg>
    );
}

function SortIcon() {
    return (
        <svg
            className="quest-ui-sort-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M5 4v16" />
            <path d="m2.5 17.5 2.5 2.5 2.5-2.5" />
            <path d="M11 7h9" />
            <path d="M11 12h7" />
            <path d="M11 17h5" />
        </svg>
    );
}

function FilterCheckRow({ checked, label, tone, onClick }: {
    checked: boolean;
    label: string;
    tone?: "available" | "ready" | "progress" | "claimed" | "expired" | "ignored";
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={`quest-ui-filter-list-row${checked ? " is-checked" : ""}${tone ? ` is-${tone}` : ""}`}
            aria-pressed={checked}
            onClick={onClick}
        >
            <span className="quest-ui-filter-list-box" aria-hidden="true">
                {checked && (
                    <svg viewBox="0 0 16 16">
                        <path d="m3.2 8.2 3 3 6.6-6.6" />
                    </svg>
                )}
            </span>
            <span>{label}</span>
        </button>
    );
}

function FilterRadioRow({ checked, label, onClick }: {
    checked: boolean;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={`quest-ui-filter-list-row is-radio${checked ? " is-checked" : ""}`}
            role="radio"
            aria-checked={checked}
            onClick={onClick}
        >
            <span className="quest-ui-filter-list-box" aria-hidden="true">
                {checked && <span className="quest-ui-filter-list-radio-dot" />}
            </span>
            <span>{label}</span>
        </button>
    );
}

const EXPIRED_HISTORY_OPTIONS = [
    { days: 7, label: "7d" },
    { days: 15, label: "15d" },
    { days: 30, label: "30d" },
    { days: 90, label: "90d" },
    { days: 0, label: "All" }
] as const;

function expiredHistoryOptionIndex(days: number): number {
    const exact = EXPIRED_HISTORY_OPTIONS.findIndex(option => option.days === days);
    if (exact >= 0) return exact;

    const bounded = EXPIRED_HISTORY_OPTIONS.findIndex(option => option.days > 0 && days <= option.days);
    return bounded >= 0 ? bounded : EXPIRED_HISTORY_OPTIONS.length - 1;
}

function ExpiredHistorySteps({ value, onChange }: {
    value: number;
    onChange: (index: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement | null>(null);

    const indexFromPointer = (clientX: number): number => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0) return value;

        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const lastIndex = EXPIRED_HISTORY_OPTIONS.length - 1;
        return Math.max(0, Math.min(lastIndex, Math.round(ratio * lastIndex)));
    };

    const updateFromPointer = (clientX: number) => {
        const next = indexFromPointer(clientX);
        if (next !== value) onChange(next);
    };

    return (
        <div
            className="quest-ui-history-steps"
            style={{ "--quest-ui-history-step": value } as any}
        >
            <div
                ref={trackRef}
                className="quest-ui-history-steps-track"
                onPointerDown={event => {
                    if (event.button !== 0) return;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    updateFromPointer(event.clientX);
                }}
                onPointerMove={event => {
                    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
                    updateFromPointer(event.clientX);
                }}
                onPointerUp={event => {
                    event.currentTarget.releasePointerCapture?.(event.pointerId);
                }}
                onPointerCancel={event => {
                    event.currentTarget.releasePointerCapture?.(event.pointerId);
                }}
            >
                <span className="quest-ui-history-steps-line" aria-hidden="true" />
                <span className="quest-ui-history-steps-fill" aria-hidden="true" />
                <div className="quest-ui-history-steps-nodes" role="radiogroup" aria-label="Expired Quest history">
                    {EXPIRED_HISTORY_OPTIONS.map(({ label }, index) => {
                        const selected = index === value;
                        const reached = index <= value;
                        return (
                            <button
                                key={label}
                                type="button"
                                className={`${reached ? "is-reached" : ""}${reached && selected ? " " : ""}${selected ? "is-selected" : ""}`}
                                role="radio"
                                aria-checked={selected}
                                aria-label={label === "All" ? "All expired Quest history" : `Expired Quests from the last ${label}`}
                                onClick={() => onChange(index)}
                                onKeyDown={event => {
                                    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                                        event.preventDefault();
                                        onChange(Math.max(0, value - 1));
                                    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                                        event.preventDefault();
                                        onChange(Math.min(EXPIRED_HISTORY_OPTIONS.length - 1, value + 1));
                                    } else if (event.key === "Home") {
                                        event.preventDefault();
                                        onChange(0);
                                    } else if (event.key === "End") {
                                        event.preventDefault();
                                        onChange(4);
                                    }
                                }}
                            >
                                <span className="quest-ui-history-step-node" aria-hidden="true">
                                    <span />
                                </span>
                                <span className="quest-ui-history-step-label">{label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function DashboardFilters({ ignoredCount }: { ignoredCount: number; }) {
    const store = settings.store;
    const expiredAgeDays = Math.max(0, Math.floor(Number(store.dashboardExpiredAgeDays ?? 0)) || 0);
    const rewardPreset = normalizeDashboardRewardPreset(store.dashboardRewardPreset);
    const activeRewardKinds = dashboardRewardKindsForPreset(rewardPreset, store.dashboardRewardCustomKinds);
    const activeRewardKindSet = new Set(activeRewardKinds);

    const selectRewardPreset = (preset: DashboardRewardPreset) => {
        store.dashboardRewardPreset = preset;
    };

    const toggleRewardKind = (kind: RewardKind) => {
        const next = new Set(activeRewardKinds);
        if (next.has(kind)) next.delete(kind);
        else next.add(kind);

        store.dashboardRewardCustomKinds = serializeDashboardRewardKinds(Array.from(next));
        store.dashboardRewardPreset = "custom";
    };

    const expiredAgeSliderIndex = expiredHistoryOptionIndex(expiredAgeDays);

    return (
        <div className={useDashboardThemeClassName("quest-ui-filter-list", "quest-ui-dashboard-menu-surface")} role="group" aria-label="Quest filters">
            <div className="quest-ui-filter-list-scroll">
                <section className="quest-ui-filter-list-section">
                    <h3>Status</h3>
                    <div className="quest-ui-filter-list-options is-status">
                    <FilterCheckRow checked={store.dashboardShowAvailable !== false} label="Available" tone="available" onClick={() => { store.dashboardShowAvailable = store.dashboardShowAvailable === false; }} />
                    <FilterCheckRow checked={store.dashboardShowClaimable !== false} label="Ready" tone="ready" onClick={() => { store.dashboardShowClaimable = store.dashboardShowClaimable === false; }} />
                    <FilterCheckRow checked={store.dashboardShowInProgress !== false} label="In Progress" tone="progress" onClick={() => { store.dashboardShowInProgress = store.dashboardShowInProgress === false; }} />
                    <FilterCheckRow checked={store.dashboardShowClaimed === true} label="Claimed" tone="claimed" onClick={() => { store.dashboardShowClaimed = store.dashboardShowClaimed !== true; }} />
                    <FilterCheckRow checked={store.dashboardShowExpired === true} label="Expired" tone="expired" onClick={() => { store.dashboardShowExpired = store.dashboardShowExpired !== true; }} />
                    <FilterCheckRow
                        checked={store.dashboardShowIgnored === true}
                        label={`Ignored (${ignoredCount})`}
                        tone="ignored"
                        onClick={() => { store.dashboardShowIgnored = store.dashboardShowIgnored !== true; }}
                    />
                    </div>
                </section>

                {store.dashboardShowExpired === true && (
                    <section className="quest-ui-filter-list-section">
                        <h3>Expired History</h3>
                        <ExpiredHistorySteps
                            value={expiredAgeSliderIndex}
                            onChange={index => {
                                store.dashboardExpiredAgeDays = EXPIRED_HISTORY_OPTIONS[index]?.days ?? 0;
                            }}
                        />
                    </section>
                )}

                <section className="quest-ui-filter-list-section is-reward-section">
                    <h3>Reward</h3>
                    <div className="quest-ui-reward-filter-stack">
                        <div className="quest-ui-filter-list-options is-radio-options is-reward-presets" role="radiogroup" aria-label="Reward preset">
                            {DASHBOARD_REWARD_PRESET_OPTIONS.map(option => (
                                <FilterRadioRow
                                    key={option.value}
                                    checked={rewardPreset === option.value}
                                    label={option.label}
                                    onClick={() => selectRewardPreset(option.value)}
                                />
                            ))}
                        </div>
                        <div className="quest-ui-reward-detail-divider" aria-hidden="true" />
                        <div className="quest-ui-filter-list-options is-reward-details" role="group" aria-label="Detailed reward types">
                            {REWARD_DETAIL_OPTIONS.map(option => (
                                <FilterCheckRow
                                    key={option.value}
                                    checked={activeRewardKindSet.has(option.value)}
                                    label={option.label}
                                    onClick={() => toggleRewardKind(option.value)}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                <section className="quest-ui-filter-list-section">
                    <h3>Quest Type</h3>
                    <div className="quest-ui-filter-list-options is-quest-type">
                    <FilterCheckRow checked={store.dashboardShowPlay !== false} label="Play" onClick={() => { store.dashboardShowPlay = store.dashboardShowPlay === false; }} />
                    <FilterCheckRow checked={store.dashboardShowStream !== false} label="Stream" onClick={() => { store.dashboardShowStream = store.dashboardShowStream === false; }} />
                    <FilterCheckRow checked={store.dashboardShowVideo !== false} label="Video" onClick={() => { store.dashboardShowVideo = store.dashboardShowVideo === false; }} />
                    <FilterCheckRow checked={store.dashboardShowActivity !== false} label="Activity" onClick={() => { store.dashboardShowActivity = store.dashboardShowActivity === false; }} />
                    <FilterCheckRow checked={store.dashboardShowOther !== false} label="Other" onClick={() => { store.dashboardShowOther = store.dashboardShowOther === false; }} />
                    </div>
                </section>
            </div>

        </div>
    );
}

export function QuestDashboardFilterSortControls() {
    const dashboardSettings = settings.use([...DASHBOARD_SETTING_KEYS]);
    const quests = useQuestSnapshot();
    const { ids: ignoredIds } = useIgnoredQuests();
    const partition = partitionIgnored(quests, ignoredIds);
    const ignoredCount = partition.ignored.length;
    const activeFilterCount = dashboardFilterCount(dashboardSettings);
    const sortMode = normalizeDashboardSortMode(dashboardSettings.dashboardSortMode);
    const filterButtonRef = useRef<HTMLButtonElement | null>(null);
    const sortButtonRef = useRef<HTMLButtonElement | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    const sortLabel = DASHBOARD_SORT_OPTIONS.find(option => option.value === sortMode)?.label ?? "Expiring Soon";

    const selectSort = (mode: DashboardSortMode) => {
        settings.store.dashboardSortMode = mode;
        setSortOpen(false);
    };

    return (
        <div className="quest-ui-dashboard-filter-tools">
            <h2 className="quest-ui-dashboard-list-title">Quest List</h2>
            <Popout
                position="bottom"
                align="right"
                animation={Popout.Animation.NONE}
                shouldShow={sortOpen}
                onRequestClose={() => setSortOpen(false)}
                targetElementRef={sortButtonRef}
                renderPopout={() => <DashboardChoiceMenu title="Sort by" ariaLabel="Sort quests" options={DASHBOARD_SORT_OPTIONS} selectedValue={sortMode} onSelect={selectSort} />}
            >
                {(_, { isShown }) => (
                    <button
                        ref={sortButtonRef}
                        type="button"
                        className={`quest-ui-dashboard-filter-control quest-ui-sort-button${isShown ? " is-open" : ""}${sortMode !== "expiring" ? " is-active" : ""}`}
                        onClick={() => {
                            setFiltersOpen(false);
                            setSortOpen(open => !open);
                        }}
                        aria-label={`Sort quests: ${sortLabel}`}
                        aria-expanded={isShown}
                        title={`Sort: ${sortLabel}`}
                    >
                        <SortIcon />
                        <span>Sort: {sortLabel}</span>
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
                renderPopout={() => <DashboardFilters ignoredCount={ignoredCount} />}
            >
                {(_, { isShown }) => (
                    <button
                        ref={filterButtonRef}
                        type="button"
                        className={`quest-ui-dashboard-filter-control quest-ui-filter-button${isShown ? " is-open" : ""}${activeFilterCount > 0 ? " is-active" : ""}`}
                        onClick={() => {
                            setSortOpen(false);
                            setFiltersOpen(open => !open);
                        }}
                        aria-label={activeFilterCount > 0 ? `Quest filters, ${activeFilterCount} active` : "Quest filters, off"}
                        aria-expanded={isShown}
                        title={activeFilterCount > 0 ? `${activeFilterCount} active filters` : "Filters off"}
                    >
                        <FilterIcon />
                        <span>Filter</span>
                        {activeFilterCount > 0 && (
                            <span className="quest-ui-filter-count-badge" aria-hidden="true">{activeFilterCount}</span>
                        )}
                    </button>
                )}
            </Popout>
        </div>
    );
}

export function QuestPluginSettingsControl({
    pluginName,
    title,
    closePopout
}: {
    pluginName: "QuestUI" | "OrionQuests";
    title: string;
    closePopout?: () => void;
}) {
    if (!plugins[pluginName]) return null;

    return (
        <button
            type="button"
            className="quest-ui-status-settings-button"
            onClick={() => openPluginSettings(pluginName, closePopout)}
            aria-label={title}
            title={title}
        >
            <QuestUISettingsIcon />
        </button>
    );
}

export function QuestDashboardMarketControl({ closePopout }: { closePopout?: () => void; }) {
    return (
        <button
            type="button"
            className="quest-ui-toolbar-button quest-ui-market-button"
            onClick={() => openDiscordShop(closePopout)}
            aria-label="Open Discord Shop"
            title="Open Discord Shop"
        >
            <MarketIcon />
        </button>
    );
}

export function QuestDashboardHomeControl({ closePopout }: { closePopout?: () => void; }) {
    return (
        <button
            type="button"
            className="quest-ui-toolbar-button quest-ui-home-button"
            onClick={() => openQuestHome(closePopout)}
            aria-label="Open Quest Home"
            title="Open Quest Home"
        >
            <QuestHomeIcon />
        </button>
    );
}

