export interface IgnoredQuestState {
    version: 1;
    accounts: Record<string, string[]>;
}

const MAX_ACCOUNTS = 32;
const MAX_QUESTS_PER_ACCOUNT = 512;

function normalizedId(value: unknown, maxLength = 128): string | null {
    if (typeof value !== "string") return null;
    const id = value.trim();
    return id.length > 0 && id.length <= maxLength ? id : null;
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
    const ids = new Set(accounts[normalizedAccountId] ?? []);
    if (ignored) ids.add(normalizedQuestId);
    else ids.delete(normalizedQuestId);

    const next = Array.from(ids).slice(0, MAX_QUESTS_PER_ACCOUNT);
    if (next.length > 0) accounts[normalizedAccountId] = next;
    else delete accounts[normalizedAccountId];

    return { version: 1, accounts };
}
