export interface OrbRewardAmounts {
    base: number;
    boosted: number;
}

function positiveAmount(value: unknown): number {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function orbRewardAmounts(rewards: unknown): OrbRewardAmounts {
    if (!Array.isArray(rewards)) return { base: 0, boosted: 0 };

    let base = 0;
    let boosted = 0;

    for (const reward of rewards) {
        if (!reward || typeof reward !== "object" || Array.isArray(reward)) continue;
        const row = reward as Record<string, unknown>;
        const baseAmount = positiveAmount(row.orbQuantity);
        const explicitBoostedAmount = positiveAmount(row.premiumOrbQuantity);

        base += baseAmount;
        boosted += explicitBoostedAmount > 0 ? explicitBoostedAmount : baseAmount;
    }

    return { base, boosted };
}


export function effectiveOrbRewardAmount(
    amounts: OrbRewardAmounts,
    receivesBoost: boolean
): number {
    return receivesBoost && amounts.boosted > amounts.base ? amounts.boosted : amounts.base;
}
