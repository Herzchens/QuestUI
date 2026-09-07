import { useSettings } from "@api/Settings";
import { findByCodeLazy } from "@webpack";
import { NavigationRouter, Popout, ThemeStore, UserStore, useRef, useState, useStateFromStores } from "@webpack/common";

import { getOrionIntegrationHealth } from "./orionIntegration";
import { OrionIntegrationStatus } from "./OrionStatus";
import { QuestCardActions } from "./QuestCardActions";
import { QuestOrbBalance } from "./QuestOrbBalance";
import { QuestOrbIcon } from "./QuestOrbIcon";
import {
    attentionCounts,
    dashboardScopeFromSettings,
    expiryUrgency,
    filterQuests,
    formatExpiry,
    formatQuestProgress,
    questStatusCounts,
    useQuestSnapshot
} from "./questData";
import type { NormalizedQuest, QuestTaskType } from "./questData";
import { normalizeDashboardSortMode, sortDashboardQuests, type DashboardSortMode } from "./dashboardSortLogic";
import { QUESTUI_VERSION } from "./version";
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
type QuestProgressTone = "starting" | "building" | "mid" | "advanced" | "near-complete";

interface TimedProgressParts {
    prefix: string;
    current: string;
    suffix: string;
}

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

const DASHBOARD_SETTING_KEYS = [
    "dashboardShowAvailable",
    "dashboardShowInProgress",
    "dashboardShowClaimable",
    "dashboardShowClaimed",
    "dashboardShowExpired",
    "dashboardExpiredAgeDays",
    "dashboardRewardFilter",
    "dashboardIncludeUnknownRewards",
    "dashboardShowPlay",
    "dashboardShowStream",
    "dashboardShowVideo",
    "dashboardShowActivity",
    "dashboardShowOther",
    "dashboardSortMode"
] as const;

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
                <>
                    <path d="M7.2 6.8h9.6a4.48 4.48 0 0 1 4.42 3.75l.72 4.42a2.86 2.86 0 0 1-4.68 2.7l-2.4-1.92H9.14l-2.4 1.92a2.86 2.86 0 0 1-4.68-2.7l.72-4.42A4.48 4.48 0 0 1 7.2 6.8Z" />
                    <path className="quest-ui-task-icon-cutout" d="M7.1 9h1.45v1.45H10v1.45H8.55v1.45H7.1V11.9H5.65v-1.45H7.1V9Z" />
                    <circle className="quest-ui-task-icon-cutout" cx="16" cy="9.7" r=".72" />
                    <circle className="quest-ui-task-icon-cutout" cx="18.2" cy="11.9" r=".72" />
                    <circle className="quest-ui-task-icon-cutout" cx="13.8" cy="11.9" r=".72" />
                    <circle className="quest-ui-task-icon-cutout" cx="16" cy="14.1" r=".72" />
                </>
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
    return <QuestOrbIcon size={15} className="quest-ui-orb-glyph" />;
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

function questProgressTone(completion: DiscordQuestCompletion, quest: NormalizedQuest): QuestProgressTone {
    const ratio = Number.isFinite(completion?.completedRatio) ? completion.completedRatio : quest.progress / 100;
    const progress = Math.max(0, Math.min(100, ratio * 100));

    // This is progress, not urgency: move from neutral → brand → positive instead of
    // reusing warning/danger colors that already carry different semantics in QuestUI.
    if (progress >= 90) return "near-complete";
    if (progress >= 75) return "advanced";
    if (progress >= 50) return "mid";
    if (progress >= 20) return "building";
    return "starting";
}

function formatMmSs(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function taskTypeLabel(type: QuestTaskType): string {
    if (type === "play") return "Play";
    if (type === "stream") return "Stream";
    if (type === "video") return "Video";
    if (type === "activity") return "Activity";
    return "Quest";
}

function timedProgressParts(quest: NormalizedQuest): TimedProgressParts | null {
    const task = quest.primaryTask;
    if (quest.status !== "in-progress" || !task || task.target <= 0) return null;

    const timed = task.type === "play"
        || task.type === "stream"
        || task.type === "video"
        || task.key === "PLAY_ACTIVITY";
    if (!timed) return null;

    const current = Math.min(task.current, task.target);
    return {
        prefix: `${taskTypeLabel(task.type)} · `,
        current: formatMmSs(current),
        suffix: ` / ${formatMmSs(task.target)}`
    };
}

function dashboardExpiry(quest: NormalizedQuest, now = Date.now()): string | null {
    if (quest.expiresAt == null) return null;
    return formatExpiry(quest.expiresAt, now);
}

function QuestCard({ quest }: { quest: NormalizedQuest; }) {
    const completion = useDiscordQuestCompletion(quest.rawQuest);
    const now = Date.now();
    const expiry = dashboardExpiry(quest, now);
    const urgency = expiryUrgency(quest.expiresAt, now);
    const taskType = quest.primaryTask?.type ?? quest.tasks[0]?.type ?? "other";
    const timedProgress = timedProgressParts(quest);
    const progressCopy = timedProgress == null ? formatQuestProgress(quest) : null;
    const progressTone = questProgressTone(completion, quest);
    const showProgressCopy = quest.status !== "claimable" && quest.status !== "claimed";
    const hasNitroMultiplier = useStateFromStores([UserStore], hasEligibleNitroOrbMultiplier);
    const orbQuantity = effectiveOrbQuantity(quest, hasNitroMultiplier);
    const rewardTier = quest.reward.kind === "orbs" ? orbRewardTier(orbQuantity) : null;
    const rewardLabel = quest.reward.kind === "orbs" && orbQuantity > 0
        ? `${orbQuantity} Orbs`
        : quest.reward.label;

    return (
        <article className={`quest-ui-card quest-ui-card-${quest.status}`}>
            <QuestArtwork quest={quest} type={taskType} />

            <div className="quest-ui-card-main">
                <div className="quest-ui-card-title-cluster">
                    <strong className="quest-ui-card-title" title={quest.name}>{quest.name}</strong>
                </div>

                <div className="quest-ui-card-status-line">
                    <span className="quest-ui-card-status-dot" aria-hidden="true" />
                    <span className="quest-ui-card-status">{statusLabel(quest.status)}</span>
                    {showProgressCopy && (
                        <>
                            <span className="quest-ui-card-separator" aria-hidden="true">•</span>
                            <span className="quest-ui-card-progress-text">
                                {timedProgress != null ? (
                                    <>
                                        {timedProgress.prefix}
                                        <span className={`quest-ui-card-progress-current quest-ui-progress-tone-${progressTone}`}>
                                            {timedProgress.current}
                                        </span>
                                        {timedProgress.suffix}
                                    </>
                                ) : progressCopy}
                            </span>
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

function DashboardSummary({ quests, hiddenCount }: { quests: NormalizedQuest[]; hiddenCount: number; }) {
    const counts = questStatusCounts(quests);

    return (
        <div className="quest-ui-dashboard-summary" aria-label="Quest status summary">
            <span className="quest-ui-summary-available">{counts.available} Available</span>
            <span className="quest-ui-summary-claimable">{counts.claimable} Ready</span>
            <span className="quest-ui-summary-in-progress">{counts.inProgress} In Progress</span>
            <span className="quest-ui-summary-claimed">{counts.claimed} Claimed</span>
            <span className="quest-ui-summary-expired">{counts.expired} Expired</span>
            <span className="quest-ui-summary-hidden">{hiddenCount} Hidden</span>
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
    if (store.dashboardShowExpired === true && Math.floor(Number(store.dashboardExpiredAgeDays ?? 15)) !== 15) count++;
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
    settings.store.dashboardExpiredAgeDays = 0;
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
    settings.store.dashboardExpiredAgeDays = 15;
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
    const expiredAgeDays = Math.max(0, Math.floor(Number(store.dashboardExpiredAgeDays ?? 15)) || 0);
    const expiredAgePresets = [7, 15, 30, 90, 0] as const;
    const customExpiredAge = expiredAgeDays > 0 && !expiredAgePresets.includes(expiredAgeDays as any)
        ? String(expiredAgeDays)
        : "";

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
                    <FilterChip active={store.dashboardShowClaimable !== false} label="Ready" tone="positive" onClick={() => { store.dashboardShowClaimable = store.dashboardShowClaimable === false; }} />
                    <FilterChip active={store.dashboardShowInProgress !== false} label="In Progress" tone="warning" onClick={() => { store.dashboardShowInProgress = store.dashboardShowInProgress === false; }} />
                    <FilterChip active={store.dashboardShowClaimed === true} label="Claimed" tone="brand" onClick={() => { store.dashboardShowClaimed = store.dashboardShowClaimed !== true; }} />
                    <FilterChip active={store.dashboardShowExpired === true} label="Expired" onClick={() => { store.dashboardShowExpired = store.dashboardShowExpired !== true; }} />
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
    const filtered = filterQuests(quests, dashboardScopeFromSettings(dashboardSettings));
    const hiddenCount = Math.max(0, quests.length - filtered.length);
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
                renderPopout={() => <DashboardFilters hiddenCount={hiddenCount} />}
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
    const quests = useQuestSnapshot();
    const orionHealth = getOrionIntegrationHealth(orionIntegration === true);
    const filtered = filterQuests(quests, dashboardScopeFromSettings(dashboardSettings));
    const hasNitroMultiplier = useStateFromStores([UserStore], hasEligibleNitroOrbMultiplier);
    const sortMode = normalizeDashboardSortMode(dashboardSettings.dashboardSortMode);
    const visible = sortDashboardQuests(
        filtered,
        sortMode,
        quest => effectiveOrbQuantity(quest, hasNitroMultiplier)
    );
    const hiddenCount = Math.max(0, quests.length - filtered.length);

    return (
        <section className="quest-ui-dashboard" role="dialog" aria-label="Quest dashboard">
            <header className="quest-ui-dashboard-header">
                <div className="quest-ui-dashboard-header-row">
                    <div className="quest-ui-dashboard-heading">
                        <div className="quest-ui-dashboard-title-row">
                            <strong className="quest-ui-dashboard-title">Quests</strong>
                        </div>
                        <DashboardSummary quests={quests} hiddenCount={hiddenCount} />
                    </div>
                </div>
                <div className="quest-ui-dashboard-meta-row">
                    <OrionIntegrationStatus health={orionHealth} />
                    <span className="quest-ui-meta-product">QuestUI <span className="quest-ui-version-chip quest-ui-version-chip-questui">{QUESTUI_VERSION}</span></span>
                    <QuestOrbBalance />
                </div>
            </header>

            <div className="quest-ui-dashboard-content">
                {visible.length > 0 ? (
                    visible.map(quest => (
                        <QuestCard key={quest.id} quest={quest} />
                    ))
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
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
