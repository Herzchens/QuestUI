import { findByCodeLazy } from "@webpack";
import { UserStore } from "@webpack/common";

const nativeFetchCurrentQuests = findByCodeLazy("QUESTS_FETCH_CURRENT_QUESTS_BEGIN") as () => Promise<unknown> | unknown;

interface InFlightReload {
    accountId: string;
    promise: Promise<void>;
}

let inFlightReload: InFlightReload | null = null;

function currentAccountId(): string | null {
    return UserStore.getCurrentUser()?.id ?? null;
}

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
    const reloadAccountId = currentAccountId();
    if (!reloadAccountId) {
        return Promise.reject(new QuestReloadError("Discord account is unavailable for Quest refresh."));
    }

    const current = inFlightReload;
    if (current?.accountId === reloadAccountId) return current.promise;

    const predecessor = current?.promise ?? null;
    const entry: InFlightReload = {
        accountId: reloadAccountId,
        promise: Promise.resolve()
    };

    entry.promise = (async () => {
        if (predecessor) {
            try { await predecessor; } catch { }
        }
        if (currentAccountId() !== reloadAccountId) {
            throw new QuestReloadError("Discord account changed before Quest refresh could start.");
        }

        try {
            await Promise.resolve(nativeFetchCurrentQuests());
        } catch (error) {
            throw new QuestReloadError(reloadFailureMessage(error), error);
        }
    })().finally(() => {
        if (inFlightReload === entry) inFlightReload = null;
    });

    inFlightReload = entry;
    return entry.promise;
}
