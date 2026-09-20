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
