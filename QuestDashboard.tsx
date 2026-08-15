import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { NavigationRouter, useState } from "@webpack/common";

import {
    attentionCounts,
    dashboardScopeFromSettings,
    expiryUrgency,
    filterQuests,
    formatExpiry,
    formatQuestProgress,
    sortDashboardQuests,
    useQuestSnapshot
} from "./questData";
import type { NormalizedQuest, QuestTaskType } from "./questData";
import settings from "./settings";

interface DiscordQuestCompletion {
    completedRatio: number;
    percentComplete: number;
    completedRatioDisplay: string;
}

// This is the native selector used by Discord Quest cards immediately before their
// progress ring. It owns both the ratio and the displayed text/rounding, including
// the achievement-specific progress/target representation.
const useDiscordQuestCompletion = findByCodeLazy(
    "completedRatioDisplay",
    "roundingMode:\"floor\"",
    "completedRatio"
) as (quest: any, forcePercent?: boolean) => DiscordQuestCompletion;

// Discord's own Orb image component used in Quest reward copy. It selects the proper
// themed Orb asset internally, so QuestUI does not maintain a copied/static Orb URL.
const DiscordOrbIcon = findComponentByCodeLazy("shouldUseThemeColor", "customSize", "loading");

function openQuestHome(closePopout?: () => void): void {
    closePopout?.();
    NavigationRouter.transitionTo("/quest-home");
}

function ArrowUpRightIcon() {
    return (
        <svg className="quest-ui-arrow-icon" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6.25 4.5h9.25v9.25h-1.75V7.49l-8.63 8.63-1.24-1.24 8.63-8.63H6.25V4.5Z" />
        </svg>
    );
}

function ProgressRing({ quest, completion }: { quest: NormalizedQuest; completion: DiscordQuestCompletion; }) {
    const ratio = Number.isFinite(completion?.completedRatio) ? completion.completedRatio : quest.progress / 100;
    const progress = Math.max(0, Math.min(100, ratio * 100));
    const display = completion?.completedRatioDisplay ?? `${Math.round(progress)}%`;
    const isClaimed = quest.status === "claimed";
    const isExpired = quest.status === "expired";

    return (
        <div
            className={`quest-ui-progress-ring quest-ui-progress-${quest.status}`}
            role="img"
            aria-label={isClaimed ? "Claimed" : isExpired ? "Expired" : `${display} complete`}
        >
            <svg viewBox="0 0 56 56" aria-hidden="true">
                <circle className="quest-ui-progress-track" cx="28" cy="28" r="21" pathLength="100" />
                {!isClaimed && !isExpired && (
                    <circle
                        className="quest-ui-progress-value"
                        cx="28"
                        cy="28"
                        r="21"
                        pathLength="100"
                        strokeDasharray="100"
                        strokeDashoffset={100 - progress}
                        transform="rotate(-90 28 28)"
                    />
                )}
            </svg>

            {isClaimed ? (
                <svg className="quest-ui-progress-state-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9.2 16.4 4.8 12l1.5-1.5 2.9 2.9 8.5-8.5 1.5 1.5Z" />
                </svg>
            ) : isExpired ? (
                <svg className="quest-ui-progress-state-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m7.1 5.7 4.9 4.9 4.9-4.9 1.4 1.4-4.9 4.9 4.9 4.9-1.4 1.4-4.9-4.9-4.9 4.9-1.4-1.4 4.9-4.9-4.9-4.9Z" />
                </svg>
            ) : (
                <span>{display}</span>
            )}
        </div>
    );
}

function TaskTypeGlyph({ type }: { type: QuestTaskType; }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            {type === "play" && (
                <path d="M7.2 7.25h9.6c2.52 0 4.45 2.2 4.1 4.7l-.55 3.9a2.8 2.8 0 0 1-4.8 1.55l-1.15-1.25H9.6L8.45 17.4a2.8 2.8 0 0 1-4.8-1.55l-.55-3.9c-.35-2.5 1.58-4.7 4.1-4.7Zm.55 3H6.4v1.35H5.05v1.3H6.4v1.35h1.35V12.9H9.1v-1.3H7.75v-1.35Zm8.85.6a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm2.25 2.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z" />
            )}
            {type === "stream" && (
                <path d="M4 4.75h16a1.75 1.75 0 0 1 1.75 1.75v10A1.75 1.75 0 0 1 20 18.25h-6.2v1.5h2.45v1.5h-8.5v-1.5h2.45v-1.5H4a1.75 1.75 0 0 1-1.75-1.75v-10A1.75 1.75 0 0 1 4 4.75Zm0 1.75v10h16v-10H4Z" />
            )}
            {type === "video" && (
                <><circle cx="12" cy="12" r="9" /><path className="quest-ui-task-icon-cutout" d="m10 8 6 4-6 4Z" /></>
            )}
            {type === "activity" && (
                <><circle cx="12" cy="12" r="9" /><circle className="quest-ui-task-icon-cutout" cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1.6" /></>
            )}
            {type === "other" && (
                <path d="m12 2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
            )}
        </svg>
    );
}

function QuestArtwork({ quest, type }: { quest: NormalizedQuest; type: QuestTaskType; }) {
    return (
        <div className="quest-ui-artwork" aria-hidden="true">
            <div className="quest-ui-artwork-fallback"><TaskTypeGlyph type={type} /></div>
            {quest.imageUrl && (
                <img
                    className="quest-ui-artwork-image"
                    src={quest.imageUrl}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    onError={event => { event.currentTarget.style.display = "none"; }}
                />
            )}
            <span className={`quest-ui-type-badge quest-ui-type-badge-${type}`}>
                <TaskTypeGlyph type={type} />
            </span>
        </div>
    );
}

function OrbGlyph() {
    return <DiscordOrbIcon shouldUseThemeColor customSize={15} className="quest-ui-orb-glyph" />;
}

function statusLabel(status: NormalizedQuest["status"]): string {
    if (status === "in-progress") return "In progress";
    if (status === "claimable") return "Ready to claim";
    if (status === "claimed") return "Claimed";
    if (status === "expired") return "Expired";
    return "Available";
}

function QuestCard({ quest }: { quest: NormalizedQuest; }) {
    // This hook is deliberately called for every card and is the exact selector used
    // by Discord's Quest card before rendering its progress ring and progress text.
    const completion = useDiscordQuestCompletion(quest.rawQuest);
    const expiry = formatExpiry(quest.expiresAt);
    const urgency = expiryUrgency(quest.expiresAt);
    const taskType = quest.primaryTask?.type ?? quest.tasks[0]?.type ?? "other";
    const progressCopy = formatQuestProgress(quest);
    const showProgressCopy = quest.status !== "claimable" && quest.status !== "claimed";

    return (
        <article className={`quest-ui-card quest-ui-card-${quest.status}`}>
            <QuestArtwork quest={quest} type={taskType} />

            <div className="quest-ui-card-main">
                <strong className="quest-ui-card-title" title={quest.name}>{quest.name}</strong>

                <div className="quest-ui-card-status-line">
                    <span className="quest-ui-card-status-dot" aria-hidden="true" />
                    <span className="quest-ui-card-status">{statusLabel(quest.status)}</span>
                    {showProgressCopy && (
                        <>
                            <span className="quest-ui-card-separator" aria-hidden="true">•</span>
                            <span className="quest-ui-card-progress-text">{progressCopy}</span>
                        </>
                    )}
                </div>

                <div className="quest-ui-card-meta-row">
                    <span className={`quest-ui-card-reward quest-ui-reward-${quest.reward.kind}`}>
                        <span>Reward:</span>
                        {quest.reward.kind === "orbs" && <OrbGlyph />}
                        <strong>{quest.reward.label}</strong>
                    </span>
                    {expiry && (
                        <span className={`quest-ui-card-expiry quest-ui-expiry-${urgency}`}>
                            {expiry}
                        </span>
                    )}
                </div>
            </div>

            <ProgressRing quest={quest} completion={completion} />
        </article>
    );
}

function DashboardSummary({ quests }: { quests: NormalizedQuest[]; }) {
    const counts = attentionCounts(quests);
    const attentionTotal = counts.inProgress + counts.claimable + counts.available;

    if (attentionTotal === 0) {
        return (
            <span className="quest-ui-summary-empty">
                {quests.length > 0 ? `${quests.length} visible ${quests.length === 1 ? "quest" : "quests"}` : "No quests need attention"}
            </span>
        );
    }

    return (
        <div className="quest-ui-dashboard-summary">
            {counts.inProgress > 0 && <span className="quest-ui-summary-in-progress">{counts.inProgress} In Progress</span>}
            {counts.claimable > 0 && <span className="quest-ui-summary-claimable">{counts.claimable} Ready to Claim</span>}
            {counts.available > 0 && <span className="quest-ui-summary-available">{counts.available} Available</span>}
        </div>
    );
}

function EmptyStateIllustration() {
    return (
        <div className="quest-ui-empty-illustration" aria-hidden="true">
            <svg viewBox="0 0 160 92">
                <path className="quest-ui-empty-cloud" d="M27 68h106a15 15 0 0 0 0-30 24 24 0 0 0-44-10 31 31 0 0 0-55 17A12 12 0 0 0 27 68Z" />
                <circle className="quest-ui-empty-orb" cx="79" cy="46" r="22" />
                <path className="quest-ui-empty-face" d="M68 45h4v4h-4Zm18 0h4v4h-4Zm-17 11c6 5 15 5 21 0" />
                <path className="quest-ui-empty-spark" d="m29 24 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm103-8 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" />
            </svg>
        </div>
    );
}

export function QuestDashboard({ closePopout }: { closePopout?: () => void; }) {
    settings.use([
        "dashboardShowAvailable",
        "dashboardShowInProgress",
        "dashboardShowClaimable",
        "dashboardShowClaimed",
        "dashboardShowExpired",
        "dashboardRewardFilter",
        "dashboardIncludeUnknownRewards",
        "dashboardShowPlay",
        "dashboardShowStream",
        "dashboardShowVideo",
        "dashboardShowActivity",
        "dashboardShowOther"
    ]);

    const quests = useQuestSnapshot();
    const [showAll, setShowAll] = useState(false);
    const filtered = filterQuests(quests, dashboardScopeFromSettings(settings.store));
    const visible = sortDashboardQuests(showAll ? quests : filtered);
    const hiddenCount = Math.max(0, quests.length - filtered.length);

    return (
        <section className="quest-ui-dashboard" role="dialog" aria-label="Quest dashboard">
            <header className="quest-ui-dashboard-header">
                <div className="quest-ui-dashboard-heading">
                    <div className="quest-ui-dashboard-title-row">
                        <strong className="quest-ui-dashboard-title">Quests</strong>
                        {showAll && <span className="quest-ui-dashboard-mode-label">Showing all</span>}
                    </div>
                    <DashboardSummary quests={showAll ? quests : filtered} />
                </div>

                <button
                    type="button"
                    className="quest-ui-dashboard-icon-button"
                    onClick={() => openQuestHome(closePopout)}
                    aria-label="Open Discord Quest Home"
                    title="Open Discord Quest Home"
                >
                    <ArrowUpRightIcon />
                </button>
            </header>

            <div className="quest-ui-dashboard-content">
                {visible.length > 0 ? (
                    <>
                        {visible.map(quest => <QuestCard key={quest.id} quest={quest} />)}

                        {!showAll && hiddenCount > 0 && (
                            <button type="button" className="quest-ui-dashboard-secondary-action" onClick={() => setShowAll(true)}>
                                Show {hiddenCount} filtered {hiddenCount === 1 ? "quest" : "quests"}
                            </button>
                        )}

                        {showAll && hiddenCount > 0 && (
                            <button type="button" className="quest-ui-dashboard-secondary-action" onClick={() => setShowAll(false)}>
                                Use Dashboard filters
                            </button>
                        )}
                    </>
                ) : (
                    <div className="quest-ui-dashboard-empty">
                        <EmptyStateIllustration />
                        <strong>No quests match your filters</strong>
                        {hiddenCount > 0
                            ? <span>{hiddenCount} other available {hiddenCount === 1 ? "quest is" : "quests are"} hidden.</span>
                            : <span>No Quest data is currently available in Discord.</span>}

                        {hiddenCount > 0 && (
                            <div className="quest-ui-dashboard-empty-actions">
                                <button type="button" className="quest-ui-dashboard-primary-action" onClick={() => setShowAll(true)}>
                                    Show All
                                </button>
                                <button type="button" className="quest-ui-dashboard-empty-home" onClick={() => openQuestHome(closePopout)}>
                                    Open Quest Home <ArrowUpRightIcon />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {visible.length > 0 && (
                <footer className="quest-ui-dashboard-footer">
                    <button type="button" className="quest-ui-dashboard-open-home" onClick={() => openQuestHome(closePopout)}>
                        Open Quest Home <ArrowUpRightIcon />
                    </button>
                </footer>
            )}
        </section>
    );
}
