import { findByCodeLazy } from "@webpack";
import { ThemeStore, useStateFromStores } from "@webpack/common";

import type { OrionControlSnapshot } from "../orion/companion";
import { orionQuestProgressSource, orionQuestTagState, storedQuestTaskProgress, type OrionQuestTagState } from "../orion/controls";
import { effectiveOrbRewardAmount } from "../orbs/rewards";
import { QuestOrbIcon } from "../orbs/QuestOrbIcon";
import { QuestCardActions } from "../quests/actions/QuestCardActions";
import { expiryUrgency, formatExpiry, formatQuestProgress } from "../quests/data";
import type { NormalizedQuest, QuestTaskType } from "../quests/data";
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


function ProgressRing({
    quest,
    completion,
    ratioOverride = null
}: {
    quest: NormalizedQuest;
    completion: DiscordQuestCompletion;
    ratioOverride?: number | null;
}) {
    const hasRatioOverride = Number.isFinite(ratioOverride);
    const ratio = hasRatioOverride
        ? Number(ratioOverride)
        : Number.isFinite(completion?.completedRatio)
            ? completion.completedRatio
            : quest.progress / 100;
    const progress = Math.max(0, Math.min(100, ratio * 100));
    const display = hasRatioOverride
        ? `${Math.floor(progress)}%`
        : completion?.completedRatioDisplay ?? `${Math.round(progress)}%`;
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

function statusLabel(status: NormalizedQuest["status"]): string {
    if (status === "in-progress") return "In progress";
    if (status === "claimable") return "Ready to claim";
    if (status === "claimed") return "Claimed";
    if (status === "expired") return "Expired";
    return "Available";
}

function questProgressTone(
    completion: DiscordQuestCompletion,
    quest: NormalizedQuest,
    ratioOverride: number | null = null
): QuestProgressTone {
    const ratio = Number.isFinite(ratioOverride)
        ? Number(ratioOverride)
        : Number.isFinite(completion?.completedRatio)
            ? completion.completedRatio
            : quest.progress / 100;
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

function timedProgressParts(quest: NormalizedQuest, currentOverride: number | null = null): TimedProgressParts | null {
    const task = quest.primaryTask;
    if (quest.status !== "in-progress" || !task || task.target <= 0) return null;

    const timed = task.type === "play"
        || task.type === "stream"
        || task.type === "video"
        || task.key === "PLAY_ACTIVITY";
    if (!timed) return null;

    const current = Math.min(
        Number.isFinite(currentOverride) ? Number(currentOverride) : task.current,
        task.target
    );
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

const ORION_QUEST_TAG_COPY: Record<OrionQuestTagState, { label: string; title: string; }> = {
    started: { label: "Started", title: "Orion is running this Quest" },
    waiting: { label: "Waiting", title: "Waiting for Orion to start this Quest" },
    paused: { label: "Paused", title: "Paused in Orion" },
    stopped: { label: "Stopped", title: "Orion is stopped for this Quest" }
};

function OrionQuestStateTag({ state }: { state: OrionQuestTagState | null; }) {
    if (!state) return null;
    const copy = ORION_QUEST_TAG_COPY[state];
    return (
        <span
            className={`quest-ui-card-orion-state is-${state}`}
            aria-label={`Orion state: ${copy.label}`}
            title={copy.title}
        >
            {copy.label}
        </span>
    );
}

function IgnoredQuestTag() {
    return (
        <span className="quest-ui-card-ignored-state" aria-label="QuestUI state: Ignored" title="Ignored in QuestUI">
            Ignored
        </span>
    );
}

export function QuestCard({ quest, orionSnapshot, ignored, receivesOrbBoost, claimBatchActive }: {
    quest: NormalizedQuest;
    orionSnapshot: OrionControlSnapshot | null;
    ignored: boolean;
    receivesOrbBoost: boolean;
    claimBatchActive: boolean;
}) {
    const completion = useDiscordQuestCompletion(quest.rawQuest);
    const now = Date.now();
    const expiry = dashboardExpiry(quest, now);
    const urgency = expiryUrgency(quest.expiresAt, now);
    const taskType = quest.primaryTask?.type ?? quest.tasks[0]?.type ?? "other";
    const primaryTask = quest.primaryTask;
    const progressSource = orionQuestProgressSource(orionSnapshot, quest.id);
    const storedCurrent = progressSource === "stored" && primaryTask
        ? storedQuestTaskProgress(quest.rawQuest, primaryTask)
        : null;
    const timedProgress = timedProgressParts(quest, storedCurrent);
    const progressRatioOverride = timedProgress != null && storedCurrent != null && primaryTask && primaryTask.target > 0
        ? Math.min(storedCurrent / primaryTask.target, 1)
        : null;
    const progressCopy = timedProgress == null ? formatQuestProgress(quest) : null;
    const progressTone = questProgressTone(completion, quest, progressRatioOverride);
    const showProgressCopy = quest.status !== "claimable" && quest.status !== "claimed";
    const displayedOrbQuantity = effectiveOrbRewardAmount(
        { base: quest.reward.orbQuantity, boosted: quest.reward.boostedOrbQuantity },
        receivesOrbBoost
    );
    const rewardTier = quest.reward.kind === "orbs" ? orbRewardTier(displayedOrbQuantity) : null;
    const rewardLabel = quest.reward.kind === "orbs" && displayedOrbQuantity > 0
        ? `${Math.round(displayedOrbQuantity)} Orbs`
        : quest.reward.label;
    const orionTagState = quest.status === "in-progress"
        ? orionQuestTagState(orionSnapshot, quest.id)
        : null;

    return (
        <article className={`quest-ui-card quest-ui-card-${quest.status}${ignored ? " quest-ui-card-ignored" : ""}`}>
            <QuestArtwork quest={quest} type={taskType} />

            <div className="quest-ui-card-main">
                <div className="quest-ui-card-title-cluster">
                    <strong className="quest-ui-card-title" title={quest.name}>{quest.name}</strong>
                    {ignored && <IgnoredQuestTag />}
                    <OrionQuestStateTag state={orionTagState} />
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
                    <QuestCardActions quest={quest} ignored={ignored} claimBatchActive={claimBatchActive} />
                </div>
            </div>

            <div className="quest-ui-card-side">
                <ProgressRing quest={quest} completion={completion} ratioOverride={progressRatioOverride} />
                {expiry && (
                    <span className={`quest-ui-card-expiry quest-ui-expiry-${urgency}`} title={expiry}>
                        {expiry}
                    </span>
                )}
            </div>
        </article>
    );
}

