import type { OrionIntegrationHealth } from "./orionStatusLogic";
import { ORION_MIN_COMPANION_VERSION } from "./orionStatusLogic";
import { versionChannelClass } from "./versionChannel";

const HEALTH_COPY: Record<OrionIntegrationHealth["kind"], string> = {
    "not-installed": "Orion Quest Not Installed",
    "disabled": "Orion Quest Disabled",
    "integration-off": "Orion Quest Integration Off",
    "version-incompatible": "Orion Quest Version Incompatible",
    "starting": "Orion Quest Starting",
    "integration-unavailable": "Orion Quest Integration Unavailable",
    "connected": "Orion Quest Connected"
};

function healthTitle(health: OrionIntegrationHealth): string {
    if (health.kind === "version-incompatible") {
        return `Installed: ${health.installedVersion ?? "Unknown"}\nRequires: v${ORION_MIN_COMPANION_VERSION}+`;
    }
    if (health.kind === "integration-unavailable") {
        return "Orion Quest is installed and enabled, but QuestUI could not validate the companion integration surface.";
    }
    if (health.kind === "integration-off") {
        return "Orion Quest may continue running independently; QuestUI's Orion integration is turned off.";
    }
    if (health.kind === "disabled") return "OrionQuests is installed but disabled in Vencord.";
    if (health.kind === "not-installed") return "OrionQuests is not installed.";
    if (health.kind === "starting") return "OrionQuests is starting and has not published a ready integration surface yet.";
    return health.installedVersion
        ? `Orion Quest ${health.installedVersion} is connected to QuestUI.`
        : "Orion Quest is connected to QuestUI.";
}

export function OrionIntegrationStatus({ health }: { health: OrionIntegrationHealth; }) {
    const warning = health.kind === "version-incompatible" || health.kind === "integration-unavailable";
    const notInstalled = health.kind === "not-installed";

    return (
        <span className={`quest-ui-orion-status is-${health.kind}`} title={healthTitle(health)}>
            {warning
                ? <span className="quest-ui-orion-status-warning" aria-hidden="true">⚠</span>
                : notInstalled
                    ? <span className="quest-ui-orion-status-question" aria-hidden="true">?</span>
                    : <span className="quest-ui-orion-status-dot" aria-hidden="true" />}
            <span className="quest-ui-orion-status-copy">{HEALTH_COPY[health.kind]}</span>
            {health.installedVersion && (
                <span className={`quest-ui-version-chip quest-ui-version-chip-orion ${versionChannelClass(health.installedVersion)}`}>{health.installedVersion}</span>
            )}
        </span>
    );
}
