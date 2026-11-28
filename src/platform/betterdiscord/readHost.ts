import { normalizeQuest, readRawQuests, type NormalizedQuest, type QuestCatalogueStore } from "../../quests/model";

/** Only the official host API; no token, REST, patcher or native bridge. */
export interface BetterDiscordReadHost {
    Webpack: { getStore(name: string): unknown; };
}
interface UserStore {
    getCurrentUser?(): { id?: unknown; } | null;
}
interface ProductStore {
    getProductsForSku?(id: string): any[] | undefined;
}
export type PreviewSnapshot =
    | { kind: "ready"; quests: NormalizedQuest[]; }
    | { kind: "unavailable"; reason: string; quests: []; };

function unavailable(reason: string): PreviewSnapshot {
    return { kind: "unavailable", reason, quests: [] };
}
function currentUser(host: BetterDiscordReadHost): string | null {
    const store = host.Webpack.getStore("UserStore") as UserStore | undefined;
    const id = store?.getCurrentUser?.()?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
}
export function readBetterDiscordQuests(host: BetterDiscordReadHost, now = Date.now()): PreviewSnapshot {
    try {
        const owner = currentUser(host);
        if (!owner) return unavailable("Waiting for a Discord account.");
        const store = (host.Webpack.getStore("QuestStore") ?? host.Webpack.getStore("QuestsStore")) as QuestCatalogueStore | undefined;
        if (!store?.quests || (typeof store.quests !== "object" && !Array.isArray(store.quests))) {
            return unavailable("Discord Quest catalogue is not available. Open Quest Home and refresh.");
        }
        const products = host.Webpack.getStore("StorefrontProductStore") as ProductStore | undefined;
        const raw = readRawQuests(store);
        if (raw.length > 10000) return unavailable("Quest catalogue exceeds preview capacity.");
        const unique = new Set<string>();
        const quests: NormalizedQuest[] = [];
        for (const item of raw) {
            const id = item?.id ?? item?.config?.id;
            if (typeof id !== "string" || !id || unique.has(id) || !item?.config) continue;
            const quest = normalizeQuest(item, now, {
                productsForSku: skuId => products?.getProductsForSku?.(skuId)
            });
            if (quest.id !== id) continue;
            unique.add(id);
            // No Discord object references are retained by the panel.
            quests.push({ ...quest, name: typeof quest.name === "string" ? quest.name : "Quest " + id, rawQuest: null });
        }
        if (currentUser(host) !== owner) return unavailable("Discord account changed. Refresh again.");
        return { kind: "ready", quests };
    } catch {
        return unavailable("Discord Quest catalogue could not be read. Open Quest Home and retry.");
    }
}
