import { useSettings } from "@api/Settings";
import { findByCodeLazy } from "@webpack";
import { useEffect, useState } from "@webpack/common";

import { useQuestOrbMultiplierState } from "../orbs/multiplier";
import { effectiveOrbRewardAmount } from "../orbs/rewards";
import { OrionIntegrationStatus } from "../orion/OrionStatus";
import { getOrionControlSnapshot, getOrionIntegrationHealth, subscribeOrionControlState } from "../orion/integration";
import { QuestOrbBalance } from "../orbs/QuestOrbBalance";
import { QUESTUI_VERSION } from "../plugin/version";
import settings from "../plugin/settings";
import { useClaimAllBatchActive } from "../quests/actions/ClaimAllControl";
import { useIgnoredQuests } from "../quests/ignored/runtime";
import { dashboardScopeFromSettings, filterQuests, questStatusCounts, useQuestSnapshot } from "../quests/data";
import type { NormalizedQuest } from "../quests/data";
import { DashboardUpdateNotice } from "../updates/UpdateCenter";
import { versionChannelClass } from "../updates/channel";
import { QuestCard } from "./QuestCard";
import { normalizeDashboardSortMode, sortDashboardQuests } from "./sort";
import { DASHBOARD_SETTING_KEYS, clearDashboardFilters, partitionIgnored } from "./state";

const QuestIcon = findByCodeLazy("\"M7.5 21.7a8.95");

function DashboardSummary({ quests, hiddenCount, ignoredCount }: {
    quests: NormalizedQuest[];
    hiddenCount: number;
    ignoredCount: number;
}) {
    const counts = questStatusCounts(quests);

    return (
        <div className="quest-ui-dashboard-summary" aria-label="Quest status summary">
            <span className="quest-ui-summary-available">{counts.available} Available</span>
            <span className="quest-ui-summary-claimable">{counts.claimable} Ready</span>
            <span className="quest-ui-summary-in-progress">{counts.inProgress} In Progress</span>
            <span className="quest-ui-summary-claimed">{counts.claimed} Claimed</span>
            <span className="quest-ui-summary-expired">{counts.expired} Expired</span>
            <span className="quest-ui-summary-ignored">{ignoredCount} Ignored</span>
            <span className="quest-ui-summary-hidden">{hiddenCount} Hidden</span>
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
    const dashboardSettings = settings.use([...DASHBOARD_SETTING_KEYS]);
    const { orionIntegration } = settings.use(["orionIntegration"]);
    useSettings(["plugins.OrionQuests.enabled"]);
    const [, setOrionRevision] = useState(0);
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
    const catalogue = dashboardSettings.dashboardShowIgnored === true ? partition.ignored : [];
    const filtered = [...filteredNormal, ...catalogue];
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
    const hiddenCount = Math.max(0, partition.normal.length - filteredNormal.length);
    const ignoredCount = partition.ignored.length;

    return (
        <section className="quest-ui-dashboard" role="dialog" aria-label="Quest dashboard">
            <header className="quest-ui-dashboard-header">
                <div className="quest-ui-dashboard-header-row">
                    <div className="quest-ui-dashboard-heading">
                        <div className="quest-ui-dashboard-title-row">
                            <strong className="quest-ui-dashboard-title">Quests</strong>
                        </div>
                        <DashboardSummary quests={partition.normal} hiddenCount={hiddenCount} ignoredCount={ignoredCount} />
                    </div>
                </div>
                <div className="quest-ui-dashboard-meta-row">
                    <div className="quest-ui-dashboard-meta-primary">
                        <OrionIntegrationStatus health={orionHealth} engineRunning={orionSnapshot?.running ?? null} />
                        <div className="quest-ui-meta-product">
                            <span>QuestUI</span>
                            <span className={`quest-ui-version-chip quest-ui-version-chip-questui ${versionChannelClass(QUESTUI_VERSION)}`}>{QUESTUI_VERSION}</span>
                            <DashboardUpdateNotice />
                        </div>
                    </div>
                    <QuestOrbBalance closePopout={closePopout} />
                </div>
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

