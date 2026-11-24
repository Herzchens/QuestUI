export type VersionChannel = "stable" | "beta" | "alpha" | "prerelease" | "unknown";

const STABLE_VERSION = /^v?\d+\.\d+\.\d+$/i;
const BETA_VERSION = /^v?\d+\.\d+\.\d+-beta(?:[.-]?[0-9A-Za-z][0-9A-Za-z.-]*)?$/i;
const ALPHA_VERSION = /^v?\d+\.\d+\.\d+-alpha(?:[.-]?[0-9A-Za-z][0-9A-Za-z.-]*)?$/i;
const PRERELEASE_VERSION = /^v?\d+\.\d+\.\d+-(?:rc|dev|pre|preview|canary|nightly|snapshot)(?:[.-][0-9A-Za-z.-]+)?$/i;

export function classifyVersionChannel(value: unknown): VersionChannel {
    if (typeof value !== "string") return "unknown";
    const version = value.trim();
    if (!version) return "unknown";
    if (STABLE_VERSION.test(version)) return "stable";
    if (BETA_VERSION.test(version)) return "beta";
    if (ALPHA_VERSION.test(version)) return "alpha";
    if (PRERELEASE_VERSION.test(version)) return "prerelease";
    return "unknown";
}

export function versionChannelClass(value: unknown): string {
    return `is-${classifyVersionChannel(value)}`;
}
