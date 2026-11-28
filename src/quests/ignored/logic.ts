export interface IgnoredQuestState {
    version: 1;
    accounts: Record<string, string[]>;
}

const MAX_ACCOUNTS = 32;
const MAX_QUESTS_PER_ACCOUNT = 512;

export class IgnoredQuestCapacityError extends Error {
    constructor(message: string) { super(message); this.name = "IgnoredQuestCapacityError"; }
}

function normalizedId(value: unknown, maxLength = 128): string | null {
    if (typeof value !== "string") return null;
    const id = value.trim();
    return id.length > 0 && id.length <= maxLength && id !== "prototype" && !Object.prototype.hasOwnProperty.call(Object.prototype, id) ? id : null;
}

function normalizedQuestIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const candidate of value) {
        const id = normalizedId(candidate);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        if (ids.length >= MAX_QUESTS_PER_ACCOUNT) break;
    }
    return ids;
}

export function normalizeIgnoredQuestState(value: unknown): IgnoredQuestState {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { version: 1, accounts: {} };
    }

    const raw = value as Record<string, unknown>;
    const rawAccounts = typeof raw.accounts === "object" && raw.accounts !== null && !Array.isArray(raw.accounts)
        ? raw.accounts as Record<string, unknown>
        : {};
    const accounts: Record<string, string[]> = {};

    for (const [rawAccountId, rawQuestIds] of Object.entries(rawAccounts)) {
        const accountId = normalizedId(rawAccountId);
        if (!accountId) continue;
        const questIds = normalizedQuestIds(rawQuestIds);
        if (questIds.length > 0) accounts[accountId] = questIds;
        if (Object.keys(accounts).length >= MAX_ACCOUNTS) break;
    }

    return { version: 1, accounts };
}

export function ignoredQuestIdsForAccount(value: unknown, accountId: string | null | undefined): string[] {
    const normalizedAccountId = normalizedId(accountId);
    if (!normalizedAccountId) return [];
    return [...(normalizeIgnoredQuestState(value).accounts[normalizedAccountId] ?? [])];
}

export function updateIgnoredQuestState(
    value: unknown,
    accountId: string,
    questId: string,
    ignored: boolean
): IgnoredQuestState {
    const normalizedAccountId = normalizedId(accountId);
    const normalizedQuestId = normalizedId(questId);
    const current = normalizeIgnoredQuestState(value);
    if (!normalizedAccountId || !normalizedQuestId) return current;

    const accounts = { ...current.accounts };
    const existing = accounts[normalizedAccountId] ?? [];

    if (!ignored) {
        const next = existing.filter(id => id !== normalizedQuestId);
        if (next.length > 0) accounts[normalizedAccountId] = next;
        else delete accounts[normalizedAccountId];
        return { version: 1, accounts };
    }

    // Never silently remove another exclusion to make room for a new one.
    // Re-ignoring an existing Quest is allowed at capacity.
    if (!existing.includes(normalizedQuestId) && existing.length >= MAX_QUESTS_PER_ACCOUNT) {
        throw new IgnoredQuestCapacityError("Ignore limit reached (512 Quests). Unignore a Quest before adding another.");
    }
    if (!Object.hasOwn(accounts, normalizedAccountId) && Object.keys(accounts).length >= MAX_ACCOUNTS) {
        throw new IgnoredQuestCapacityError("Ignore account limit reached (32 accounts). Clear unused account preferences before adding another.");
    }
    const next = existing.filter(id => id !== normalizedQuestId);
    next.push(normalizedQuestId);
    accounts[normalizedAccountId] = next;

    return { version: 1, accounts };
}

export function pruneIgnoredQuestState(
    value: unknown,
    accountId: string,
    questIds: Iterable<string>
): IgnoredQuestState {
    const normalizedAccountId = normalizedId(accountId);
    const current = normalizeIgnoredQuestState(value);
    if (!normalizedAccountId) return current;

    const remove = new Set<string>();
    for (const candidate of questIds) {
        const questId = normalizedId(candidate);
        if (questId) remove.add(questId);
    }
    if (remove.size === 0) return current;

    const existing = current.accounts[normalizedAccountId] ?? [];
    const next = existing.filter(id => !remove.has(id));
    if (next.length === existing.length) return current;

    const accounts = { ...current.accounts };
    if (next.length > 0) accounts[normalizedAccountId] = next;
    else delete accounts[normalizedAccountId];

    return { version: 1, accounts };
}

/** Only positively known terminal quests retire an Ignore preference. Missing quests do not. */
export function terminalIgnoredQuestIds(quests: Iterable<any>, now = Date.now()): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const quest of quests) {
        const id = normalizedId(quest?.id ?? quest?.config?.id);
        if (!id) continue;
        const claimed = quest?.userStatus?.claimedAt;
        const expiry = quest?.config?.expiresAt;
        const validDate = (value: unknown) => (typeof value === "string" || typeof value === "number" || value instanceof Date)
            && Number.isFinite(new Date(value).getTime());
        if (validDate(claimed) || (validDate(expiry) && new Date(expiry).getTime() <= now)) ids.add(id);
    }
    return ids;
}
