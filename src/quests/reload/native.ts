import { findByCodeLazy } from "@webpack";
import { createLatestNativeRequest } from "../../plugin/latestNativeRequest";
import { captureAccountSession, isCurrentAccountSession, type AccountSession } from "../../plugin/accountSession";

const nativeFetchCurrentQuests = findByCodeLazy("QUESTS_FETCH_CURRENT_QUESTS_BEGIN") as () => Promise<unknown> | unknown;

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

const requestReload = createLatestNativeRequest<AccountSession>(async () => {
    try { await Promise.resolve(nativeFetchCurrentQuests()); }
    catch (error) { throw new QuestReloadError(reloadFailureMessage(error), error); }
}, isCurrentAccountSession, () => new QuestReloadError("Discord account changed before Quest refresh could start."));

/** Use Discord's own fetch-and-dispatch action; QuestUI never mutates QuestStore itself. */
export function reloadQuestList(): Promise<void> {
    const session = captureAccountSession();
    if (!session) return Promise.reject(new QuestReloadError("Discord account is unavailable for Quest refresh."));
    return requestReload(session);
}
