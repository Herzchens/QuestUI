import type { PluginUpdateState, ProductUpdateHealth, UpdateProduct, UpdateRelease, UpdateSnapshot } from "./runtime";

const RELEASE_URL_PREFIXES: Record<UpdateProduct, string> = {
    questui: "https://github.com/Herzchens/QuestUI/releases/",
    orion: "https://github.com/nyxxbit/discord-quest-completer/releases/"
};

export function productLabel(product: UpdateProduct): string {
    return product === "questui" ? "QuestUI" : "OrionQuests";
}

export function visibleUpdate(state: PluginUpdateState): boolean {
    return state.kind === "available" && state.suppression === null;
}

export function availableUpdate(state: PluginUpdateState): state is Extract<PluginUpdateState, { kind: "available"; }> {
    return state.kind === "available";
}

export function safeOpenRelease(product: UpdateProduct, release: UpdateRelease): void {
    if (!release.htmlUrl.startsWith(RELEASE_URL_PREFIXES[product])) return;
    if (IS_WEB) {
        window.open(release.htmlUrl, "_blank", "noopener,noreferrer");
        return;
    }
    VencordNative.native.openExternal(release.htmlUrl);
}

export function formatTimestamp(timestamp: number | null): string {
    if (!Number.isFinite(timestamp)) return "Never";
    try {
        return new Date(Number(timestamp)).toLocaleString();
    } catch {
        return "Unknown";
    }
}

export function formatCompactTimestamp(timestamp: number | null): string {
    if (!Number.isFinite(timestamp)) return "Never";
    try {
        return new Date(Number(timestamp)).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    } catch {
        return "Unknown";
    }
}

export function stateCopy(product: UpdateProduct, state: PluginUpdateState): string {
    if (state.kind === "not-installed") return "Not installed";
    if (state.kind === "disabled") return "Update checks disabled";
    if (state.kind === "idle") return state.installed ? `Installed ${state.installed}` : "Waiting for first check";
    if (state.kind === "custom-version") return state.installed
        ? `Custom version ${state.installed}; automatic version comparison is disabled.`
        : "Installed version is unavailable.";
    if (state.kind === "up-to-date") return `${state.installed} is up to date.`;
    if (state.kind === "error") return state.message;
    if (state.suppression === "skipped") return `${state.release.tagName} is available, but this version is skipped.`;
    if (state.suppression === "snoozed") return `${state.release.tagName} is available; reminder snoozed until ${formatTimestamp(state.snoozeUntil)}.`;
    return `${state.installed} → ${state.release.tagName}`;
}

type UpdateVisualTone = "current" | "available" | "warning" | "error" | "muted";

export function stateTone(state: PluginUpdateState): UpdateVisualTone {
    if (state.kind === "up-to-date") return "current";
    if (state.kind === "available" && state.suppression === null) return "available";
    if (state.kind === "error") return "error";
    if (state.kind === "custom-version" || (state.kind === "available" && state.suppression !== null)) return "warning";
    return "muted";
}

export function updateProductTone(state: PluginUpdateState, health: ProductUpdateHealth): UpdateVisualTone {
    if (visibleUpdate(state)) return "available";
    if (health.error) return "error";
    return stateTone(state);
}

function stateMark(state: PluginUpdateState, health: ProductUpdateHealth): string {
    if (visibleUpdate(state)) return "↑";
    if (health.error) return "!";
    if (state.kind === "up-to-date") return "✓";
    if (state.kind === "error") return "!";
    if (state.kind === "custom-version") return "•";
    if (state.kind === "disabled") return "-";
    return "•";
}

function installedVersion(state: PluginUpdateState): string {
    return state.installed ?? "-";
}

function targetVersion(state: PluginUpdateState): string | null {
    return state.kind === "available" ? state.release.tagName : null;
}

export function visibleReleaseVersion(state: PluginUpdateState): string | null {
    return visibleUpdate(state) && state.kind === "available"
        ? state.release.tagName
        : null;
}

export function healthForProduct(snapshot: UpdateSnapshot, product: UpdateProduct): ProductUpdateHealth {
    return product === "questui" ? snapshot.questUIHealth : snapshot.orionHealth;
}

function productCheckFailed(snapshot: UpdateSnapshot, product: UpdateProduct): boolean {
    const state = product === "questui" ? snapshot.questUI : snapshot.orion;
    return healthForProduct(snapshot, product).error != null || state.kind === "error";
}

export function combinedAvailabilityCopy(snapshot: UpdateSnapshot): string {
    const questUIVersion = visibleReleaseVersion(snapshot.questUI);
    const orionVersion = visibleReleaseVersion(snapshot.orion);

    if (orionVersion && questUIVersion) {
        return `OrionQuest ${orionVersion} and QuestUI ${questUIVersion} are available`;
    }
    if (orionVersion) return `OrionQuest ${orionVersion} is available`;
    if (questUIVersion) return `QuestUI ${questUIVersion} is available`;

    const questUIError = productCheckFailed(snapshot, "questui");
    const orionError = productCheckFailed(snapshot, "orion");
    if (questUIError && orionError) return "Update checks need attention";
    if (questUIError) return "QuestUI update check needs attention";
    if (orionError) return "OrionQuests update check needs attention";

    return "You are up to date";
}

export function dashboardAvailabilityLines(snapshot: UpdateSnapshot): readonly [string, string | null] {
    const questUIVersion = visibleReleaseVersion(snapshot.questUI);
    const orionVersion = visibleReleaseVersion(snapshot.orion);

    if (snapshot.checking) return ["Checking updates…", null];
    if (orionVersion && questUIVersion) {
        return [`OrionQuest ${orionVersion} and`, `QuestUI ${questUIVersion} are available`];
    }
    if (orionVersion) return [`OrionQuest ${orionVersion}`, "is available"];
    if (questUIVersion) return [`QuestUI ${questUIVersion}`, "is available"];

    const questUIError = productCheckFailed(snapshot, "questui");
    const orionError = productCheckFailed(snapshot, "orion");
    if (questUIError && orionError) return ["Update checks", "need attention"];
    if (questUIError) return ["QuestUI update check", "needs attention"];
    if (orionError) return ["OrionQuests update check", "needs attention"];

    return ["You are up to date", null];
}

export function UpdateProductStatus({ product, state, health, compact = false }: {
    product: UpdateProduct;
    state: PluginUpdateState;
    health: ProductUpdateHealth;
    compact?: boolean;
}) {
    const tone = updateProductTone(state, health);
    const target = targetVersion(state);
    const available = state.kind === "available" && state.suppression === null;

    return (
        <div className={`quest-ui-update-product-status is-${tone}${compact ? " is-compact" : ""}`}>
            <span className="quest-ui-update-product-mark" aria-hidden="true">{stateMark(state, health)}</span>
            <strong>{productLabel(product)}</strong>
            <span className="quest-ui-update-product-version">{installedVersion(state)}</span>
            {target && (
                <>
                    <span className="quest-ui-update-product-arrow" aria-hidden="true">→</span>
                    <span className="quest-ui-update-product-target">{target}</span>
                </>
            )}
            {compact && available && <span className="quest-ui-update-product-new">NEW</span>}
        </div>
    );
}


export function UpdateCenterIcon() {
    return (
        <svg className="quest-ui-update-center-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 3h2v9.17l2.59-2.58L17 11l-5 5-5-5 1.41-1.41L11 12.17V3Z" />
            <path d="M5 17h2v2h10v-2h2v4H5v-4Z" />
        </svg>
    );
}

