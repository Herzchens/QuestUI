import type { OrionIntegrationHealth } from "./orionStatusLogic";
import { deriveConnectedOrionRuntime, ORION_MIN_COMPANION_VERSION } from "./orionStatusLogic";
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

function healthTitle(health: OrionIntegrationHealth, engineRunning: boolean | null): string {
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

    const versionCopy = health.installedVersion
        ? `Orion Quest ${health.installedVersion} is connected to QuestUI.`
        : "Orion Quest is connected to QuestUI.";
    if (engineRunning === true) return `${versionCopy} Engine is running.`;
    if (engineRunning === false) return `${versionCopy} Engine is idle.`;
    return versionCopy;
}

export function OrionIntegrationStatus({
    health,
    engineRunning = null
}: {
    health: OrionIntegrationHealth;
    engineRunning?: boolean | null;
}) {
    const warning = health.kind === "version-incompatible" || health.kind === "integration-unavailable";
    const notInstalled = health.kind === "not-installed";
    const runtime = deriveConnectedOrionRuntime(health.kind === "connected" ? engineRunning : null);
    const engineStateClass = health.kind === "connected" && runtime.state != null
        ? ` is-engine-${runtime.state}`
        : "";
    const copy = health.kind === "connected" ? runtime.copy : HEALTH_COPY[health.kind];

    return (
        <span className={`quest-ui-orion-status is-${health.kind}${engineStateClass}`} title={healthTitle(health, engineRunning)}>
            {warning
                ? <span className="quest-ui-orion-status-warning" aria-hidden="true">⚠</span>
                : notInstalled
                    ? <span className="quest-ui-orion-status-question" aria-hidden="true">?</span>
                    : <span className="quest-ui-orion-status-dot" aria-hidden="true" />}
            <span className="quest-ui-orion-status-copy">{copy}</span>
            {health.installedVersion && (
                <span className={`quest-ui-version-chip quest-ui-version-chip-orion ${versionChannelClass(health.installedVersion)}`}>{health.installedVersion}</span>
            )}
        </span>
    );
}
