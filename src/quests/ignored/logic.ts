export interface IgnoredQuestState {
    version: 1;
    accounts: Record<string, string[]>;
    ruleAccounts?: Record<string, IgnoreRule[]>;
    ruleExceptions?: Record<string, string[]>;
}

export type IgnoreRule = Readonly<{ kind: "name-contains" | "application-id"; value: string; }>;
export const MAX_IGNORE_RULES = 64;

const MAX_ACCOUNTS = 32;
const MAX_QUESTS_PER_ACCOUNT = 512;

export class IgnoredQuestPreferenceError extends Error {}

export class IgnoredQuestCapacityError extends IgnoredQuestPreferenceError {
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

function nameKey(value: string): string { return value.normalize("NFKC").toLowerCase(); }

function normalizeRule(value: unknown): IgnoreRule | null {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.value !== "string") return null;
    const text = candidate.value.trim();
    if (candidate.kind === "name-contains" && text.length >= 2 && text.length <= 100) {
        return { kind: "name-contains", value: text };
    }
    if (candidate.kind === "application-id" && /^[0-9]{1,32}$/.test(text)) return { kind: "application-id", value: text };
    return null;
}
function ruleKey(rule: IgnoreRule): string {
    return rule.kind + ":" + (rule.kind === "name-contains" ? nameKey(rule.value) : rule.value);
}
function normalizedRules(value: unknown): IgnoreRule[] {
    if (!Array.isArray(value)) return [];
    const rules: IgnoreRule[] = [];
    const seen = new Set<string>();
    for (const candidate of value) {
        const rule = normalizeRule(candidate);
        if (!rule || seen.has(ruleKey(rule))) continue;
        seen.add(ruleKey(rule));
        rules.push(rule);
        if (rules.length >= MAX_IGNORE_RULES) break;
    }
    return rules;
}
function normalizeAccountMap<T>(value: unknown, parse: (value: unknown) => T[]): Record<string, T[]> {
    const result: Record<string, T[]> = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;
    for (const [rawId, rawItems] of Object.entries(value)) {
        const id = normalizedId(rawId);
        if (!id) continue;
        const items = parse(rawItems);
        if (items.length) result[id] = items;
        if (Object.keys(result).length >= MAX_ACCOUNTS) break;
    }
    return result;
}

export function ignoreRuleMatches(rule: IgnoreRule, quest: any): boolean {
    const config = quest?.config;
    if (rule.kind === "application-id") return String(config?.application?.id ?? "") === rule.value;
    const name = config?.messages?.questName ?? config?.application?.name ?? config?.messages?.gameTitle;
    return typeof name === "string" && nameKey(name).includes(nameKey(rule.value));
}

export function matchingIgnoredQuestIds(rules: readonly IgnoreRule[], quests: Iterable<unknown>, now = Date.now()): ReadonlySet<string> {
    const ids = new Set<string>();
    let scanned = 0;
    for (const candidate of quests) {
        if (++scanned > 10000) throw new Error("Quest rule catalogue exceeds safety limit.");
        const quest = candidate as any;
        const id = normalizedId(quest?.id ?? quest?.config?.id);
        if (!id || terminalIgnoredQuestIds([quest], now).size || !rules.some(rule => ignoreRuleMatches(rule, quest))) continue;
        ids.add(id);
    }
    return ids;
}

export function sameIgnoreRules(a: readonly IgnoreRule[], b: readonly IgnoreRule[]): boolean {
    return a.length === b.length && a.every((rule, i) => rule.kind === b[i].kind && rule.value === b[i].value);
}

export function normalizeIgnoredQuestState(value: unknown): IgnoredQuestState {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { version: 1, accounts: {} };
    }

    const raw = value as Record<string, unknown>;
    const accounts = normalizeAccountMap(raw.accounts, normalizedQuestIds);
    const ruleAccounts = normalizeAccountMap(raw.ruleAccounts, normalizedRules);
    const ruleExceptions = normalizeAccountMap(raw.ruleExceptions, normalizedQuestIds);
    return { version: 1, accounts,
        ...(Object.keys(ruleAccounts).length ? { ruleAccounts } : {}),
        ...(Object.keys(ruleExceptions).length ? { ruleExceptions } : {}) };
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
        return { ...current, accounts };
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

    return { ...current, accounts };
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

    return { ...current, accounts };
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


export function replaceAccountIgnoreRules(value: unknown, accountId: string, expected: readonly IgnoreRule[], proposed: readonly IgnoreRule[]): IgnoredQuestState {
    const current = normalizeIgnoredQuestState(value);
    const account = normalizedId(accountId);
    if (!account) throw new IgnoredQuestPreferenceError("Invalid Ignore account.");
    const existing = current.ruleAccounts?.[account] ?? [];
    if (!sameIgnoreRules(existing, expected)) throw new IgnoredQuestPreferenceError("Ignore rules changed. Refresh and try again.");
    if (!Array.isArray(proposed) || proposed.length > MAX_IGNORE_RULES) throw new IgnoredQuestCapacityError("Ignore rule limit reached (64).");
    const rules = normalizedRules(proposed);
    if (rules.length !== proposed.length) throw new IgnoredQuestPreferenceError("Invalid or duplicate Ignore rule.");
    const ruleAccounts = { ...current.ruleAccounts };
    if (rules.length && !Object.hasOwn(ruleAccounts, account) && Object.keys(ruleAccounts).length >= MAX_ACCOUNTS) {
        throw new IgnoredQuestCapacityError("Ignore rule account limit reached (32).");
    }
    if (rules.length) ruleAccounts[account] = rules;
    else delete ruleAccounts[account];
    const { ruleAccounts: _old, ...rest } = current;
    return { ...rest, ...(Object.keys(ruleAccounts).length ? { ruleAccounts } : {}) };
}

/** An explicit Unignore overrides a matching rule for this quest until its terminal state. */
export function updateEffectiveIgnore(value: unknown, accountId: string, questId: string, ignored: boolean, matchedByRule: boolean): IgnoredQuestState {
    const current = updateIgnoredQuestState(value, accountId, questId, ignored);
    const account = normalizedId(accountId), id = normalizedId(questId);
    if (!account || !id) return current;
    const exceptions = { ...current.ruleExceptions };
    const existing = exceptions[account] ?? [];
    let next = existing.filter(item => item !== id);
    if (!ignored && matchedByRule) {
        if (next.length >= MAX_QUESTS_PER_ACCOUNT) throw new IgnoredQuestCapacityError("Ignore exception limit reached (512).");
        if (!Object.hasOwn(exceptions, account) && Object.keys(exceptions).length >= MAX_ACCOUNTS) throw new IgnoredQuestCapacityError("Ignore exception account limit reached (32).");
        next = [...next, id];
    } else if (!ignored) next = existing;
    if (next.length) exceptions[account] = next;
    else delete exceptions[account];
    const { ruleExceptions: _old, ...rest } = current;
    return { ...rest, ...(Object.keys(exceptions).length ? { ruleExceptions: exceptions } : {}) };
}

export function pruneIgnoreExceptions(value: unknown, accountId: string, ids: Iterable<string>): IgnoredQuestState {
    const current = normalizeIgnoredQuestState(value);
    const account = normalizedId(accountId);
    if (!account || !current.ruleExceptions?.[account]) return current;
    const remove = new Set(ids);
    const exceptions = { ...current.ruleExceptions };
    const next = exceptions[account].filter(id => !remove.has(id));
    if (next.length) exceptions[account] = next;
    else delete exceptions[account];
    const { ruleExceptions: _old, ...rest } = current;
    return { ...rest, ...(Object.keys(exceptions).length ? { ruleExceptions: exceptions } : {}) };
}
