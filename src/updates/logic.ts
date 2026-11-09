export const UPDATE_CHECK_HOURS = [0, 3, 6, 12, 24, 72, 168] as const;
export const UPDATE_CHECK_STEP_MARKERS = [0, 1, 2, 3, 4, 5, 6] as const;
export const DEFAULT_UPDATE_CHECK_HOURS = 6;
export const DEFAULT_UPDATE_CHECK_STEP = 2;

export interface ParsedSemver {
    raw: string;
    major: number;
    minor: number;
    patch: number;
    prerelease: readonly (string | number)[];
}

export interface ReleaseLike {
    tagName: string;
    name?: string | null;
    htmlUrl?: string | null;
    body?: string | null;
    publishedAt?: string | null;
    prerelease?: boolean;
    draft?: boolean;
}

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parsePrerelease(value: string | undefined): readonly (string | number)[] {
    if (!value) return [];
    return value.split(".").map(part => /^\d+$/.test(part) ? Number(part) : part);
}

export function parseSemver(value: unknown): ParsedSemver | null {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    const match = SEMVER_PATTERN.exec(raw);
    if (!match) return null;

    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (![major, minor, patch].every(Number.isSafeInteger)) return null;

    return {
        raw,
        major,
        minor,
        patch,
        prerelease: parsePrerelease(match[4])
    };
}

function compareParsedSemver(left: ParsedSemver, right: ParsedSemver): number {
    for (const key of ["major", "minor", "patch"] as const) {
        if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
    }

    const leftPre = left.prerelease;
    const rightPre = right.prerelease;
    if (leftPre.length === 0 || rightPre.length === 0) {
        if (leftPre.length === rightPre.length) return 0;
        return leftPre.length === 0 ? 1 : -1;
    }

    const count = Math.max(leftPre.length, rightPre.length);
    for (let index = 0; index < count; index++) {
        const leftPart = leftPre[index];
        const rightPart = rightPre[index];
        if (leftPart === undefined) return -1;
        if (rightPart === undefined) return 1;
        if (leftPart === rightPart) continue;

        const leftNumeric = typeof leftPart === "number";
        const rightNumeric = typeof rightPart === "number";
        if (leftNumeric && rightNumeric) return leftPart < rightPart ? -1 : 1;
        if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;

        return String(leftPart).localeCompare(String(rightPart)) < 0 ? -1 : 1;
    }

    return 0;
}

export function compareSemver(left: unknown, right: unknown): number | null {
    const parsedLeft = parseSemver(left);
    const parsedRight = parseSemver(right);
    if (!parsedLeft || !parsedRight) return null;
    return compareParsedSemver(parsedLeft, parsedRight);
}

export function isPrereleaseVersion(value: unknown): boolean {
    return (parseSemver(value)?.prerelease.length ?? 0) > 0;
}

export function normalizeUpdateCheckStep(value: unknown): number {
    const numeric = Number(value);
    return UPDATE_CHECK_STEP_MARKERS.includes(numeric as typeof UPDATE_CHECK_STEP_MARKERS[number])
        ? numeric
        : DEFAULT_UPDATE_CHECK_STEP;
}

export function updateCheckHoursFromStep(value: unknown): number {
    return UPDATE_CHECK_HOURS[normalizeUpdateCheckStep(value)] ?? DEFAULT_UPDATE_CHECK_HOURS;
}

export function normalizeUpdateCheckHours(value: unknown): number {
    const numeric = Number(value);
    return UPDATE_CHECK_HOURS.includes(numeric as typeof UPDATE_CHECK_HOURS[number])
        ? numeric
        : DEFAULT_UPDATE_CHECK_HOURS;
}

export function updateCheckMarkerLabel(value: unknown): string {
    const hours = updateCheckHoursFromStep(value);
    if (hours === 0) return "0";
    if (hours === 72) return "3d";
    if (hours === 168) return "7d";
    return `${hours}h`;
}

export function updateCheckIntervalLabel(value: unknown): string {
    const hours = normalizeUpdateCheckHours(value);
    if (hours === 0) return "Manual only";
    if (hours === 72) return "3 days";
    if (hours === 168) return "7 days";
    return `${hours} hours`;
}

export function shouldRunScheduledUpdateCheck(
    lastSuccessfulCheckAt: number | null | undefined,
    now: number,
    configuredHours: unknown
): boolean {
    const hours = normalizeUpdateCheckHours(configuredHours);
    if (hours === 0) return false;
    if (!Number.isFinite(lastSuccessfulCheckAt)) return true;
    if (!Number.isFinite(now)) return false;

    const elapsed = now - Number(lastSuccessfulCheckAt);
    return elapsed >= hours * 60 * 60 * 1000;
}

export interface UpdateHealthTimestamps {
    questUI: number | null;
    orion: number | null;
}

function normalizeStoredTimestamp(value: unknown): number | null {
    if (value == null || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function normalizeUpdateHealthTimestamps(value: unknown): UpdateHealthTimestamps {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { questUI: null, orion: null };
    }

    const raw = value as Record<string, unknown>;
    const legacy = normalizeStoredTimestamp(raw.lastSuccessfulCheckAt);
    return {
        questUI: Object.prototype.hasOwnProperty.call(raw, "questUILastSuccessfulCheckAt")
            ? normalizeStoredTimestamp(raw.questUILastSuccessfulCheckAt)
            : legacy,
        orion: Object.prototype.hasOwnProperty.call(raw, "orionLastSuccessfulCheckAt")
            ? normalizeStoredTimestamp(raw.orionLastSuccessfulCheckAt)
            : legacy
    };
}

export function nextUpdateHealthTimestamps(
    current: UpdateHealthTimestamps,
    checkedAt: number,
    questUISucceeded: boolean,
    orionAttempted: boolean,
    orionSucceeded: boolean
): UpdateHealthTimestamps {
    const successfulAt = normalizeStoredTimestamp(checkedAt);
    if (successfulAt == null) return { ...current };

    return {
        questUI: questUISucceeded ? successfulAt : current.questUI,
        orion: orionAttempted && orionSucceeded ? successfulAt : current.orion
    };
}

export function updateScheduleBaseline(
    health: UpdateHealthTimestamps,
    includeOrion: boolean
): number | null {
    const required = includeOrion
        ? [health.questUI, health.orion]
        : [health.questUI];

    if (required.some(timestamp => !Number.isFinite(timestamp))) return null;
    return Math.min(...required.map(Number));
}

function isReleasePrerelease(release: ReleaseLike, parsed: ParsedSemver): boolean {
    return release.prerelease === true || parsed.prerelease.length > 0;
}

export function selectLatestEligibleRelease<T extends ReleaseLike>(
    releases: readonly T[],
    installedVersion: unknown,
    includePrereleases: boolean
): T | null {
    const installed = parseSemver(installedVersion);
    if (!installed) return null;

    let best: { release: T; version: ParsedSemver; } | null = null;
    for (const release of releases) {
        if (release.draft === true) continue;

        const version = parseSemver(release.tagName);
        if (!version) continue;
        if (!includePrereleases && isReleasePrerelease(release, version)) continue;
        if (compareParsedSemver(version, installed) <= 0) continue;

        if (!best || compareParsedSemver(version, best.version) > 0) {
            best = { release, version };
        }
    }

    return best?.release ?? null;
}
