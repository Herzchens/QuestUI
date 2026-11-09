import { findStore, findStoreLazy, proxyLazyWebpack } from "@webpack";

const resolveQuestStore = Object.assign(
    () => {
        try {
            const store = findStore("QuestStore");
            if (store) return store;
        } catch { }

        return findStore("QuestsStore");
    },
    { $$vencordProps: ["QuestStore", "QuestsStore"] }
);

export const QuestsStore = proxyLazyWebpack(resolveQuestStore) as any;
export const VirtualCurrencyStore = findStoreLazy("VirtualCurrencyStore") as any;
