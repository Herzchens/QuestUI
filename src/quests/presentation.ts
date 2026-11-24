import { findByCodeLazy } from "@webpack";
import { UserStore } from "@webpack/common";

import type { EventLogQuestRef } from "../eventLog/types";
import { questOrbMultiplierStateForUser } from "../orbs/multiplier";
import { formatQuestRewardLabel } from "../orbs/rewards";
import type { NormalizedQuest } from "./data";
import { normalizeQuestPresentationMetadata } from "./presentationLogic";

type DiscordQuestAssetKind = "game_tile" | "quest_bar_hero_image" | "hero_image";
export type QuestTheme = "dark" | "light";

// Reuse Discord's asset resolver rather than constructing asset URLs from keys.
const getDiscordQuestAsset = findByCodeLazy(
    "\"game_tile\"",
    "\"quest_bar_hero\"",
    "\"video_player_thumbnail\""
) as (quest: any, assetKind: DiscordQuestAssetKind, theme?: QuestTheme) => { url: string; } | null;

export function resolveQuestArtwork(quest: NormalizedQuest | null, theme: QuestTheme): string | null {
    if (!quest) return null;
    const candidates: DiscordQuestAssetKind[] = ["game_tile", "quest_bar_hero_image", "hero_image"];
    for (const assetKind of candidates) {
        try {
            const asset = getDiscordQuestAsset(quest.rawQuest, assetKind, theme);
            if (asset?.url) return asset.url;
        } catch { }
    }
    return null;
}

export function captureQuestEventRef(quest: NormalizedQuest, accountId: string): EventLogQuestRef {
    const identity: EventLogQuestRef = {
        id: quest.id,
        name: quest.name,
        taskType: quest.primaryTask?.key ?? quest.tasks[0]?.key ?? null
    };
    try {
        const user = UserStore?.getCurrentUser?.();
        if (user?.id !== accountId) return identity;
        const { receivesBoost } = questOrbMultiplierStateForUser(user);
        return {
            ...identity,
            ...normalizeQuestPresentationMetadata({
                rewardLabel: formatQuestRewardLabel(quest.reward, receivesBoost),
                artworkDark: resolveQuestArtwork(quest, "dark"),
                artworkLight: resolveQuestArtwork(quest, "light")
            })
        };
    } catch {
        // A display-only snapshot must never interrupt a native Quest action.
        return identity;
    }
}
