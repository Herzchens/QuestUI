import { useSettings } from "@api/Settings";
import { fetchUserProfile } from "@utils/discord";
import { findByCodeLazy } from "@webpack";
import { UserProfileStore, UserStore, useEffect, useStateFromStores } from "@webpack/common";

import { EventLogButton } from "./EventLogViewer";
import { isOrionCommandReady } from "./orionIntegration";
import { OrionGlobalControls } from "./OrionControls";
import { useQuestOrbMultiplierState } from "./orbMultiplier";
import { QuestDashboard, QuestDashboardToolbar } from "./QuestDashboard";
import { QuestReloadControl } from "./QuestReloadControl";
import settings from "./settings";
import { UpdateCenterIndicator } from "./UpdateCenter";

import "./orion.css";
import "./dashboardPolish.css";
import "./dashboardV12.css";
import "./dashboardTuning.css";

const NativeQuestIcon = findByCodeLazy("\"M7.5 21.7a8.95");

function nitroBadgeIconSrc(icon: string): string {
    return /^https?:\/\//i.test(icon)
        ? icon
        : `https://cdn.discordapp.com/badge-icons/${icon}.png`;
}

function isCurrentNitroBadge(id: string, description: string): boolean {
    const normalizedId = id.trim().toLowerCase();
    const normalizedDescription = description.trim().toLowerCase();

    if (normalizedDescription.includes("early supporter")) return false;
    if (normalizedDescription.includes("server boost") || normalizedDescription.includes("boosting")) return false;

    return normalizedId === "premium"
        || normalizedId.startsWith("premium_")
        || normalizedId.startsWith("nitro")
        || normalizedDescription === "discord nitro"
        || normalizedDescription.startsWith("nitro ");
}

function NitroFallbackIcon() {
    return (
        <svg className="quest-ui-dashboard-nitro-fallback-icon" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m10 1.75 7.25 4.1v8.3L10 18.25l-7.25-4.1v-8.3L10 1.75Zm0 3.05L5.4 7.4v5.2l4.6 2.6 4.6-2.6V7.4L10 4.8Zm-2.55 3.35h5.1v3.7h-5.1v-3.7Z" />
        </svg>
    );
}

function XboxIcon() {
    return (
        <svg className="quest-ui-dashboard-xbox-icon" viewBox="0 0 512 512" aria-hidden="true">
            <path
                fill="currentColor"
                d="M369.9 318.2c44.3 54.3 64.7 98.8 54.4 118.7-7.9 15.1-56.7 44.6-92.6 55.9-29.6 9.3-68.4 13.3-100.4 10.2-38.2-3.7-76.9-17.4-110.1-39-27.9-18.2-34.2-25.7-34.2-40.6 0-29.9 32.9-82.3 89.2-142.1 32-33.9 76.5-73.7 81.4-72.6 9.4 2.1 84.3 75.1 112.3 109.5zM188.6 143.8c-29.7-26.9-58.1-53.9-86.4-63.4-15.2-5.1-16.3-4.8-28.7 8.1-29.2 30.4-53.5 79.7-60.3 122.4-5.4 34.2-6.1 43.8-4.2 60.5 5.6 50.5 17.3 85.4 40.5 120.9 9.5 14.6 12.1 17.3 9.3 9.9-4.2-11-.3-37.5 9.5-64 14.3-39 53.9-112.9 120.3-194.4zm311.6 63.5c-16.9-80-67.5-130.3-74.6-130.3-7.3 0-24.2 6.5-36 13.9-23.3 14.5-41 31.4-64.3 52.8 42.4 53.3 102.2 139.4 122.9 202.3 6.8 20.7 9.7 41.1 7.4 52.3-1.7 8.5-1.7 8.5 1.4 4.6 6.1-7.7 19.9-31.3 25.4-43.5 7.4-16.2 15-40.2 18.6-58.7 4.3-22.5 3.9-70.8-.8-93.4zM141.3 43c47.7-2.5 109.7 34.5 114.3 35.4.7.1 10.4-4.2 21.6-9.7 63.9-31.1 94-25.8 107.4-25.2-63.9-39.3-152.7-50-233.9-11.7-23.4 11.1-24 11.9-9.4 11.2z"
            />
        </svg>
    );
}

function QuestOrbMultiplierSourceTag() {
    const { source } = useQuestOrbMultiplierState();
    const currentUserId = useStateFromStores([UserStore], () => UserStore?.getCurrentUser?.()?.id ?? null);
    const showNitro = source === "nitro";

    useEffect(() => {
        if (!showNitro || !currentUserId) return;
        if (UserProfileStore?.getUserProfile?.(currentUserId)) return;
        if (UserProfileStore?.isFetchingProfile?.(currentUserId)) return;
        void fetchUserProfile(currentUserId).catch(() => undefined);
    }, [showNitro, currentUserId]);

    const nitroBadge = useStateFromStores([UserProfileStore], () => {
        if (!showNitro || !currentUserId) return null;
        const profile = UserProfileStore?.getUserProfile?.(currentUserId);
        const badge = profile?.badges?.find(candidate =>
            isCurrentNitroBadge(candidate.id ?? "", candidate.description ?? "")
        );
        if (!badge?.icon) return null;
        return nitroBadgeIconSrc(badge.icon);
    });

    if (source === "xbox_game_pass") {
        return (
            <span className="quest-ui-dashboard-boost-source-tag is-xbox" title="Xbox Game Pass Quest Orb boost">
                <XboxIcon />
                <span className="quest-ui-dashboard-boost-source-wordmark">Xbox+</span>
            </span>
        );
    }

    if (!showNitro) return null;

    return (
        <span className="quest-ui-dashboard-boost-source-tag is-nitro" title="Discord Nitro">
            {nitroBadge
                ? <img src={nitroBadge} alt="" aria-hidden="true" />
                : <NitroFallbackIcon />}
            <span className="quest-ui-dashboard-boost-source-wordmark">Nitro</span>
        </span>
    );
}

function QuestDashboardDisplayTitle() {
    return (
        <div className="quest-ui-dashboard-display-title" aria-hidden="true">
            <strong>Quest Dashboard</strong>
            <span className="quest-ui-dashboard-display-title-icon"><NativeQuestIcon /></span>
            <QuestOrbMultiplierSourceTag />
        </div>
    );
}

export function QuestDashboardShell({ closePopout }: { closePopout?: () => void; }) {
    const { orionIntegration } = settings.use(["orionIntegration"]);
    useSettings(["plugins.OrionQuests.enabled"]);
    const showOrionControls = orionIntegration === true && isOrionCommandReady();

    return (
        <div className={`quest-ui-dashboard-shell has-dashboard-tools${showOrionControls ? " has-orion-control" : ""}`}>
            <div className="quest-ui-dashboard-topbar">
                <QuestDashboardDisplayTitle />
                <div className="quest-ui-dashboard-header-tools">
                    {showOrionControls && <OrionGlobalControls />}
                    <QuestReloadControl />
                    <UpdateCenterIndicator />
                    <EventLogButton />
                    <QuestDashboardToolbar closePopout={closePopout} />
                </div>
            </div>
            <QuestDashboard closePopout={closePopout} />
        </div>
    );
}
