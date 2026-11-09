export interface ClaimAllQuestLike {
    id: string;
    name: string;
    status: string;
}

export interface ClaimAllBatchResult {
    total: number;
    claimed: number;
    skipped: number;
}

export interface ClaimAllBatchProgress extends ClaimAllBatchResult {
    position: number;
    questId: string;
    questName: string;
}

export type ClaimAllCurrentState = "claimable" | "claimed" | "unavailable";

export interface ClaimAllBatchRuntime<T extends ClaimAllQuestLike> {
    currentAccountId(): string | null;
    currentState(questId: string): ClaimAllCurrentState;
    claim(quest: T): Promise<{ storeConfirmed: boolean; }>;
}

export class ClaimAllBatchStoppedError<T extends ClaimAllQuestLike = ClaimAllQuestLike> extends Error {
    constructor(
        message: string,
        public readonly result: ClaimAllBatchResult,
        public readonly position: number,
        public readonly quest: T,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = "ClaimAllBatchStoppedError";
    }
}

export function buildClaimAllSnapshot<T extends ClaimAllQuestLike>(quests: readonly T[]): T[] {
    const seen = new Set<string>();
    const result: T[] = [];

    for (const quest of quests) {
        const id = String(quest?.id ?? "").trim();
        if (!id || quest.status !== "claimable" || seen.has(id)) continue;
        seen.add(id);
        result.push(quest);
    }

    return result;
}

export async function runClaimAllBatch<T extends ClaimAllQuestLike>(
    quests: readonly T[],
    expectedAccountId: string,
    runtime: ClaimAllBatchRuntime<T>,
    onProgress?: (progress: ClaimAllBatchProgress) => void
): Promise<ClaimAllBatchResult> {
    const total = quests.length;
    let claimed = 0;
    let skipped = 0;

    for (let index = 0; index < quests.length; index++) {
        const quest = quests[index];
        const position = index + 1;
        const result = (): ClaimAllBatchResult => ({ total, claimed, skipped });

        if (runtime.currentAccountId() !== expectedAccountId) {
            throw new ClaimAllBatchStoppedError(
                "Discord account changed while Claim all was running.",
                result(),
                position,
                quest
            );
        }

        const state = runtime.currentState(quest.id);
        if (state === "claimed") {
            skipped++;
            continue;
        }
        if (state !== "claimable") {
            throw new ClaimAllBatchStoppedError(
                "This Quest is no longer ready to claim.",
                result(),
                position,
                quest
            );
        }

        onProgress?.({
            total,
            claimed,
            skipped,
            position,
            questId: quest.id,
            questName: quest.name
        });

        if (runtime.currentAccountId() !== expectedAccountId) {
            throw new ClaimAllBatchStoppedError(
                "Discord account changed while Claim all was running.",
                result(),
                position,
                quest
            );
        }

        let claimResult: { storeConfirmed: boolean; };
        try {
            claimResult = await runtime.claim(quest);
        } catch (error) {
            throw new ClaimAllBatchStoppedError(
                error instanceof Error ? error.message : "Discord rejected the Quest reward claim.",
                result(),
                position,
                quest,
                error
            );
        }

        if (!claimResult.storeConfirmed) {
            throw new ClaimAllBatchStoppedError(
                "Discord submitted the claim but QuestStore did not confirm it yet. Claim all stopped to avoid an ambiguous next claim.",
                result(),
                position,
                quest
            );
        }

        claimed++;
    }

    return { total, claimed, skipped };
}
