import { createSnapshotSource } from "./snapshotSource";
import { findByCodeLazy, findStoreLazy } from "@webpack";
import { useEffect, useState } from "@webpack/common";

import { sameQuestShortcutSnapshot } from "./shortcut";
import { findQuestByIdentity } from "./presentationLogic";
import type { EventLogQuestRef } from "../eventLog/types";
import { QuestsStore } from "../plugin/stores";
import { normalizeQuest, readRawQuests, type DiscordTaskDetails, type NormalizedQuest, type QuestReadPorts, type QuestSnapshotMode } from "./model";

export * from "./model";

// Discord's native Quest task selector/details helper. It chooses the task from
// heartbeat/update timestamps and eventName, then applies Discord's own stored,
// optimistic-video, and active-desktop progress calculation. QuestUI does not run
// a parallel progress engine and does not consume Orion's private dashboard state.
const getDiscordSelectedTaskDetails = findByCodeLazy(
    "heartbeat?.lastBeatAt",
    "updatedAt",
    "eventName",
    "includeTaskTypes"
) as (quest: any, includeTaskTypes?: Set<string>) => DiscordTaskDetails | null;

const StorefrontProductStore = findStoreLazy("StorefrontProductStore") as {
    getProductsForSku?: (skuId: string) => any[] | undefined;
};

const readPorts: QuestReadPorts = {
    selectedTaskDetails: quest => getDiscordSelectedTaskDetails(quest),
    productsForSku: skuId => StorefrontProductStore?.getProductsForSku?.(skuId)
};

// This is only a Dashboard/live-progress render clock. Shortcut surfaces use a
// store-driven subscription so their interactive Header Bar target is not forced
// through a new render four times per second when only progress changes.
const REFRESH_FALLBACK_MS = 250;
const SHORTCUT_REFRESH_FALLBACK_MS = 60_000;

export function readQuestByIdentity(identity: Pick<EventLogQuestRef, "id" | "name">): NormalizedQuest | null {
    const candidates = readRawQuests(QuestsStore).map(rawQuest => {
        const id = String(rawQuest?.id ?? rawQuest?.config?.id ?? "");
        const name = String(rawQuest?.config?.messages?.questName
            ?? rawQuest?.config?.application?.name
            ?? rawQuest?.config?.messages?.gameTitle
            ?? (id ? `Quest ${id}` : ""));
        return { id, name, rawQuest };
    });
    const matched = findQuestByIdentity(identity, candidates);
    return matched ? normalizeQuest(matched.rawQuest, Date.now(), readPorts) : null;
}

function readSnapshot(): NormalizedQuest[] {
    const now = Date.now();
    return readRawQuests(QuestsStore).map(quest => normalizeQuest(quest, now, readPorts));
}

// A single store binding normalizes each event once, even when the dashboard
// and a shortcut are both mounted. The live fallback remains 250 ms.
const snapshotSource = createSnapshotSource(readSnapshot, () => QuestsStore, SHORTCUT_REFRESH_FALLBACK_MS);
let liveConsumers = 0;

export function startQuestSnapshotSources(): void {
    snapshotSource.start();
}

export function stopQuestSnapshotSources(): void {
    snapshotSource.stop();
}

export function useQuestSnapshot(mode: QuestSnapshotMode = "live"): NormalizedQuest[] {
    const [snapshot, setSnapshot] = useState<NormalizedQuest[]>(readSnapshot);
    useEffect(() => {
        if (mode === "live") {
            liveConsumers++;
            snapshotSource.setIntervalMs(REFRESH_FALLBACK_MS);
        }
        let lastForcedAt = -Infinity;
        const unsubscribe = snapshotSource.subscribe((next, force) => {
            const now = Date.now();
            const forceShortcut = force && (now < lastForcedAt || now - lastForcedAt >= SHORTCUT_REFRESH_FALLBACK_MS);
            if (forceShortcut) lastForcedAt = now;
            setSnapshot(previous => mode !== "live" && !forceShortcut && sameQuestShortcutSnapshot(previous, next) ? previous : next);
        });
        return () => {
            unsubscribe();
            if (mode === "live" && --liveConsumers === 0) snapshotSource.setIntervalMs(SHORTCUT_REFRESH_FALLBACK_MS);
        };
    }, [mode]);
    return snapshot;
}

