import { sanitizeEventText } from "../eventLog/logic";
import type { EventLogQuestRef } from "../eventLog/types";
import type { QuestTaskType } from "./data";

export function findQuestByIdentity<T extends { id: string; name: string; }>(
    identity: Pick<EventLogQuestRef, "id" | "name">,
    quests: readonly T[]
): T | null {
    const id = identity.id?.trim();
    if (id) return quests.find(quest => quest.id === id) ?? null;

    const name = identity.name?.trim().toLocaleLowerCase();
    if (!name) return null;
    const matches = quests.filter(quest => quest.name.trim().toLocaleLowerCase() === name);
    return matches.length === 1 ? matches[0] : null;
}

export function taskTypeForKey(key: string): QuestTaskType {
    if (key === "ACHIEVEMENT_IN_ACTIVITY" || key === "ACHIEVEMENT_IN_GAME" || key === "PLAY_ACTIVITY") return "activity";
    if (key.startsWith("STREAM")) return "stream";
    if (key.includes("VIDEO")) return "video";
    if (key.startsWith("PLAY")) return "play";
    if (key.includes("ACTIVITY") || key.includes("ACHIEVEMENT")) return "activity";
    return "other";
}

// Persist only public Discord Quest assets, never signed query parameters,
// arbitrary remote URLs, raw Quest objects or reward-code values.
export function safeQuestArtworkUrl(value: unknown): string | null {
    if (typeof value !== "string" || value.length > 2048) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
        if (url.hostname !== "cdn.discordapp.com" && url.hostname !== "media.discordapp.net") return null;
        if (!/^\/quests\/[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+$/.test(url.pathname)) return null;
        return url.origin + url.pathname;
    } catch {
        return null;
    }
}

export function normalizeQuestPresentationMetadata(value: Record<string, unknown>): Partial<EventLogQuestRef> {
    const metadata: Partial<EventLogQuestRef> = {};
    if (typeof value.rewardLabel === "string" && value.rewardLabel.trim()) {
        metadata.rewardLabel = sanitizeEventText(value.rewardLabel.trim(), 240);
    }
    const dark = safeQuestArtworkUrl(value.artworkDark);
    const light = safeQuestArtworkUrl(value.artworkLight);
    if (dark) metadata.artworkDark = dark;
    if (light) metadata.artworkLight = light;
    return metadata;
}

// Use Discord's canonical Quest share URL and delegate routing/eligibility to its
// native link handler. Never interpret an arbitrary Quest field as a URL.
export function questShareUrl(id: unknown): string {
    return typeof id === "string" && /^\d{17,20}$/.test(id)
        ? `https://discord.com/quests/${id}`
        : "https://discord.com/quest-home";
}
