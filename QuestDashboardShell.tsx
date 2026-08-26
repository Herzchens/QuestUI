import { useSettings } from "@api/Settings";
import { fetchUserProfile } from "@utils/discord";
import { findByCodeLazy } from "@webpack";
import { UserProfileStore, UserStore, useEffect, useStateFromStores } from "@webpack/common";

import { isOrionCommandReady } from "./orionIntegration";
import { OrionGlobalControls } from "./OrionControls";
import { QuestDashboard } from "./QuestDashboard";
import { QuestReloadControl } from "./QuestReloadControl";
import settings from "./settings";

import "./orion.css";
import "./dashboardPolish.css";

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

function QuestNitroTag() {
    const currentUserId = useStateFromStores([UserStore], () => UserStore?.getCurrentUser?.()?.id ?? null);
    const premiumType = useStateFromStores([UserStore], () => UserStore?.getCurrentUser?.()?.premiumType ?? 0);
    const hasNitro = premiumType > 0;

    useEffect(() => {
        if (!hasNitro || !currentUserId) return;
        if (UserProfileStore?.getUserProfile?.(currentUserId)) return;
        if (UserProfileStore?.isFetchingProfile?.(currentUserId)) return;

        // The current User already tells us whether Nitro is active. Fetching the profile here is
        // only for Discord's current Nitro badge artwork, so missing/evolving badge metadata can
        // never hide the tag itself.
        void fetchUserProfile(currentUserId).catch(() => undefined);
    }, [hasNitro, currentUserId]);

    const nitroBadge = useStateFromStores([UserProfileStore], () => {
        if (!currentUserId) return null;
        const profile = UserProfileStore?.getUserProfile?.(currentUserId);
        const badge = profile?.badges?.find(candidate =>
            isCurrentNitroBadge(candidate.id ?? "", candidate.description ?? "")
        );

        if (!badge?.icon) return null;
        return nitroBadgeIconSrc(badge.icon);
    });

    if (!hasNitro) return null;

    return (
        <span className="quest-ui-dashboard-nitro-tag" title="Discord Nitro">
            {nitroBadge
                ? <img src={nitroBadge} alt="" aria-hidden="true" />
                : <NitroFallbackIcon />}
            <span className="quest-ui-dashboard-nitro-wordmark">Nitro</span>
        </span>
    );
}

function QuestDashboardDisplayTitle() {
    return (
        <div className="quest-ui-dashboard-display-title" aria-hidden="true">
            <strong>Quest Dashboard</strong>
            <span className="quest-ui-dashboard-display-title-icon"><NativeQuestIcon /></span>
            <QuestNitroTag />
        </div>
    );
}

export function QuestDashboardShell({ closePopout }: { closePopout?: () => void; }) {
    const { orionIntegration } = settings.use(["orionIntegration"]);
    useSettings(["plugins.OrionQuests.enabled"]);
    const showOrionControls = orionIntegration === true && isOrionCommandReady();

    return (
        <div className={`quest-ui-dashboard-shell has-dashboard-tools${showOrionControls ? " has-orion-control" : ""}`}>
            <QuestDashboardDisplayTitle />
            <div className="quest-ui-dashboard-header-tools">
                {showOrionControls && <OrionGlobalControls />}
                <QuestReloadControl />
            </div>
            <QuestDashboard closePopout={closePopout} />
        </div>
    );
}
