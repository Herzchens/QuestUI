export const ORION_MIN_COMPANION_VERSION = "4.10.7";

export type OrionIntegrationHealthKind =
    | "not-installed"
    | "disabled"
    | "integration-off"
    | "version-incompatible"
    | "starting"
    | "integration-unavailable"
    | "connected";

export type OrionIntegrationHealth = {
    kind: OrionIntegrationHealthKind;
    installedVersion: string | null;
};

export type OrionIntegrationHealthFacts = {
    installed: boolean;
    enabled: boolean;
    integrationEnabled: boolean;
    started: boolean;
    version: unknown;
    commandCompatible: boolean;
    companionCompatible: boolean;
    snapshotCompatible: boolean;
};

export type ConnectedOrionRuntime = {
    state: "running" | "idle" | null;
    copy: "Orion Quest Running" | "Orion Quest Idle" | "Orion Quest Connected";
};

type ParsedVersion = readonly [major: number, minor: number, patch: number];

export function parseOrionVersion(value: unknown): ParsedVersion | null {
    if (typeof value !== "string") return null;
    const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
    if (!match) return null;

    const parsed = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
    return parsed.every(Number.isSafeInteger) ? parsed : null;
}

function compareParsedVersions(left: ParsedVersion, right: ParsedVersion): number {
    for (let index = 0; index < 3; index++) {
        if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
    }
    return 0;
}

export function isKnownOrionVersionIncompatible(
    value: unknown,
    minimum = ORION_MIN_COMPANION_VERSION
): boolean {
    const current = parseOrionVersion(value);
    const required = parseOrionVersion(minimum);
    return current != null && required != null && compareParsedVersions(current, required) < 0;
}

export function deriveConnectedOrionRuntime(running: boolean | null | undefined): ConnectedOrionRuntime {
    if (running === true) return { state: "running", copy: "Orion Quest Running" };
    if (running === false) return { state: "idle", copy: "Orion Quest Idle" };
    return { state: null, copy: "Orion Quest Connected" };
}

function displayVersion(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function deriveOrionIntegrationHealth(facts: OrionIntegrationHealthFacts): OrionIntegrationHealth {
    const installedVersion = displayVersion(facts.version);

    if (!facts.installed) return { kind: "not-installed", installedVersion: null };
    if (!facts.enabled) return { kind: "disabled", installedVersion };
    if (!facts.integrationEnabled) return { kind: "integration-off", installedVersion };
    if (isKnownOrionVersionIncompatible(facts.version)) {
        return { kind: "version-incompatible", installedVersion };
    }
    if (!facts.started) return { kind: "starting", installedVersion };
    if (!facts.commandCompatible || !facts.companionCompatible || !facts.snapshotCompatible) {
        return { kind: "integration-unavailable", installedVersion };
    }
    return { kind: "connected", installedVersion };
}
