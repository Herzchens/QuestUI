import { showToast, Toasts, UserStore, useEffect, useState, useStateFromStores } from "@webpack/common";

import {
    buildClaimAllSnapshot,
    ClaimAllBatchStoppedError,
    runClaimAllBatch,
    type ClaimAllCurrentState
} from "./claimAllLogic";
import {
    beginClaimAllRuntime,
    endClaimAllRuntime,
    getClaimAllRuntimeState,
    subscribeClaimAllRuntimeState,
    updateClaimAllRuntimeProgress,
    type ClaimAllRuntimeState
} from "./claimAllRuntimeState";
import { recordQuestUIEvent } from "./eventLog";
import { useIgnoredQuests } from "./ignoredQuests";
import { isQuestVerificationError } from "./questActionLogic";
import { claimQuestReward, hasPendingClaimAction, QuestActionError } from "./questActions";
import { useQuestSnapshot } from "./questData";
import { QuestsStore } from "./stores";

import "./actions.css";

function currentUserId(): string | null {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id ? id : null;
    } catch {
        return null;
    }
}

function currentClaimState(questId: string): ClaimAllCurrentState {
    let rawQuest: any = null;
    try { rawQuest = QuestsStore?.getQuest?.(questId) ?? null; }
    catch { return "unavailable"; }

    if (rawQuest?.userStatus?.claimedAt) return "claimed";
    if (rawQuest?.userStatus?.completedAt) return "claimable";
    return "unavailable";
}

function verificationStop(error: unknown): boolean {
    const cause = error instanceof ClaimAllBatchStoppedError ? error.cause : error;
    if (cause instanceof QuestActionError) {
        return isQuestVerificationError(cause.cause)
            || cause.message.toLowerCase().includes("verification was required");
    }
    return isQuestVerificationError(cause);
}

function useClaimAllRuntimeState(): ClaimAllRuntimeState {
    const [state, setState] = useState(getClaimAllRuntimeState);

    useEffect(() => subscribeClaimAllRuntimeState(() => {
        setState(getClaimAllRuntimeState());
    }), []);

    return state;
}

export function useClaimAllBatchActive(): boolean {
    return useClaimAllRuntimeState().active;
}

export function ClaimAllControl() {
    const accountId = useStateFromStores([UserStore], currentUserId);
    const runtimeState = useClaimAllRuntimeState();
    const quests = useQuestSnapshot();
    const { ids: ignoredIds } = useIgnoredQuests();
    const eligibleQuests = quests.filter(quest => !ignoredIds.has(quest.id));
    const claimable = buildClaimAllSnapshot(eligibleQuests);

    const run = async () => {
        if (!accountId) return;

        const snapshot = buildClaimAllSnapshot(eligibleQuests);
        if (snapshot.length === 0) return;

        // A per-card claim may already be in-flight or intentionally held after an ambiguous
        // submission. Refuse the batch rather than overlap native reward claims.
        if (hasPendingClaimAction(accountId)) {
            showToast(
                "Another reward claim is still in progress. Wait for Discord to refresh, then try Claim all again.",
                Toasts.Type.FAILURE,
                { duration: 5000 }
            );
            return;
        }

        // This lock is module-global and synchronous. It closes rapid double-click,
        // stale per-card click, and Dashboard close/reopen races before the first await.
        if (!beginClaimAllRuntime(snapshot.length)) return;

        void recordQuestUIEvent({
            severity: "info",
            eventCode: "QUEST_CLAIM_ALL_REQUESTED",
            summary: "Claim all requested",
            detail: { total: snapshot.length },
            accountId
        });

        try {
            const result = await runClaimAllBatch(
                snapshot,
                accountId,
                {
                    currentAccountId: currentUserId,
                    currentState: currentClaimState,
                    claim: claimQuestReward
                },
                progress => updateClaimAllRuntimeProgress(progress.position)
            );

            const skippedCopy = result.skipped > 0
                ? `; skipped ${result.skipped} already claimed`
                : "";
            showToast(
                `Claimed ${result.claimed} ${result.claimed === 1 ? "reward" : "rewards"}${skippedCopy}.`,
                Toasts.Type.SUCCESS
            );
            void recordQuestUIEvent({
                severity: "success",
                eventCode: "QUEST_CLAIM_ALL_SUCCEEDED",
                summary: "Claim all completed",
                detail: { ...result },
                accountId
            });
        } catch (error) {
            const stopped = error instanceof ClaimAllBatchStoppedError ? error : null;
            const isVerification = verificationStop(error);
            const at = stopped?.position ?? (getClaimAllRuntimeState().position || 1);
            const total = stopped?.result.total ?? snapshot.length;
            const reason = isVerification
                ? "Discord verification is required. Complete it manually, then run Claim all again."
                : stopped?.message ?? (error instanceof Error ? error.message : "Claim all stopped unexpectedly.");
            const message = `Claim all stopped at ${at}/${total}: ${reason}`;

            showToast(message, Toasts.Type.FAILURE, { duration: 7000 });
            void recordQuestUIEvent({
                severity: isVerification ? "warning" : "error",
                eventCode: "QUEST_CLAIM_ALL_STOPPED",
                summary: isVerification
                    ? "Claim all stopped for Discord verification"
                    : "Claim all stopped",
                quest: stopped ? { id: stopped.quest.id, name: stopped.quest.name, taskType: null } : undefined,
                detail: {
                    message: reason,
                    total,
                    position: at,
                    claimed: stopped?.result.claimed ?? 0,
                    skipped: stopped?.result.skipped ?? 0,
                    verificationRequired: isVerification,
                    terminal: !isVerification
                },
                accountId
            });
        } finally {
            endClaimAllRuntime();
        }
    };

    return (
        <button
            type="button"
            className="quest-ui-toolbar-button quest-ui-claim-all-button"
            disabled={runtimeState.active || accountId == null || claimable.length === 0}
            aria-busy={runtimeState.active}
            onClick={run}
            title={claimable.length === 0
                ? "No Ready Quest rewards to claim."
                : "Claim the currently Ready rewards one at a time. Stops on verification, account changes, or an uncertain result."}
            aria-label={runtimeState.active
                ? `Claiming reward ${Math.max(1, runtimeState.position)} of ${Math.max(1, runtimeState.total)}`
                : `Claim All, ${claimable.length} Ready rewards`}
        >
            {runtimeState.active ? (
                `Claiming ${Math.max(1, runtimeState.position)}/${Math.max(1, runtimeState.total)}…`
            ) : (
                <>
                    <span className="quest-ui-claim-all-label">Claim All</span>
                    <span className="quest-ui-claim-all-count" aria-hidden="true">{claimable.length}</span>
                </>
            )}
        </button>
    );
}
