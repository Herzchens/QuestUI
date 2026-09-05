import "./styles.css";
import "./scrollbar.css";

import { Flex } from "@components/Flex";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { NavigationRouter, Popout, Tooltip, useRef } from "@webpack/common";

import { QuestDashboardShell } from "./QuestDashboardShell";
import {
    attentionCounts,
    detailedScopeFromSettings,
    filterQuests,
    formatExpiry,
    prioritizedAttention,
    questStatusCounts,
    useQuestSnapshot
} from "./questData";
import type { AttentionCounts } from "./questData";
import settings from "./settings";

const QuestIcon = findByCodeLazy("\"M7.5 21.7a8.95");
// Match the same Discord header-bar button component VencordToolbox uses. The old
// generic "badgePosition"/"icon" lookup can resolve to an unrelated button after
// Discord webpack changes while still looking successful to the patch reporter.
const HeaderBarButton = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');
const CountBadge = findComponentByCodeLazy("renderBadgeCount", "disableColor");

function StatusBadge({ count, label, color }: { count: number; label: string; color: string; }) {
    if (count <= 0) return null;

    return (
        <Tooltip text={label}>
            {({ onMouseEnter, onMouseLeave }: { onMouseEnter: () => void; onMouseLeave: () => void; }) => (
                <CountBadge
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    count={count}
                    color={color}
                    style={{ color: "var(--background-base-lowest)" }}
                />
            )}
        </Tooltip>
    );
}

export function QuestsCount() {
    const status = questStatusCounts(useQuestSnapshot());

    return (
        <Flex flexDirection="row" justifyContent="flex-end" className="quest-ui-badges" gap="5px">
            <StatusBadge count={status.available} label="Available" color="var(--status-danger)" />
            <StatusBadge count={status.inProgress} label="In Progress" color="var(--status-warning)" />
            <StatusBadge count={status.claimable} label="Ready to Claim" color="var(--status-positive)" />
            <StatusBadge count={status.claimed} label="Claimed" color="var(--blurple-50)" />
        </Flex>
    );
}

function openQuestHome(): void {
    NavigationRouter.transitionTo("/quest-home");
}

function statusClass(status: "available" | "in-progress" | "claimable" | undefined): string {
    if (status === "in-progress") return "quest-ui-enrolled";
    if (status === "claimable") return "quest-ui-claimable";
    if (status === "available") return "quest-ui-enrollable";
    return "";
}

function detailClass(status: "available" | "in-progress" | "claimable"): string {
    if (status === "in-progress") return "quest-ui-detail-in-progress";
    if (status === "claimable") return "quest-ui-detail-claimable";
    return "quest-ui-detail-available";
}

function DetailedQuestIcon({ count, status, iconProps }: {
    count: number;
    status: "available" | "in-progress" | "claimable";
    iconProps: any;
}) {
    return (
        <span className="quest-ui-icon-wrap">
            <QuestIcon {...iconProps} />
            <span className={`quest-ui-detailed-count ${detailClass(status)}`} aria-hidden="true">
                {count > 99 ? "99+" : count}
            </span>
        </span>
    );
}

function nearestExpiry(quests: ReturnType<typeof useQuestSnapshot>): string | null {
    const now = Date.now();
    const timestamp = quests.reduce<number | null>((nearest, quest) => {
        if (quest.expiresAt == null || quest.expiresAt <= now) return nearest;
        return nearest == null || quest.expiresAt < nearest ? quest.expiresAt : nearest;
    }, null);

    return timestamp == null ? null : formatExpiry(timestamp, now);
}

function QuestStatusTooltip({ counts, total, expiry }: {
    counts: AttentionCounts;
    total: number;
    expiry: string | null;
}) {
    if (total === 0) return <span>Quests</span>;

    return (
        <div className="quest-ui-status-tooltip">
            <strong>Quest Status</strong>
            <div className="quest-ui-status-tooltip-grid">
                {counts.inProgress > 0 && (
                    <span className="quest-ui-tooltip-in-progress"><b>{counts.inProgress}</b> In Progress</span>
                )}
                {counts.claimable > 0 && (
                    <span className="quest-ui-tooltip-claimable"><b>{counts.claimable}</b> Ready to Claim</span>
                )}
                {counts.available > 0 && (
                    <span className="quest-ui-tooltip-available"><b>{counts.available}</b> Available</span>
                )}
            </div>
            <span className="quest-ui-tooltip-total">{total} attention {total === 1 ? "quest" : "quests"}</span>
            {expiry && <span className="quest-ui-tooltip-expiry">Nearest expiry · {expiry.replace(/^Expires in /, "")}</span>}
        </div>
    );
}

export function QuestButton({ type }: { type: "top-bar" | "settings-bar"; }) {
    settings.use([
        "dashboardMode",
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
        "dashboardShowOther",
        "detailedStatus",
        "detailedStatusScope",
        "detailedShowAvailable",
        "detailedShowInProgress",
        "detailedShowClaimable",
        "detailedRewardFilter",
        "detailedIncludeUnknownRewards",
        "detailedShowPlay",
        "detailedShowStream",
        "detailedShowVideo",
        "detailedShowActivity",
        "detailedShowOther"
    ]);

    const allQuests = useQuestSnapshot();
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const detailed = settings.store.detailedStatus;
    const statusQuests = detailed
        ? filterQuests(allQuests, detailedScopeFromSettings(settings.store))
        : allQuests;
    const attentionQuests = statusQuests.filter(quest =>
        quest.status === "in-progress" || quest.status === "claimable" || quest.status === "available"
    );
    const counts = attentionCounts(attentionQuests);
    const priority = prioritizedAttention(counts);
    const className = statusClass(priority?.status);
    const expiry = nearestExpiry(attentionQuests);
    const tooltip = <QuestStatusTooltip counts={counts} total={attentionQuests.length} expiry={expiry} />;

    const icon = detailed && priority
        ? (iconProps: any) => <DetailedQuestIcon count={priority.count} status={priority.status} iconProps={iconProps} />
        : QuestIcon;

    const buttonClassName = [type === "settings-bar" ? "quest-ui-settings-button" : "", className]
        .filter(Boolean)
        .join(" ");

    const renderButton = (onClick: (...args: any[]) => void) => (
        <HeaderBarButton
            ref={buttonRef}
            className={buttonClassName}
            iconClassName={undefined}
            disabled={false}
            showBadge={!detailed && priority != null}
            badgePosition="bottom"
            icon={icon}
            iconSize={20}
            onClick={onClick}
            onContextMenu={undefined}
            tooltip={tooltip}
            tooltipPosition={type === "top-bar" ? "bottom" : "top"}
            hideOnClick={false}
        />
    );

    if (!settings.store.dashboardMode) return renderButton(openQuestHome);

    return (
        <Popout
            targetElementRef={buttonRef}
            position={type === "top-bar" ? "bottom" : "top"}
            align={type === "top-bar" ? "right" : "left"}
            renderPopout={({ closePopout }) => <QuestDashboardShell closePopout={closePopout} />}
        >
            {popoutProps => renderButton(popoutProps.onClick)}
        </Popout>
    );
}
