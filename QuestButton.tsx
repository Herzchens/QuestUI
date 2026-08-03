import "./styles.css";

import { Flex } from "@components/Flex";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { NavigationRouter, Tooltip, useEffect, useState } from "@webpack/common";

import { QuestsStore } from "./stores";

const QuestIcon = findByCodeLazy("\"M7.5 21.7a8.95");
const TopBarButton = findComponentByCodeLazy("badgePosition", "icon");
const SettingsBarButton = findComponentByCodeLazy("keyboardShortcut", "positionKey");
const CountBadge = findComponentByCodeLazy("renderBadgeCount", "disableColor");

type QuestStatus = {
    enrollable: number;
    enrolled: number;
    claimable: number;
    claimed: number;
    expired: number;
};

const EMPTY_STATUS: QuestStatus = {
    enrollable: 0,
    enrolled: 0,
    claimable: 0,
    claimed: 0,
    expired: 0
};

function getQuests(): any[] {
    const quests = QuestsStore?.quests;
    if (!quests) return [];
    if (typeof quests.values === "function") return Array.from(quests.values());
    if (Array.isArray(quests)) return quests;
    return Object.values(quests);
}

function questsStatus(): QuestStatus {
    return getQuests().reduce<QuestStatus>((acc, quest) => {
        const expiresAt = new Date(quest?.config?.expiresAt ?? 0).getTime();

        if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now()) {
            acc.expired++;
        } else if (quest?.userStatus?.claimedAt) {
            acc.claimed++;
        } else if (quest?.userStatus?.completedAt) {
            acc.claimable++;
        } else if (quest?.userStatus?.enrolledAt) {
            acc.enrolled++;
        } else {
            acc.enrollable++;
        }

        return acc;
    }, { ...EMPTY_STATUS });
}

function useQuestStatus(): QuestStatus {
    const [status, setStatus] = useState(questsStatus);

    useEffect(() => {
        const update = () => setStatus(questsStatus());

        QuestsStore?.addChangeListener?.(update);
        const interval = setInterval(update, 60_000);
        update();

        return () => {
            clearInterval(interval);
            QuestsStore?.removeChangeListener?.(update);
        };
    }, []);

    return status;
}

function StatusBadge({ count, label, color }: { count: number; label: string; color: string; }) {
    if (count <= 0) return null;

    return (
        <Tooltip text={label}>
            {({ onMouseEnter, onMouseLeave }) => (
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
    const status = useQuestStatus();

    return (
        <Flex flexDirection="row" justifyContent="flex-end" className="quest-ui-badges" gap="5px">
            <StatusBadge count={status.enrollable} label="Enrollable" color="var(--status-danger)" />
            <StatusBadge count={status.enrolled} label="Enrolled" color="var(--status-warning)" />
            <StatusBadge count={status.claimable} label="Claimable" color="var(--status-positive)" />
            <StatusBadge count={status.claimed} label="Claimed" color="var(--blurple-50)" />
        </Flex>
    );
}

function openQuestHome(): void {
    NavigationRouter.transitionTo("/quest-home");
}

export function QuestButton({ type }: { type: "top-bar" | "settings-bar"; }) {
    const state = useQuestStatus();

    const className = state.enrollable
        ? "quest-ui-enrollable"
        : state.enrolled
            ? "quest-ui-enrolled"
            : state.claimable
                ? "quest-ui-claimable"
                : "";

    const statusParts = [
        state.enrollable > 0 ? `${state.enrollable} available` : null,
        state.enrolled > 0 ? `${state.enrolled} in progress` : null,
        state.claimable > 0 ? `${state.claimable} ready to claim` : null
    ].filter(Boolean);
    const tooltip = statusParts.length > 0
        ? `Quests • ${statusParts.join(" • ")}`
        : "Quests";

    if (type === "top-bar") {
        return (
            <TopBarButton
                className={className}
                iconClassName={undefined}
                disabled={false}
                showBadge={state.enrollable > 0 || state.enrolled > 0 || state.claimable > 0}
                badgePosition="bottom"
                icon={QuestIcon}
                iconSize={20}
                onClick={openQuestHome}
                onContextMenu={undefined}
                tooltip={tooltip}
                tooltipPosition="bottom"
                hideOnClick={false}
            />
        );
    }

    return (
        <SettingsBarButton
            tooltipText={tooltip}
            onContextMenu={undefined}
            onClick={openQuestHome}
            disabled={false}
            icon={undefined}
            className="quest-ui-settings-button"
        >
            <TopBarButton
                className={className}
                iconClassName={undefined}
                disabled={false}
                showBadge={state.enrollable > 0 || state.enrolled > 0 || state.claimable > 0}
                badgePosition="bottom"
                icon={QuestIcon}
                iconSize={20}
                onClick={openQuestHome}
                onContextMenu={undefined}
                hideOnClick={false}
            />
        </SettingsBarButton>
    );
}
