import { findComponentByCodeLazy } from "@webpack";

// Discord's own themed Orb image component. Keep one finder shared by per-Quest rewards and
// the account balance so QuestUI does not maintain a copied/static Orb asset or duplicate lookup.
const DiscordOrbIcon = findComponentByCodeLazy("shouldUseThemeColor", "customSize", "loading");

export function QuestOrbIcon({ size = 15, className }: { size?: number; className?: string; }) {
    return (
        <DiscordOrbIcon
            shouldUseThemeColor
            customSize={size}
            className={className}
        />
    );
}
