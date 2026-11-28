import { findByCodeLazy } from "@webpack";
import { captureAccountSession, isCurrentAccountSession, type AccountSession } from "../../plugin/accountSession";

const nativeFetchCurrentQuests = findByCodeLazy("QUESTS_FETCH_CURRENT_QUESTS_BEGIN") as () => Promise<unknown> | unknown;

interface InFlightReload {
    session: AccountSession;
    promise: Promise<void>;
}

let inFlightReload: InFlightReload | null = null;

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
    const session = captureAccountSession();
    if (!session) {
        return Promise.reject(new QuestReloadError("Discord account is unavailable for Quest refresh."));
    }

    const current = inFlightReload;
    if (current?.session === session) return current.promise;

    const predecessor = current?.promise ?? null;
    const entry: InFlightReload = {
        session,
        promise: Promise.resolve()
    };

    entry.promise = (async () => {
        if (predecessor) {
            try { await predecessor; } catch { }
        }
        if (!isCurrentAccountSession(session)) {
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
