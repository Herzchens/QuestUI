import * as DataStore from "@api/DataStore";
import { UserStore } from "@webpack/common";

import { recordQuestUIEvent } from "../eventLog/runtime";
import { normalizeEventAccountId } from "../eventLog/account";
import type { PluginUpdateState, UpdateProduct } from "./runtime";
import { availableUpdateNoticeVersion, rememberUpdateNotice } from "./notificationLogic";

const NOTICE_HISTORY_KEY = "QuestUI:update-notice-history:v1";

export function currentUpdateAccountId(): string | null {
    try { return normalizeEventAccountId(UserStore?.getCurrentUser?.()?.id); }
    catch { return null; }
}

export async function recordAvailableUpdate(
    product: UpdateProduct, state: PluginUpdateState, accountId: string,
    isCurrent: () => boolean
): Promise<void> {
    const version = availableUpdateNoticeVersion(state);
    if (!version || state.kind !== "available" || !isCurrent()) return;

    let added = false;
    try {
        // Only a deduplication marker is persisted here. Event Log still owns all rows.
        await DataStore.update<Record<string, string[]>>(NOTICE_HISTORY_KEY, stored => {
            if (!isCurrent()) return stored ?? {};
            const result = rememberUpdateNotice(stored, accountId, product, version);
            added = result.added;
            return result.history;
        });
    } catch {
        return; // Avoid repeated notices if durable deduplication is unavailable.
    }
    if (!added) return;

    const label = product === "questui" ? "QuestUI" : "OrionQuests";
    await recordQuestUIEvent({
        severity: "info",
        category: "diagnostic",
        eventCode: product === "questui" ? "QUESTUI_UPDATE_AVAILABLE" : "ORION_UPDATE_AVAILABLE",
        summary: label + " update available",
        detail: { product, fromVersion: state.installed, toVersion: version },
        accountId
    });
}
