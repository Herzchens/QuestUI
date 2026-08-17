import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { NavigationRouter, Popout, ThemeStore, UserStore, useRef, useState, useStateFromStores } from "@webpack/common";

import { QuestCardActions } from "./QuestCardActions";
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

interface DiscordQuestAsset {
    url: string;
    mimetype?: string | null;
    isAnimated: boolean;
}

type DiscordQuestAssetKind = "game_tile" | "quest_bar_hero_image" | "hero_image";
type QuestTheme = "dark" | "light";

const QuestIcon = findByCodeLazy("\"M7.5 21.7a8.95");

// This is the native selector used by Discord Quest cards immediately before their
// progress ring. It owns both the ratio and the displayed text/rounding, including
// the achievement-specific progress/target representation.
const useDiscordQuestCompletion = findByCodeLazy(
    "completedRatioDisplay",
    "roundingMode:\"floor\"",
    "completedRatio"
) as (quest: any, forcePercent?: boolean) => DiscordQuestCompletion;

// Discord Quest asset values are asset keys, not ready-to-use URLs. This is Discord's
// own resolver that turns GAME_TILE/HERO keys into the themed CDN URL used by Quest UI.
const getDiscordQuestAsset = findByCodeLazy(
    "\"game_tile\"",
    "\"quest_bar_hero\"",
    "\"video_player_thumbnail\""
) as (quest: any, assetKind: DiscordQuestAssetKind, theme?: QuestTheme) => DiscordQuestAsset | null;

// Discord's own Orb image component used in Quest reward copy. It selects the proper
// themed Orb asset internally, so QuestUI does not maintain a copied/static Orb URL.
const DiscordOrbIcon = findComponentByCodeLazy("shouldUseThemeColor", "customSize", "loading");

const DASHBOARD_SETTING_KEYS = [
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
] as const;

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

function FilterIcon() {
    return (
        <svg className="quest-ui-filter-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.5 5.25A1.25 1.25 0 0 1 4.75 4h14.5a1.25 1.25 0 0 1 .96 2.05l-5.46 6.52v4.68a1.25 1.25 0 0 1-.58 1.05l-3 1.9A1.25 1.25 0 0 1 9.25 19v-6.43L3.79 6.05a1.25 1.25 0 0 1-.29-.8Zm2.2.25 5.05 6.03v6.1l2.5-1.58v-4.52L18.3 5.5H5.7Z" />
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

function resolveQuestArtwork(quest: NormalizedQuest, theme: QuestTheme): string | null {
    const candidates: DiscordQuestAssetKind[] = ["game_tile", "quest_bar_hero_image", "hero_image"];
    for (const assetKind of candidates) {
        try {
            const asset = getDiscordQuestAsset(quest.rawQuest, assetKind, theme);
            if (asset?.url) return asset.url;
        } catch { }
    }
    return null;
}

function QuestArtwork({ quest, type }: { quest: NormalizedQuest; type: QuestTaskType; }) {
    const theme = useStateFromStores([ThemeStore], () => ThemeStore.theme === "light" ? "light" : "dark");
    const imageUrl = resolveQuestArtwork(quest, theme);

    return (
        <div className="quest-ui-artwork" aria-hidden="true">
            <div className="quest-ui-artwork-fallback"><TaskTypeGlyph type={type} /></div>
            {imageUrl && (
                <img
                    className="quest-ui-artwork-image"
                    src={imageUrl}
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

function orbRewardTier(quantity: number): "standard" | "large" | "boosted" {
    if (quantity >= 800) return "boosted";
    if (quantity >= 500) return "large";
    return "standard";
}

const NITRO_ORB_MULTIPLIER_START = Date.UTC(2026, 4, 8);

function hasEligibleNitroOrbMultiplier(): boolean {
    const user = UserStore?.getCurrentUser?.();
    if (!user || user.premiumType !== 2) return false;

    // Nitro Basic is premiumType 3 and is already excluded above. Discord marks
    // credit-only/fractional Nitro separately; those accounts are not multiplier-eligible.
    if (user.isFractionalPremiumWithNoSubscription?.()) return false;
    return true;
}

function effectiveOrbQuantity(quest: NormalizedQuest, hasNitroMultiplier: boolean): number {
    const quantity = quest.reward.orbQuantity;
    if (!hasNitroMultiplier || quest.reward.kind !== "orbs" || quantity <= 0) return quantity;

    const startsAt = new Date(quest.rawQuest?.config?.startsAt ?? 0).getTime();
    if (!Number.isFinite(startsAt) || startsAt < NITRO_ORB_MULTIPLIER_START) return quantity;

    return Math.round(quantity * 1.2);
}

function statusLabel(status: NormalizedQuest["status"]): string {
    if (status === "in-progress") return "In progress";
    if (status === "claimable") return "Ready to claim";
    if (status === "claimed") return "Claimed";
    if (status === "expired") return "Expired";
    return "Available";
}

function QuestCard({ quest }: { quest: NormalizedQuest; }) {
    const completion = useDiscordQuestCompletion(quest.rawQuest);
    const expiry = formatExpiry(quest.expiresAt);
    const urgency = expiryUrgency(quest.expiresAt);
    const taskType = quest.primaryTask?.type ?? quest.tasks[0]?.type ?? "other";
    const progressCopy = formatQuestProgress(quest);
    const showProgressCopy = quest.status !== "claimable" && quest.status !== "claimed";
    const hasNitroMultiplier = useStateFromStores([UserStore], hasEligibleNitroOrbMultiplier);
    const orbQuantity = effectiveOrbQuantity(quest, hasNitroMultiplier);
    const rewardTier = quest.reward.kind === "orbs" ? orbRewardTier(orbQuantity) : null;
    const rewardLabel = quest.reward.kind === "orbs" && orbQuantity > 0
        ? `${orbQuantity.toLocaleString()} Orbs`
        : quest.reward.label;

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
                    <span className={`quest-ui-card-reward quest-ui-reward-${quest.reward.kind}${rewardTier ? ` quest-ui-orb-${rewardTier}` : ""}`}>
                        <span>Reward:</span>
                        {quest.reward.kind === "orbs" && <OrbGlyph />}
                        <strong>{rewardLabel}</strong>
                    </span>
                    <QuestCardActions quest={quest} />
                </div>
            </div>

            <div className="quest-ui-card-side">
                <ProgressRing quest={quest} completion={completion} />
                {expiry && (
                    <span className={`quest-ui-card-expiry quest-ui-expiry-${urgency}`} title={expiry}>
                        {expiry}
                    </span>
                )}
            </div>
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

function dashboardFilterCount(store: any): number {
    let count = 0;
    if (store.dashboardShowAvailable === false) count++;
    if (store.dashboardShowInProgress === false) count++;
    if (store.dashboardShowClaimable === false) count++;
    if (store.dashboardShowClaimed !== true) count++;
    if (store.dashboardShowExpired !== true) count++;
    if (store.dashboardRewardFilter !== "all") count++;
    if (store.dashboardRewardFilter !== "all" && store.dashboardIncludeUnknownRewards === false) count++;
    if (store.dashboardShowPlay === false) count++;
    if (store.dashboardShowStream === false) count++;
    if (store.dashboardShowVideo === false) count++;
    if (store.dashboardShowActivity === false) count++;
    if (store.dashboardShowOther === false) count++;
    return count;
}

function clearDashboardFilters(): void {
    settings.store.dashboardShowAvailable = true;
    settings.store.dashboardShowInProgress = true;
    settings.store.dashboardShowClaimable = true;
    settings.store.dashboardShowClaimed = true;
    settings.store.dashboardShowExpired = true;
    settings.store.dashboardRewardFilter = "all";
    settings.store.dashboardIncludeUnknownRewards = true;
    settings.store.dashboardShowPlay = true;
    settings.store.dashboardShowStream = true;
    settings.store.dashboardShowVideo = true;
    settings.store.dashboardShowActivity = true;
    settings.store.dashboardShowOther = true;
}

function restoreRecommendedFilters(): void {
    settings.store.dashboardShowAvailable = true;
    settings.store.dashboardShowInProgress = true;
    settings.store.dashboardShowClaimable = true;
    settings.store.dashboardShowClaimed = false;
    settings.store.dashboardShowExpired = false;
    settings.store.dashboardRewardFilter = "all";
    settings.store.dashboardIncludeUnknownRewards = true;
    settings.store.dashboardShowPlay = true;
    settings.store.dashboardShowStream = true;
    settings.store.dashboardShowVideo = true;
    settings.store.dashboardShowActivity = true;
    settings.store.dashboardShowOther = true;
}

function DashboardFilters({ hiddenCount }: { hiddenCount: number; }) {
    const store = settings.store;

    return (
        <div className="quest-ui-filter-panel" role="group" aria-label="Quest filters">
            <div className="quest-ui-filter-panel-heading">
                <div>
                    <strong>Filters</strong>
                    <span>{hiddenCount > 0 ? `${hiddenCount} ${hiddenCount === 1 ? "quest" : "quests"} hidden` : "All matching quests are visible"}</span>
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
                    <FilterChip active={store.dashboardShowInProgress !== false} label="In Progress" tone="warning" onClick={() => { store.dashboardShowInProgress = store.dashboardShowInProgress === false; }} />
                    <FilterChip active={store.dashboardShowClaimable !== false} label="Ready" tone="positive" onClick={() => { store.dashboardShowClaimable = store.dashboardShowClaimable === false; }} />
                    <FilterChip active={store.dashboardShowClaimed === true} label="Claimed" tone="brand" onClick={() => { store.dashboardShowClaimed = store.dashboardShowClaimed !== true; }} />
                    <FilterChip active={store.dashboardShowExpired === true} label="Expired" onClick={() => { store.dashboardShowExpired = store.dashboardShowExpired !== true; }} />
                </div>
            </div>

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

            <div className="quest-ui-filter-panel-footer">
                <label className={`quest-ui-filter-unknown${store.dashboardRewardFilter === "all" ? " is-disabled" : ""}`}>
                    <input
                        type="checkbox"
                        checked={store.dashboardIncludeUnknownRewards !== false}
                        disabled={store.dashboardRewardFilter === "all"}
                        onChange={event => { store.dashboardIncludeUnknownRewards = event.currentTarget.checked; }}
                    />
                    Include unknown reward formats
                </label>
            </div>
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
    const quests = useQuestSnapshot();
    const filterButtonRef = useRef<HTMLButtonElement | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const filtered = filterQuests(quests, dashboardScopeFromSettings(dashboardSettings));
    const visible = sortDashboardQuests(filtered);
    const hiddenCount = Math.max(0, quests.length - filtered.length);
    const activeFilterCount = dashboardFilterCount(dashboardSettings);

    return (
        <section className="quest-ui-dashboard" role="dialog" aria-label="Quest dashboard">
            <header className="quest-ui-dashboard-header">
                <div className="quest-ui-dashboard-header-row">
                    <div className="quest-ui-dashboard-heading">
                        <div className="quest-ui-dashboard-title-row">
                            <strong className="quest-ui-dashboard-title">Quests</strong>
                        </div>
                        <DashboardSummary quests={filtered} />
                    </div>

                    <Popout
                        position="bottom"
                        align="right"
                        animation={Popout.Animation.NONE}
                        shouldShow={filtersOpen}
                        onRequestClose={() => setFiltersOpen(false)}
                        targetElementRef={filterButtonRef}
                        renderPopout={() => <DashboardFilters hiddenCount={hiddenCount} />}
                    >
                        {(_, { isShown }) => (
                            <button
                                ref={filterButtonRef}
                                type="button"
                                className={`quest-ui-filter-button${isShown ? " is-open" : ""}${activeFilterCount > 0 ? " is-active" : ""}`}
                                onClick={() => setFiltersOpen(open => !open)}
                                aria-label={activeFilterCount > 0 ? `Quest filters, ${activeFilterCount} active` : "Quest filters, off"}
                                aria-expanded={isShown}
                                title={activeFilterCount > 0 ? `${activeFilterCount} active filters` : "Filters off"}
                            >
                                <FilterIcon />
                                {activeFilterCount > 0 && <span className="quest-ui-filter-count" aria-hidden="true">{activeFilterCount > 9 ? "9+" : activeFilterCount}</span>}
                            </button>
                        )}
                    </Popout>
                </div>
            </header>

            <div className="quest-ui-dashboard-content">
                {visible.length > 0 ? (
                    visible.map(quest => <QuestCard key={quest.id} quest={quest} />)
                ) : (
                    <div className="quest-ui-dashboard-empty">
                        <EmptyStateIllustration />
                        <strong>No quests match your filters</strong>
                        {hiddenCount > 0
                            ? <span>{hiddenCount} other {hiddenCount === 1 ? "quest is" : "quests are"} currently hidden.</span>
                            : <span>No Quest data is currently available in Discord.</span>}

                        {hiddenCount > 0 && (
                            <div className="quest-ui-dashboard-empty-actions">
                                <button type="button" className="quest-ui-dashboard-primary-action" onClick={clearDashboardFilters}>
                                    Clear Filters
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
