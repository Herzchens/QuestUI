import * as DataStore from "@api/DataStore";
import { UserStore } from "@webpack/common";

import { recordQuestUIEvent } from "../eventLog/runtime";
import { normalizeEventAccountId } from "../eventLog/account";
import type { PluginUpdateState, UpdateProduct } from "./runtime";
import { availableUpdateNoticeVersion, rememberUpdateNotice } from "./notificationLogic";

const NOTICE_HISTORY_KEY = "QuestUI:update-notice-history:v1";
const inFlightNotices = new Set<string>();

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

    const key = product + ":" + version;
    const ownerKey = accountId + ":" + key;
    if (inFlightNotices.has(ownerKey)) return;
    inFlightNotices.add(ownerKey);
    try {
        let added = false;
        try {
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
        if (!isCurrent()) {
            // The owner changed while deduplication was being persisted. Do not
            // publish a stale event; release only this reservation for a later check.
            try {
                await DataStore.update<Record<string, string[]>>(NOTICE_HISTORY_KEY, stored => {
                    const history = { ...(stored ?? {}) };
                    const versions = history[accountId];
                    if (Array.isArray(versions)) history[accountId] = versions.filter(value => value !== key);
                    return history;
                });
            } catch { }
            return;
        }

        const label = product === "questui" ? "QuestUI" : "OrionQuests";
        await recordQuestUIEvent({
            severity: "info",
            category: "diagnostic",
            eventCode: product === "questui" ? "QUESTUI_UPDATE_AVAILABLE" : "ORION_UPDATE_AVAILABLE",
            summary: label + " update available",
            detail: { product, fromVersion: state.installed, toVersion: version },
            accountId
        });
    } finally {
        inFlightNotices.delete(ownerKey);
    }
}
