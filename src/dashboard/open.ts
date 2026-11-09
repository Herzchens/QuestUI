export type QuestDashboardSurface = "top-bar" | "settings-bar";

type QuestDashboardOpener = () => void;

const openers = new Map<QuestDashboardSurface, QuestDashboardOpener>();
const PREFERRED_SURFACES: readonly QuestDashboardSurface[] = ["top-bar", "settings-bar"];

export function registerQuestDashboardOpener(
    surface: QuestDashboardSurface,
    opener: QuestDashboardOpener
): () => void {
    openers.set(surface, opener);
    return () => {
        if (openers.get(surface) === opener) openers.delete(surface);
    };
}

export function openQuestDashboard(): boolean {
    for (const surface of PREFERRED_SURFACES) {
        const opener = openers.get(surface);
        if (!opener) continue;
        opener();
        return true;
    }
    return false;
}
