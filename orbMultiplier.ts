import { findByCodeLazy } from "@webpack";
import { UserStore, useStateFromStores } from "@webpack/common";

export type QuestOrbMultiplierEligibility =
    | "NITRO"
    | "XBOX_GAME_PASS"
    | "UPSELL"
    | "INELIGIBLE";

export type QuestOrbMultiplierSource = "nitro" | "xbox_game_pass" | null;

export interface QuestOrbMultiplierState {
    eligibility: QuestOrbMultiplierEligibility | null;
    source: QuestOrbMultiplierSource;
    receivesBoost: boolean;
}

const getDiscordQuestOrbMultiplierEligibility = findByCodeLazy(
    "canUseMoreQuestOrbs",
    "XBOX_GAME_PASS",
    "isFractionalPremiumWithNoStandardSub"
) as ((user: any) => unknown) | undefined;

const MORE_QUEST_ORBS_PERK = 25;
const PERK_SOURCE_NITRO = 1;
const PERK_SOURCE_XBOX_GAME_PASS = 2;

function perkSources(user: any): number[] {
    const raw = user?.perks?.configByPerk?.[String(MORE_QUEST_ORBS_PERK)]?.source;
    if (Array.isArray(raw)) {
        return raw
            .map(value => Number(value))
            .filter(Number.isFinite);
    }

    const single = Number(raw);
    return Number.isFinite(single) ? [single] : [];
}

function sourceFromPerks(user: any): QuestOrbMultiplierSource {
    const sources = perkSources(user);
    // Mirror Discord's precedence: Nitro wins if both sources are present.
    if (sources.includes(PERK_SOURCE_NITRO)) return "nitro";
    if (sources.includes(PERK_SOURCE_XBOX_GAME_PASS)) return "xbox_game_pass";
    return null;
}

function recognizedEligibility(value: unknown): QuestOrbMultiplierEligibility | null {
    return value === "NITRO"
        || value === "XBOX_GAME_PASS"
        || value === "UPSELL"
        || value === "INELIGIBLE"
        ? value
        : null;
}

function fallbackFullNitroEligibility(user: any): boolean {
    if (Number(user?.premiumType ?? 0) !== 2) return false;

    try {
        if (user?.isFractionalPremiumWithNoStandardSub?.()) return false;
    } catch { }

    try {
        if (user?.isFractionalPremiumWithNoSubscription?.()) return false;
    } catch { }

    return true;
}

export function questOrbMultiplierStateForUser(user: any): QuestOrbMultiplierState {
    if (!user) return { eligibility: null, source: null, receivesBoost: false };

    let eligibility: QuestOrbMultiplierEligibility | null = null;
    try {
        eligibility = recognizedEligibility(getDiscordQuestOrbMultiplierEligibility?.(user));
    } catch { }

    if (eligibility === "XBOX_GAME_PASS") {
        return { eligibility, source: "xbox_game_pass", receivesBoost: true };
    }

    if (eligibility === "NITRO") {
        return { eligibility, source: "nitro", receivesBoost: true };
    }

    const hasNitroIdentity = Number(user?.premiumType ?? 0) > 0;
    if (eligibility != null) {
        return {
            eligibility,
            source: hasNitroIdentity ? "nitro" : null,
            receivesBoost: false
        };
    }

    // Stable/PTB/Canary do not always expose the exact same webpack module shape.
    // When the native classifier finder is unavailable, Discord still carries the
    // MORE_QUEST_ORBS perk source on the current user. Read that directly instead
    // of guessing Xbox from !Nitro or from premiumOrbQuantity.
    const perkSource = sourceFromPerks(user);
    if (perkSource === "nitro") {
        return { eligibility: null, source: "nitro", receivesBoost: true };
    }
    if (perkSource === "xbox_game_pass") {
        return { eligibility: null, source: "xbox_game_pass", receivesBoost: true };
    }

    return {
        eligibility: null,
        source: hasNitroIdentity ? "nitro" : null,
        receivesBoost: fallbackFullNitroEligibility(user)
    };
}

export function useQuestOrbMultiplierState(): QuestOrbMultiplierState {
    return useStateFromStores([UserStore], () =>
        questOrbMultiplierStateForUser(UserStore?.getCurrentUser?.())
    );
}
