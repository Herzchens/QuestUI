import { useSettings } from "@api/Settings";
import { findByCodeLazy } from "@webpack";
import { useEffect, useState } from "@webpack/common";

import { useQuestOrbMultiplierState } from "../orbs/multiplier";
import { effectiveOrbRewardAmount } from "../orbs/rewards";
import { OrionIntegrationStatus } from "../orion/OrionStatus";
import { getOrionControlSnapshot, getOrionIntegrationHealth, subscribeOrionControlState } from "../orion/integration";
import { QUESTUI_VERSION } from "../plugin/version";
import settings from "../plugin/settings";
import { useClaimAllBatchActive } from "../quests/actions/ClaimAllControl";
import { useIgnoredQuests } from "../quests/ignored/runtime";
import { dashboardScopeFromSettings, filterQuests, questStatusCounts, useQuestSnapshot } from "../quests/data";
import type { NormalizedQuest } from "../quests/data";
import { DashboardProductUpdateNotice } from "../updates/UpdateCenter";
import { versionChannelClass } from "../updates/channel";
import { QuestCard } from "./QuestCard";
import { QuestDashboardFilterSortControls, QuestPluginSettingsControl } from "./DashboardToolbar";
import { normalizeDashboardSortMode, sortDashboardQuests } from "./sort";
import { DASHBOARD_SETTING_KEYS, clearDashboardFilters, ensureDashboardV16FilterDefaults, partitionIgnored } from "./state";

const QuestIcon = findByCodeLazy("\"M7.5 21.7a8.95");

type DashboardSummaryView =
    | "all"
    | "available"
    | "claimable"
    | "in-progress"
    | "claimed"
    | "expired"
    | "ignored"
    | "hidden";

function DashboardSummaryChip({
    view,
    label,
    count,
    selected,
    onSelect
}: {
    view: DashboardSummaryView;
    label: string;
    count: number;
    selected: boolean;
    onSelect: (view: DashboardSummaryView) => void;
}) {
    return (
        <button
            type="button"
            className={`quest-ui-summary-chip quest-ui-summary-${view}${selected ? " is-selected" : ""}`}
            aria-pressed={selected}
            onClick={() => onSelect(view)}
        >
            <span className="quest-ui-summary-chip-dot" aria-hidden="true" />
            <span className="quest-ui-summary-chip-label">{label}</span>
            <span className="quest-ui-summary-chip-count">{count}</span>
        </button>
    );
}

function DashboardSummary({
    quests,
    totalCount,
    hiddenCount,
    ignoredCount,
    selectedView,
    onSelect
}: {
    quests: NormalizedQuest[];
    totalCount: number;
    hiddenCount: number;
    ignoredCount: number;
    selectedView: DashboardSummaryView | null;
    onSelect: (view: DashboardSummaryView) => void;
}) {
    const counts = questStatusCounts(quests);

    const chips: Array<{ view: DashboardSummaryView; label: string; count: number; }> = [
        { view: "all", label: "All", count: totalCount },
        { view: "available", label: "Available", count: counts.available },
        { view: "claimable", label: "Ready", count: counts.claimable },
        { view: "in-progress", label: "In Progress", count: counts.inProgress },
        { view: "claimed", label: "Claimed", count: counts.claimed },
        { view: "expired", label: "Expired", count: counts.expired },
        { view: "ignored", label: "Ignored", count: ignoredCount },
        { view: "hidden", label: "Hidden", count: hiddenCount }
    ];

    return (
        <div className="quest-ui-dashboard-summary" aria-label="Quest status summary">
            {chips.map(chip => (
                <DashboardSummaryChip
                    key={chip.view}
                    {...chip}
                    selected={selectedView === chip.view}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}

function EmptyStateIllustration() {
    return (
        <div className="quest-ui-empty-illustration" aria-hidden="true">
            <div className="quest-ui-empty-quest-icon">
                <QuestIcon />
            </div>
        </div>
    );
}

export function QuestDashboard({ closePopout }: { closePopout?: () => void; }) {
    useEffect(() => {
        ensureDashboardV16FilterDefaults();
    }, []);

    const dashboardSettings = settings.use([...DASHBOARD_SETTING_KEYS]);
    const { orionIntegration } = settings.use(["orionIntegration"]);
    useSettings(["plugins.OrionQuests.enabled"]);
    const [, setOrionRevision] = useState(0);
    const [showHiddenOnly, setShowHiddenOnly] = useState(false);
    const claimBatchActive = useClaimAllBatchActive();
    const quests = useQuestSnapshot();
    const orbMultiplier = useQuestOrbMultiplierState();
    const { ids: ignoredIds } = useIgnoredQuests();
    const partition = partitionIgnored(quests, ignoredIds);
    const orionHealth = getOrionIntegrationHealth(orionIntegration === true);
    const orionSnapshot = orionHealth.kind === "connected" ? getOrionControlSnapshot() : null;

    useEffect(() => {
        if (orionIntegration !== true || orionHealth.kind !== "connected") return;
        const refresh = () => setOrionRevision(revision => revision + 1);
        const unsubscribe = subscribeOrionControlState(refresh);
        return () => unsubscribe?.();
    }, [orionIntegration, orionHealth.kind]);

    const filteredNormal = filterQuests(partition.normal, dashboardScopeFromSettings(dashboardSettings));
    const visibleNormalIds = new Set(filteredNormal.map(quest => quest.id));
    const hiddenNormal = partition.normal.filter(quest => !visibleNormalIds.has(quest.id));
    const catalogue = dashboardSettings.dashboardShowIgnored === true ? partition.ignored : [];
    const filtered = showHiddenOnly ? hiddenNormal : [...filteredNormal, ...catalogue];
    const sortMode = normalizeDashboardSortMode(dashboardSettings.dashboardSortMode);
    const visible = sortDashboardQuests(
        filtered,
        sortMode,
        quest => quest.reward.kind === "orbs"
            ? effectiveOrbRewardAmount(
                { base: quest.reward.orbQuantity, boosted: quest.reward.boostedOrbQuantity },
                orbMultiplier.receivesBoost
            )
            : 0
    );
    const hiddenCount = hiddenNormal.length;
    const ignoredCount = partition.ignored.length;

    const normalStatusFlags = {
        available: dashboardSettings.dashboardShowAvailable !== false,
        "in-progress": dashboardSettings.dashboardShowInProgress !== false,
        claimable: dashboardSettings.dashboardShowClaimable !== false,
        claimed: dashboardSettings.dashboardShowClaimed === true,
        expired: dashboardSettings.dashboardShowExpired === true
    };
    const normalEnabledCount = Object.values(normalStatusFlags).filter(Boolean).length;
    const selectedSummaryView: DashboardSummaryView | null = showHiddenOnly
        ? "hidden"
        : normalEnabledCount === 5
            && dashboardSettings.dashboardShowIgnored === true
            && Number(dashboardSettings.dashboardExpiredAgeDays ?? 0) === 0
            ? "all"
            : normalEnabledCount === 0 && dashboardSettings.dashboardShowIgnored === true
                ? "ignored"
                : normalEnabledCount === 1 && dashboardSettings.dashboardShowIgnored !== true
                    ? normalStatusFlags.available
                        ? "available"
                        : normalStatusFlags.claimable
                            ? "claimable"
                            : normalStatusFlags["in-progress"]
                                ? "in-progress"
                                : normalStatusFlags.claimed
                                    ? "claimed"
                                    : normalStatusFlags.expired
                                        ? "expired"
                                        : null
                    : null;

    const selectSummaryView = (view: DashboardSummaryView) => {
        if (view === "hidden") {
            setShowHiddenOnly(true);
            return;
        }

        setShowHiddenOnly(false);
        clearDashboardFilters();
        if (view === "all") return;

        settings.store.dashboardShowAvailable = view === "available";
        settings.store.dashboardShowInProgress = view === "in-progress";
        settings.store.dashboardShowClaimable = view === "claimable";
        settings.store.dashboardShowClaimed = view === "claimed";
        settings.store.dashboardShowExpired = view === "expired";
        settings.store.dashboardShowIgnored = view === "ignored";
    };

    return (
        <section className="quest-ui-dashboard" role="dialog" aria-label="Quest dashboard">
            <header className="quest-ui-dashboard-header">
                <div className="quest-ui-default-status-strip">
                    <div className="quest-ui-default-status-product is-orion">
                        <div className="quest-ui-default-status-identity">
                            <div className="quest-ui-default-status-identity-row">
                                <strong className="quest-ui-default-status-name">Orion Quest</strong>
                                {orionHealth.installedVersion && (
                                    <span className={`quest-ui-version-chip quest-ui-version-chip-orion ${versionChannelClass(orionHealth.installedVersion)}`}>
                                        {orionHealth.installedVersion}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="quest-ui-default-status-state">
                            <OrionIntegrationStatus
                                health={orionHealth}
                                engineRunning={orionSnapshot?.running ?? null}
                                compact
                                hideVersion
                            />
                            <DashboardProductUpdateNotice product="orion" />
                        </div>
                        <QuestPluginSettingsControl
                            pluginName="OrionQuests"
                            title="Orion Quest Settings"
                            closePopout={closePopout}
                        />
                    </div>

                    <span
                        className={`quest-ui-status-bridge ${orionHealth.kind === "connected" ? "is-connected" : "is-disconnected"}`}
                        role="img"
                        aria-label={orionHealth.kind === "connected" ? "QuestUI is linked to OrionQuests" : "QuestUI is not linked to OrionQuests"}
                    >
                        <span className="quest-ui-status-bridge-line" />
                        <span className="quest-ui-status-bridge-node" />
                        <span className="quest-ui-status-bridge-line" />
                    </span>

                    <div className="quest-ui-default-status-product is-questui">
                        <div className="quest-ui-default-status-identity">
                            <div className="quest-ui-default-status-identity-row">
                                <strong className="quest-ui-default-status-name">QuestUI</strong>
                                <span className={`quest-ui-version-chip quest-ui-version-chip-questui ${versionChannelClass(QUESTUI_VERSION)}`}>
                                    {QUESTUI_VERSION}
                                </span>
                            </div>
                        </div>
                        <div className="quest-ui-default-status-state">
                            <DashboardProductUpdateNotice product="questui" />
                        </div>
                        <QuestPluginSettingsControl
                            pluginName="QuestUI"
                            title="QuestUI Settings"
                            closePopout={closePopout}
                        />
                    </div>
                </div>
                <DashboardSummary
                    quests={partition.normal}
                    totalCount={quests.length}
                    hiddenCount={hiddenCount}
                    ignoredCount={ignoredCount}
                    selectedView={selectedSummaryView}
                    onSelect={selectSummaryView}
                />
                <QuestDashboardFilterSortControls />
            </header>

            <div className="quest-ui-dashboard-content">
                {visible.length > 0 ? (
                    visible.map(quest => (
                        <QuestCard
                            key={quest.id}
                            quest={quest}
                            orionSnapshot={orionSnapshot}
                            ignored={ignoredIds.has(quest.id)}
                            receivesOrbBoost={orbMultiplier.receivesBoost}
                            claimBatchActive={claimBatchActive}
                        />
                    ))
                ) : (
                    <div className="quest-ui-dashboard-empty">
                        <EmptyStateIllustration />
                        <strong>{ignoredCount > 0 && hiddenCount === 0 ? "No visible quests" : "No quests match your filters"}</strong>
                        {hiddenCount > 0
                            ? <span>{hiddenCount} other {hiddenCount === 1 ? "quest is" : "quests are"} currently hidden by filters.</span>
                            : ignoredCount > 0 && dashboardSettings.dashboardShowIgnored !== true
                                ? <span>{ignoredCount} {ignoredCount === 1 ? "quest is" : "quests are"} ignored in QuestUI.</span>
                                : <span>No Quest data is currently available in Discord.</span>}

                        {(hiddenCount > 0 || (ignoredCount > 0 && dashboardSettings.dashboardShowIgnored !== true)) && (
                            <div className="quest-ui-dashboard-empty-actions">
                                {hiddenCount > 0 && (
                                    <button type="button" className="quest-ui-dashboard-primary-action" onClick={clearDashboardFilters}>
                                        Clear Filters
                                    </button>
                                )}
                                {ignoredCount > 0 && dashboardSettings.dashboardShowIgnored !== true && (
                                    <button
                                        type="button"
                                        className="quest-ui-dashboard-primary-action"
                                        onClick={() => { settings.store.dashboardShowIgnored = true; }}
                                    >
                                        Show Ignored
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

