import { readBetterDiscordQuests, type BetterDiscordReadHost, type PreviewSnapshot } from "./readHost";
import { filterQuests, dashboardScopeFromSettings, formatExpiry, formatQuestProgress } from "../../quests/model";
import { DASHBOARD_SORT_OPTIONS, normalizeDashboardSortMode, sortDashboardQuests } from "../../dashboard/sort";

type ReactAPI = typeof import("react");
type BetterDiscordAPI = BetterDiscordReadHost & { React: ReactAPI; };
function host(): BetterDiscordAPI {
    const api = (globalThis as typeof globalThis & { BdApi?: BetterDiscordAPI; }).BdApi;
    if (!api?.React?.createElement || typeof api.Webpack?.getStore !== "function") {
        throw new Error("QuestUI Preview requires the BetterDiscord React and Webpack APIs.");
    }
    return api;
}
const OFF: PreviewSnapshot = { kind: "unavailable", reason: "Enable QuestUI Preview to view Quests.", quests: [] };

export default class QuestUIPreview {
    private running = false;
    private listeners = new Set<() => void>();
    private snapshot: PreviewSnapshot = OFF;
    private timer: ReturnType<typeof setInterval> | undefined;

    private refresh = () => {
        if (!this.running || !this.listeners.size) return;
        this.snapshot = readBetterDiscordQuests(host());
        this.publish();
    };
    private publish() {
        for (const listener of [...this.listeners]) {
            try { listener(); } catch { /* A view cannot prevent cleanup. */ }
        }
    }
    private getSnapshot = () => this.snapshot;
    private clearTimer() {
        if (this.timer !== undefined) clearInterval(this.timer);
        this.timer = undefined;
    }
    private activate() {
        if (!this.running || !this.listeners.size || this.timer !== undefined) return;
        this.timer = setInterval(this.refresh, 2000);
        this.refresh();
    }
    private subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        this.activate();
        return () => {
            this.listeners.delete(listener);
            if (!this.listeners.size) {
                this.clearTimer();
                this.snapshot = OFF;
            }
        };
    };
    start() {
        if (this.running) return;
        host();
        this.running = true;
        this.activate();
    }
    stop() {
        this.running = false;
        this.clearTimer();
        this.snapshot = OFF;
        this.publish();
    }
    private Panel = () => {
        const React = host().React;
        const snapshot = React.useSyncExternalStore(this.subscribe, this.getSnapshot, this.getSnapshot);
        const [history, setHistory] = React.useState(false);
        const [sort, setSort] = React.useState("expiring");
        const [query, setQuery] = React.useState("");
        const e = React.createElement;
        const scope = dashboardScopeFromSettings({ dashboardShowClaimed: history, dashboardShowExpired: history });
        const search = query.trim().toLowerCase();
        const quests = sortDashboardQuests(filterQuests(snapshot.quests, scope), normalizeDashboardSortMode(sort))
            .filter(quest => !search || quest.name.toLowerCase().includes(search));
        const control = { background: "var(--background-secondary)", color: "var(--text-normal)", padding: 8, border: "1px solid var(--background-modifier-accent)", borderRadius: 6 };
        return e("section", { "aria-label": "QuestUI Preview", style: { color: "var(--text-normal)", display: "grid", gap: 12 } },
            e("h2", null, "QuestUI — BetterDiscord Preview"),
            e("p", null, "Read-only catalogue using Discord's stored Quest state. Native live progress, actions, Orion integration, Ignore rules and the Vencord dashboard themes are not supported in this preview."),
            e("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" } },
                e("input", { "aria-label": "Search Quests", placeholder: "Search Quests", value: query, maxLength: 100, style: control, onChange: (event: import("react").ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value) }),
                e("select", { "aria-label": "Sort Quests", value: sort, style: control, onChange: (event: import("react").ChangeEvent<HTMLSelectElement>) => setSort(event.currentTarget.value) },
                    ...DASHBOARD_SORT_OPTIONS.map(option => e("option", { key: option.value, value: option.value }, option.label))),
                e("label", null, e("input", { type: "checkbox", checked: history, onChange: (event: import("react").ChangeEvent<HTMLInputElement>) => setHistory(event.currentTarget.checked) }), " Show history"),
                e("button", { type: "button", style: control, onClick: this.refresh, disabled: !this.running }, "Refresh")
            ),
            snapshot.kind !== "ready"
                ? e("p", { role: "status" }, snapshot.reason)
                : e(React.Fragment, null, e("p", { role: "status" }, quests.length + " matching Quests"),
                    ...quests.slice(0, 512).map(quest => e("article", { key: quest.id, style: { border: "1px solid var(--background-modifier-accent)", background: "var(--background-secondary)", padding: 12, borderRadius: 8, display: "grid", gap: 6 } },
                        e("strong", { style: { overflowWrap: "anywhere" } }, quest.name),
                        e("span", null, quest.status + " · " + quest.reward.label),
                        e("span", null, formatQuestProgress(quest)),
                        e("span", null, formatExpiry(quest.expiresAt) ?? "Expiry unavailable")
                    )),
                    quests.length > 512 ? e("p", null, "Showing the first 512 results. Refine the search to see more.") : null)
        );
    };
    getSettingsPanel() {
        return host().React.createElement(this.Panel);
    }
}
