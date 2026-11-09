export type VersionChannel = "stable" | "prerelease" | "unknown";

const STABLE_VERSION = /^v?\d+\.\d+\.\d+$/i;
const PRERELEASE_VERSION = /^v?\d+\.\d+\.\d+-(?:alpha|beta|rc|dev|pre|preview|canary|nightly|snapshot)(?:[.-][0-9A-Za-z.-]+)?$/i;

export function classifyVersionChannel(value: unknown): VersionChannel {
    if (typeof value !== "string") return "unknown";
    const version = value.trim();
    if (!version) return "unknown";
    if (STABLE_VERSION.test(version)) return "stable";
    if (PRERELEASE_VERSION.test(version)) return "prerelease";
    return "unknown";
}

export function versionChannelClass(value: unknown): string {
    return `is-${classifyVersionChannel(value)}`;
}
