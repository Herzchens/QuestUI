import { findByCodeLazy } from "@webpack";

const nativeFetchCurrentQuests = findByCodeLazy("QUESTS_FETCH_CURRENT_QUESTS_BEGIN") as () => Promise<unknown> | unknown;

let inFlightReload: Promise<void> | null = null;

export class QuestReloadError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = "QuestReloadError";
    }
}

function reloadFailureMessage(error: unknown): string {
    const message = error instanceof Error ? error.message.trim() : "";
    if (!message) return "Discord's native Quest refresh failed.";
    return `Discord's native Quest refresh failed: ${message.slice(0, 200)}`;
}

/** Use Discord's own fetch-and-dispatch action; QuestUI never mutates QuestStore itself. */
export function reloadQuestList(): Promise<void> {
    if (inFlightReload) return inFlightReload;

    inFlightReload = (async () => {
        try {
            await Promise.resolve(nativeFetchCurrentQuests());
        } catch (error) {
            throw new QuestReloadError(reloadFailureMessage(error), error);
        } finally {
            inFlightReload = null;
        }
    })();

    return inFlightReload;
}
