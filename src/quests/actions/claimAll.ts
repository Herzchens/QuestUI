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

export type BatchActionMode = "claim" | "enroll";
export type ClaimAllCurrentState = "claimable" | "claimed" | "unavailable" | "skipped";

export interface ClaimAllBatchRuntime<T extends ClaimAllQuestLike> {
    mode?: BatchActionMode;
    currentAccountId(): string | null;
    currentState(questId: string): ClaimAllCurrentState;
    claim(quest: T): Promise<{ storeConfirmed: boolean; }>;
    shouldContinue?(): boolean;
    onConfirmed?(quest: T): void;
    waitBetweenClaims?(): Promise<void>;
}

const CLAIM_ALL_MIN_DELAY_MS = 1000;
const CLAIM_ALL_MAX_DELAY_MS = 3000;

export function claimAllDelayMs(random = Math.random): number {
    return CLAIM_ALL_MIN_DELAY_MS + Math.floor(random() * (CLAIM_ALL_MAX_DELAY_MS - CLAIM_ALL_MIN_DELAY_MS + 1));
}

export function waitBetweenClaimAllRequests(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, claimAllDelayMs()));
}

export class ClaimAllBatchStoppedError<T extends ClaimAllQuestLike = ClaimAllQuestLike> extends Error {
    constructor(
        message: string,
        public readonly result: ClaimAllBatchResult,
        public readonly position: number,
        public readonly quest: T,
        public readonly cause?: unknown,
        public readonly code: string = "BATCH_STOPPED"
    ) {
        super(message);
        this.name = "ClaimAllBatchStoppedError";
    }
}

export function buildClaimAllSnapshot<T extends ClaimAllQuestLike>(quests: readonly T[], mode: BatchActionMode = "claim"): T[] {
    const seen = new Set<string>();
    const result: T[] = [];

    for (const quest of quests) {
        const id = String(quest?.id ?? "").trim();
        if (!id || quest.status !== (mode === "claim" ? "claimable" : "available") || seen.has(id)) continue;
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
    const label = runtime.mode === "enroll" ? "Accept all" : "Claim all";
    let claimed = 0;
    let skipped = 0;
    let needsPacing = false;

    for (let index = 0; index < quests.length; index++) {
        const quest = quests[index];
        const position = index + 1;
        const result = (): ClaimAllBatchResult => ({ total, claimed, skipped });

        if (runtime.shouldContinue?.() === false) {
            throw new ClaimAllBatchStoppedError(
                `${label} was cancelled before the next Quest action.`,
                result(),
                position,
                quest
            );
        }

        if (runtime.currentAccountId() !== expectedAccountId) {
            throw new ClaimAllBatchStoppedError(
                `Discord account changed while ${label} was running.`,
                result(),
                position,
                quest
            );
        }

        let state = runtime.currentState(quest.id);
        if (state === "claimed" || state === "skipped") {
            skipped++;
            continue;
        }
        if (state !== "claimable") {
            throw new ClaimAllBatchStoppedError(
                `This Quest is no longer eligible for ${label}.`,
                result(),
                position,
                quest
            );
        }

        // Pace native requests, not skipped snapshot entries. Never wait before
        // the first request or after the final request. Revalidate after the await.
        if (needsPacing && runtime.waitBetweenClaims) {
            await runtime.waitBetweenClaims();
            needsPacing = false;
            if (runtime.shouldContinue?.() === false) {
                throw new ClaimAllBatchStoppedError(
                    `${label} was cancelled before the next Quest action.`,
                    result(),
                    position,
                    quest
                );
            }
            if (runtime.currentAccountId() !== expectedAccountId) {
                throw new ClaimAllBatchStoppedError(
                    `Discord account changed while ${label} was running.`,
                    result(),
                    position,
                    quest
                );
            }
            state = runtime.currentState(quest.id);
            if (state === "claimed" || state === "skipped") {
                skipped++;
                continue;
            }
            if (state !== "claimable") {
                throw new ClaimAllBatchStoppedError(
                    `This Quest is no longer eligible for ${label}.`,
                    result(),
                    position,
                    quest
                );
            }
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
                `Discord account changed while ${label} was running.`,
                result(),
                position,
                quest
            );
        }

        if (runtime.shouldContinue?.() === false) {
            throw new ClaimAllBatchStoppedError(
                `${label} was cancelled before the next Quest action.`,
                result(),
                position,
                quest
            );
        }

        // Progress subscribers may synchronously alter Ignore/eligibility.
        state = runtime.currentState(quest.id);
        if (state === "claimed" || state === "skipped") { skipped++; continue; }
        if (state !== "claimable") throw new ClaimAllBatchStoppedError(
            `This Quest is no longer eligible for ${label}.`, result(), position, quest
        );

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
                `Discord submitted the action but QuestStore did not confirm it yet. ${label} stopped to avoid an ambiguous next action.`,
                result(),
                position,
                quest,
                undefined,
                "STORE_CONFIRMATION_TIMEOUT"
            );
        }

        claimed++;

        if (runtime.shouldContinue?.() === false) {
            throw new ClaimAllBatchStoppedError(
                `${label} was cancelled after the current Quest action.`,
                result(),
                position,
                quest
            );
        }
        if (runtime.currentAccountId() !== expectedAccountId) {
            throw new ClaimAllBatchStoppedError(
                `Discord account changed while ${label} was running.`,
                result(),
                position,
                quest
            );
        }
        runtime.onConfirmed?.(quest);
        needsPacing = true;
    }

    return { total, claimed, skipped };
}

export function selectBatchAction<T extends ClaimAllQuestLike>(quests: readonly T[], ignored: ReadonlySet<string>): { mode: BatchActionMode; candidates: T[]; } {
    const eligible = quests.filter(q => !ignored.has(q.id));
    const claim = buildClaimAllSnapshot(eligible);
    return claim.length ? { mode: "claim", candidates: claim } : { mode: "enroll", candidates: buildClaimAllSnapshot(eligible, "enroll") };
}
