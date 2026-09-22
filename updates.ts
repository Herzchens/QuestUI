import * as DataStore from "@api/DataStore";
import { plugins } from "@api/PluginManager";

import {
    normalizeUpdateCheckHours,
    parseSemver,
    selectLatestEligibleRelease,
    shouldRunScheduledUpdateCheck,
    type ReleaseLike
} from "./updateLogic";
import { QUESTUI_VERSION } from "./version";

export type UpdateProduct = "questui" | "orion";
export type UpdateSuppression = "skipped" | "snoozed" | null;

export interface UpdateRelease extends ReleaseLike {
    tagName: string;
    name: string | null;
    htmlUrl: string;
    publishedAt: string | null;
    prerelease: boolean;
    draft: false;
}

export type PluginUpdateState =
    | { kind: "idle"; installed: string | null; }
    | { kind: "not-installed"; installed: null; }
    | { kind: "disabled"; installed: string | null; }
    | { kind: "custom-version"; installed: string | null; }
    | { kind: "up-to-date"; installed: string; }
    | { kind: "available"; installed: string; release: UpdateRelease; suppression: UpdateSuppression; snoozeUntil: number | null; }
    | { kind: "error"; installed: string | null; message: string; };

export interface UpdateSnapshot {
    checking: boolean;
    checkedAt: number | null;
    lastSuccessfulCheckAt: number | null;
    automaticChecksEnabled: boolean;
    questUI: PluginUpdateState;
    orion: PluginUpdateState;
}

export interface UpdatePreferences {
    checkHours: unknown;
    includePrereleases: boolean;
    checkOrion: boolean;
}

interface PersistedUpdateState {
    version: 1;
    lastSuccessfulCheckAt: number | null;
    skippedQuestUIVersion: string | null;
    skippedOrionVersion: string | null;
    snoozeQuestUIUntil: number | null;
    snoozeOrionUntil: number | null;
    questUIReleases: UpdateRelease[];
    orionReleases: UpdateRelease[];
}

const DATA_STORE_KEY = "QuestUI:update-state:v1";
const REQUEST_TIMEOUT_MS = 15_000;
const FAILED_RETRY_MS = 60 * 60 * 1000;
const MAX_RELEASES = 30;
const MAX_CACHED_RELEASES = 10;

const RELEASE_FEEDS: Record<UpdateProduct, string> = {
    questui: "https://api.github.com/repos/Herzchens/QuestUI/releases?per_page=30",
    orion: "https://api.github.com/repos/nyxxbit/discord-quest-completer/releases?per_page=30"
};

const RELEASE_URL_PREFIXES: Record<UpdateProduct, string> = {
    questui: "https://github.com/Herzchens/QuestUI/releases/",
    orion: "https://github.com/nyxxbit/discord-quest-completer/releases/"
};

const listeners = new Set<() => void>();
let persisted: PersistedUpdateState = defaultPersistedState();
let persistedReady = false;
let loadPromise: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let preferenceReader: (() => UpdatePreferences) | null = null;
let lastPreferences: UpdatePreferences | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let activeCheck: Promise<UpdateSnapshot> | null = null;
let lastAttemptAt = 0;
let lastAttemptFailed = false;
let started = false;
let cachedQuestUIReleases: UpdateRelease[] | null = null;
let cachedOrionReleases: UpdateRelease[] | null = null;

let snapshot: UpdateSnapshot = {
    checking: false,
    checkedAt: null,
    lastSuccessfulCheckAt: null,
    automaticChecksEnabled: true,
    questUI: { kind: "idle", installed: QUESTUI_VERSION },
    orion: { kind: "not-installed", installed: null }
};

function defaultPersistedState(): PersistedUpdateState {
    return {
        version: 1,
        lastSuccessfulCheckAt: null,
        skippedQuestUIVersion: null,
        skippedOrionVersion: null,
        snoozeQuestUIUntil: null,
        snoozeOrionUntil: null,
        questUIReleases: [],
        orionReleases: []
    };
}

function finiteTimestamp(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizedString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCachedRelease(value: unknown, product: UpdateProduct): UpdateRelease | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const tagName = normalizedString(raw.tagName);
    const htmlUrl = normalizedString(raw.htmlUrl);
    if (!tagName || !parseSemver(tagName) || !htmlUrl?.startsWith(RELEASE_URL_PREFIXES[product])) return null;

    return {
        tagName,
        name: normalizedString(raw.name),
        htmlUrl,
        publishedAt: normalizedString(raw.publishedAt),
        prerelease: raw.prerelease === true,
        draft: false
    };
}

function normalizeCachedReleaseList(value: unknown, product: UpdateProduct): UpdateRelease[] {
    if (!Array.isArray(value)) return [];
    return value
        .slice(0, MAX_CACHED_RELEASES)
        .map(entry => normalizeCachedRelease(entry, product))
        .filter((release): release is UpdateRelease => release !== null);
}

function normalizePersistedState(value: unknown): PersistedUpdateState {
    if (!value || typeof value !== "object" || Array.isArray(value)) return defaultPersistedState();
    const raw = value as Record<string, unknown>;
    return {
        version: 1,
        lastSuccessfulCheckAt: finiteTimestamp(raw.lastSuccessfulCheckAt),
        skippedQuestUIVersion: normalizedString(raw.skippedQuestUIVersion),
        skippedOrionVersion: normalizedString(raw.skippedOrionVersion),
        snoozeQuestUIUntil: finiteTimestamp(raw.snoozeQuestUIUntil),
        snoozeOrionUntil: finiteTimestamp(raw.snoozeOrionUntil),
        questUIReleases: normalizeCachedReleaseList(raw.questUIReleases, "questui"),
        orionReleases: normalizeCachedReleaseList(raw.orionReleases, "orion")
    };
}

function hydrateCachesFromPersisted(): void {
    cachedQuestUIReleases = persisted.questUIReleases.length > 0 ? [...persisted.questUIReleases] : null;
    cachedOrionReleases = persisted.orionReleases.length > 0 ? [...persisted.orionReleases] : null;
}

async function ensurePersistedState(): Promise<void> {
    if (persistedReady) return;
    if (loadPromise) return loadPromise;

    loadPromise = DataStore.get(DATA_STORE_KEY)
        .then(value => { persisted = normalizePersistedState(value); })
        .catch(() => { persisted = defaultPersistedState(); })
        .then(() => {
            persistedReady = true;
            loadPromise = null;
            hydrateCachesFromPersisted();
            snapshot = {
                ...snapshot,
                checkedAt: persisted.lastSuccessfulCheckAt,
                lastSuccessfulCheckAt: persisted.lastSuccessfulCheckAt
            };
            notify();
        });
    return loadPromise;
}

async function writePersistedState(next: PersistedUpdateState): Promise<void> {
    writeChain = writeChain
        .catch(() => undefined)
        .then(async () => {
            await DataStore.update<PersistedUpdateState>(DATA_STORE_KEY, () => next);
        });
    return writeChain;
}

async function reloadPersistedAfterFailure(): Promise<void> {
    try { persisted = normalizePersistedState(await DataStore.get(DATA_STORE_KEY)); }
    catch { persisted = defaultPersistedState(); }
    hydrateCachesFromPersisted();
}

function notify(): void {
    for (const listener of listeners) listener();
}

function readPreferences(): UpdatePreferences {
    const raw = preferenceReader?.() ?? {
        checkHours: 6,
        includePrereleases: false,
        checkOrion: true
    };
    return {
        checkHours: normalizeUpdateCheckHours(raw.checkHours),
        includePrereleases: raw.includePrereleases === true,
        checkOrion: raw.checkOrion !== false
    };
}

function installedOrionVersion(): string | null {
    const current = (plugins as any)?.OrionQuests;
    if (!current) return null;
    return normalizedString(current.version);
}

function orionInstalled(): boolean {
    return Boolean((plugins as any)?.OrionQuests);
}

function normalizeApiRelease(value: unknown, product: UpdateProduct): UpdateRelease | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const tagName = normalizedString(raw.tag_name);
    const htmlUrl = normalizedString(raw.html_url);
    if (!tagName || !parseSemver(tagName) || !htmlUrl?.startsWith(RELEASE_URL_PREFIXES[product])) return null;
    if (raw.draft === true) return null;

    return {
        tagName,
        name: normalizedString(raw.name),
        htmlUrl,
        publishedAt: normalizedString(raw.published_at),
        prerelease: raw.prerelease === true,
        draft: false
    };
}

async function fetchReleaseFeed(product: UpdateProduct): Promise<UpdateRelease[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(RELEASE_FEEDS[product], {
            cache: "no-store",
            headers: { Accept: "application/vnd.github+json" },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
        const payload = await response.json();
        if (!Array.isArray(payload)) throw new Error("GitHub returned an invalid release feed.");
        return payload
            .slice(0, MAX_RELEASES)
            .map(value => normalizeApiRelease(value, product))
            .filter((release): release is UpdateRelease => release !== null);
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new Error("GitHub release check timed out.");
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function suppressionFor(product: UpdateProduct, version: string, now: number): { suppression: UpdateSuppression; snoozeUntil: number | null; } {
    const skipped = product === "questui" ? persisted.skippedQuestUIVersion : persisted.skippedOrionVersion;
    const snoozeUntil = product === "questui" ? persisted.snoozeQuestUIUntil : persisted.snoozeOrionUntil;
    if (skipped === version) return { suppression: "skipped", snoozeUntil };
    if (snoozeUntil != null && snoozeUntil > now) return { suppression: "snoozed", snoozeUntil };
    return { suppression: null, snoozeUntil };
}

function resolvePluginState(
    product: UpdateProduct,
    installed: string | null,
    releases: readonly UpdateRelease[],
    includePrereleases: boolean,
    now: number
): PluginUpdateState {
    if (!installed || !parseSemver(installed)) return { kind: "custom-version", installed };
    const release = selectLatestEligibleRelease(releases, installed, includePrereleases);
    if (!release) return { kind: "up-to-date", installed };

    const suppression = suppressionFor(product, release.tagName, now);
    return {
        kind: "available",
        installed,
        release,
        suppression: suppression.suppression,
        snoozeUntil: suppression.snoozeUntil
    };
}

function recomputeCachedPolicy(now = Date.now()): void {
    const preferences = readPreferences();
    snapshot = {
        ...snapshot,
        automaticChecksEnabled: normalizeUpdateCheckHours(preferences.checkHours) > 0
    };

    if (cachedQuestUIReleases) {
        snapshot = {
            ...snapshot,
            questUI: resolvePluginState("questui", QUESTUI_VERSION, cachedQuestUIReleases, preferences.includePrereleases, now)
        };
    }

    if (!orionInstalled()) {
        snapshot = { ...snapshot, orion: { kind: "not-installed", installed: null } };
    } else if (!preferences.checkOrion) {
        snapshot = { ...snapshot, orion: { kind: "disabled", installed: installedOrionVersion() } };
    } else if (cachedOrionReleases) {
        snapshot = {
            ...snapshot,
            orion: resolvePluginState("orion", installedOrionVersion(), cachedOrionReleases, preferences.includePrereleases, now)
        };
    } else {
        snapshot = { ...snapshot, orion: { kind: "idle", installed: installedOrionVersion() } };
    }
    notify();
}

function clearTimer(): void {
    if (timer) clearTimeout(timer);
    timer = null;
}

function nextScheduledDelay(now = Date.now()): number | null {
    const hours = normalizeUpdateCheckHours(readPreferences().checkHours);
    if (hours === 0) return null;

    const interval = hours * 60 * 60 * 1000;
    const lastSuccessful = persisted.lastSuccessfulCheckAt;
    const dueAt = lastSuccessful == null ? now : lastSuccessful + interval;
    let delay = Math.max(0, dueAt - now);

    if (lastAttemptFailed && lastAttemptAt > 0) {
        delay = Math.max(delay, lastAttemptAt + FAILED_RETRY_MS - now);
    }
    return Math.max(250, delay);
}

function scheduleNextCheck(): void {
    clearTimer();
    if (!started || !preferenceReader) return;
    const delay = nextScheduledDelay();
    if (delay == null) return;
    timer = setTimeout(() => { void checkForUpdates(false); }, delay);
}

export function subscribeUpdateState(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getUpdateSnapshot(): UpdateSnapshot {
    return snapshot;
}

export async function checkForUpdates(manual = true): Promise<UpdateSnapshot> {
    await ensurePersistedState();
    if (activeCheck) return activeCheck;

    const preferences = readPreferences();
    const now = Date.now();
    if (!manual && !shouldRunScheduledUpdateCheck(persisted.lastSuccessfulCheckAt, now, preferences.checkHours)) {
        scheduleNextCheck();
        return snapshot;
    }

    activeCheck = (async () => {
        lastAttemptAt = now;
        snapshot = { ...snapshot, checking: true };
        notify();

        const wantsOrion = preferences.checkOrion && orionInstalled();
        const questPromise = fetchReleaseFeed("questui");
        const orionPromise = wantsOrion ? fetchReleaseFeed("orion") : null;
        const [questResult, orionResult] = await Promise.all([
            questPromise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error })),
            orionPromise
                ? orionPromise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }))
                : Promise.resolve(null)
        ]);

        const checkedAt = Date.now();
        if (questResult.ok) {
            cachedQuestUIReleases = questResult.value;
            snapshot = {
                ...snapshot,
                questUI: resolvePluginState("questui", QUESTUI_VERSION, questResult.value, preferences.includePrereleases, checkedAt)
            };
        } else {
            snapshot = {
                ...snapshot,
                questUI: {
                    kind: "error",
                    installed: QUESTUI_VERSION,
                    message: questResult.error instanceof Error ? questResult.error.message : "QuestUI update check failed."
                }
            };
        }

        if (!orionInstalled()) {
            snapshot = { ...snapshot, orion: { kind: "not-installed", installed: null } };
        } else if (!preferences.checkOrion) {
            snapshot = { ...snapshot, orion: { kind: "disabled", installed: installedOrionVersion() } };
        } else if (orionResult?.ok) {
            cachedOrionReleases = orionResult.value;
            snapshot = {
                ...snapshot,
                orion: resolvePluginState("orion", installedOrionVersion(), orionResult.value, preferences.includePrereleases, checkedAt)
            };
        } else {
            snapshot = {
                ...snapshot,
                orion: {
                    kind: "error",
                    installed: installedOrionVersion(),
                    message: orionResult?.error instanceof Error ? orionResult.error.message : "Orion update check failed."
                }
            };
        }

        const fullySuccessful = questResult.ok && (!wantsOrion || orionResult?.ok === true);
        lastAttemptFailed = !fullySuccessful;

        const nextPersisted: PersistedUpdateState = {
            ...persisted,
            lastSuccessfulCheckAt: fullySuccessful ? checkedAt : persisted.lastSuccessfulCheckAt,
            questUIReleases: questResult.ok
                ? questResult.value.slice(0, MAX_CACHED_RELEASES)
                : persisted.questUIReleases,
            orionReleases: orionResult?.ok
                ? orionResult.value.slice(0, MAX_CACHED_RELEASES)
                : persisted.orionReleases
        };
        persisted = nextPersisted;
        try { await writePersistedState(nextPersisted); } catch { }

        snapshot = {
            ...snapshot,
            checking: false,
            checkedAt,
            lastSuccessfulCheckAt: persisted.lastSuccessfulCheckAt
        };
        notify();
        scheduleNextCheck();
        return snapshot;
    })().finally(() => { activeCheck = null; });

    return activeCheck;
}

export async function snoozeUpdate(product: UpdateProduct, hours = 24): Promise<void> {
    await ensurePersistedState();
    const previous = persisted;
    const until = Date.now() + Math.max(1, Math.min(24 * 30, hours)) * 60 * 60 * 1000;
    const next = product === "questui"
        ? { ...persisted, snoozeQuestUIUntil: until }
        : { ...persisted, snoozeOrionUntil: until };
    persisted = next;
    try {
        await writePersistedState(next);
    } catch (error) {
        persisted = previous;
        await reloadPersistedAfterFailure();
        recomputeCachedPolicy();
        throw error;
    }
    recomputeCachedPolicy();
}

export async function skipUpdate(product: UpdateProduct, version: string): Promise<void> {
    await ensurePersistedState();
    const normalizedVersion = version.trim();
    if (!normalizedVersion) return;

    const previous = persisted;
    const next = product === "questui"
        ? { ...persisted, skippedQuestUIVersion: normalizedVersion, snoozeQuestUIUntil: null }
        : { ...persisted, skippedOrionVersion: normalizedVersion, snoozeOrionUntil: null };
    persisted = next;
    try {
        await writePersistedState(next);
    } catch (error) {
        persisted = previous;
        await reloadPersistedAfterFailure();
        recomputeCachedPolicy();
        throw error;
    }
    recomputeCachedPolicy();
}

export function notifyUpdateSettingsChanged(): void {
    const nextPreferences = readPreferences();
    const needsFreshOrion = nextPreferences.checkOrion
        && lastPreferences?.checkOrion === false
        && orionInstalled()
        && cachedOrionReleases == null;
    lastPreferences = nextPreferences;
    recomputeCachedPolicy();
    scheduleNextCheck();
    if (started && needsFreshOrion) void checkForUpdates(true);
}

export function startUpdateChecks(read: () => UpdatePreferences): void {
    preferenceReader = read;
    lastPreferences = readPreferences();
    started = true;
    void ensurePersistedState().then(async () => {
        if (!started) return;
        recomputeCachedPolicy();
        const preferences = readPreferences();
        const needsOrionSeed = preferences.checkOrion && orionInstalled() && cachedOrionReleases == null;
        if (needsOrionSeed || shouldRunScheduledUpdateCheck(persisted.lastSuccessfulCheckAt, Date.now(), preferences.checkHours)) {
            await checkForUpdates(false);
        } else {
            scheduleNextCheck();
        }
    });
}

export function stopUpdateChecks(): void {
    started = false;
    clearTimer();
    preferenceReader = null;
    lastPreferences = null;
}
