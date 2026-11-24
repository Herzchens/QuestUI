import type { PluginUpdateState, UpdateProduct } from "./runtime";
import { parseSemver } from "./logic";

type NoticeHistory = Record<string, string[]>;
const MAX_ACCOUNTS = 64;
const MAX_VERSIONS_PER_ACCOUNT = 64;

export function availableUpdateNoticeVersion(state: PluginUpdateState): string | null {
    return state.kind === "available" && state.suppression === null ? state.release.tagName : null;
}

export function rememberUpdateNotice(
    value: unknown, accountId: string, product: UpdateProduct, version: string
): { history: NoticeHistory; added: boolean; } {
    const entries: Array<[string, string[]]> = [];
    const validAccount = (id: string) => /^\d{1,24}$/.test(id);
    const validKey = (key: unknown): key is string => {
        if (typeof key !== "string" || key.length > 160) return false;
        const separator = key.indexOf(":");
        return separator > 0 && ["questui", "orion"].includes(key.slice(0, separator))
            && !!parseSemver(key.slice(separator + 1));
    };
    if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [id, keys] of Object.entries(value).slice(-MAX_ACCOUNTS)) {
            if (!validAccount(id) || !Array.isArray(keys)) continue;
            entries.push([id, [...new Set(keys.filter(validKey))].slice(-MAX_VERSIONS_PER_ACCOUNT)]);
        }
    }
    const history = Object.fromEntries(entries);
    const key = product + ":" + version;
    if (!validAccount(accountId) || !validKey(key)) return { history, added: false };
    const previous = history[accountId] ?? [];
    if (previous.includes(key)) return { history, added: false };
    delete history[accountId];
    history[accountId] = [...previous, key].slice(-MAX_VERSIONS_PER_ACCOUNT);
    return { history: Object.fromEntries(Object.entries(history).slice(-MAX_ACCOUNTS)), added: true };
}
