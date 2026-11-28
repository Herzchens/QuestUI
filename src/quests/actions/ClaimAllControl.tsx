import { showToast, UserStore, useEffect, useState, useStateFromStores } from "@webpack/common";

import {
    selectBatchAction,
    type BatchActionMode,
    ClaimAllBatchStoppedError,
    runClaimAllBatch,
    waitBetweenClaimAllRequests,
    type ClaimAllCurrentState
} from "./claimAll";
import {
    beginClaimAllRuntime,
    endClaimAllRuntime,
    getClaimAllRuntimeGeneration,
    getClaimAllRuntimeState,
    isClaimAllRuntimeGenerationActive,
    subscribeClaimAllRuntimeState,
    updateClaimAllRuntimeProgress,
    type ClaimAllRuntimeState
} from "./claimAllState";
import { recordQuestUIEvent } from "../../eventLog/runtime";
import { pushDashboardNotice } from "../../dashboard/notifications";
import { ignoredQuestIds, useIgnoredQuests } from "../ignored/runtime";
import { isQuestVerificationError } from "./responses";
import { claimQuestReward, enrollQuest, hasPendingQuestAction, usePendingQuestAction, QuestActionError } from "./native";
import type { NormalizedQuest } from "../data";
import { captureQuestEventRef } from "../presentation";
import { QuestsStore } from "../../plugin/stores";
import { captureAccountSession, isCurrentAccountSession } from "../../plugin/accountSession";

function currentUserId(): string | null {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id ? id : null;
    } catch {
        return null;
    }
}

function currentClaimState(questId: string, mode: BatchActionMode, accountId: string): ClaimAllCurrentState {
    if (ignoredQuestIds(accountId).has(questId)) return "skipped";
    let rawQuest: any = null;
    try { rawQuest = QuestsStore?.getQuest?.(questId) ?? null; }
    catch { return "unavailable"; }

    if (!rawQuest) return "unavailable";
    if (mode === "enroll") {
        if (rawQuest.userStatus?.enrolledAt || rawQuest.userStatus?.completedAt || rawQuest.userStatus?.claimedAt) return "skipped";
        if (rawQuest.preview === true || (rawQuest.config?.expiresAt && new Date(rawQuest.config.expiresAt).getTime() <= Date.now())) return "skipped";
        return "claimable";
    }
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

export function ClaimAllControl({ quests }: { quests: readonly NormalizedQuest[]; }) {
    const accountId = useStateFromStores([UserStore], currentUserId);
    const session = captureAccountSession();
    const runtimeState = useClaimAllRuntimeState();
    const { ids: ignoredIds, ready } = useIgnoredQuests();
    const blocked = usePendingQuestAction(accountId);
    const { mode, candidates } = selectBatchAction(quests, ignoredIds);
    const label = mode === "claim" ? "Claim All" : "Accept All";
    const activeLabel = runtimeState.mode === "claim" ? "Claiming" : "Accepting";

    const run = async () => {
        if (!ready || !accountId || session?.accountId !== accountId || !isCurrentAccountSession(session)) return;
        const { mode: batchMode, candidates: snapshot } = selectBatchAction(quests, ignoredQuestIds(accountId));
        if (batchMode !== mode || !snapshot.length || hasPendingQuestAction(accountId)) return;
        const isClaim = batchMode === "claim";
        const batchLabel = isClaim ? "Claim all" : "Accept all";
        // This lock is module-global and synchronous. It closes rapid double-click,
        // stale per-card click, and Dashboard close/reopen races before the first await.
        if (!beginClaimAllRuntime(snapshot.length, batchMode)) return;
        const runtimeGeneration = getClaimAllRuntimeGeneration();
        if (runtimeGeneration == null) return;

        void recordQuestUIEvent({
            severity: "info",
            eventCode: isClaim ? "QUEST_CLAIM_ALL_REQUESTED" : "QUEST_ACCEPT_ALL_REQUESTED",
            summary: `${batchLabel} requested`,
            detail: { total: snapshot.length },
            accountId
        });

        const questRefs = new Map(snapshot.map(quest => [quest.id, captureQuestEventRef(quest, accountId)]));
        try {
            const result = await runClaimAllBatch(
                snapshot,
                accountId,
                {
                    currentAccountId: currentUserId,
                    mode: batchMode,
                    currentState: id => currentClaimState(id, batchMode, accountId),
                    claim: quest => isClaim ? claimQuestReward(quest, runtimeGeneration) : enrollQuest(quest, runtimeGeneration),
                    waitBetweenClaims: waitBetweenClaimAllRequests,
                    shouldContinue: () => isClaimAllRuntimeGenerationActive(runtimeGeneration) && isCurrentAccountSession(session),
                    onConfirmed: quest => {
                        void recordQuestUIEvent({
                            severity: "success",
                            eventCode: isClaim ? "QUEST_CLAIM_SUCCEEDED" : "QUEST_ACCEPT_SUCCEEDED",
                            summary: isClaim ? "Quest reward claimed" : "Quest accepted",
                            quest: questRefs.get(quest.id) ?? { id: quest.id, name: quest.name },
                            detail: { storeConfirmed: true, actionMode: "batch" },
                            accountId
                        });
                    }
                },
                progress => updateClaimAllRuntimeProgress(progress.position, runtimeGeneration)
            );

            if (!isClaimAllRuntimeGenerationActive(runtimeGeneration)) return;

            if (isCurrentAccountSession(session)) {
                pushDashboardNotice({
                    tone: result.claimed > 0 ? "success" : "info",
                    text: `${batchLabel}: ${result.claimed} confirmed, ${result.skipped} skipped`,
                    duration: 2200
                });
            }
            void recordQuestUIEvent({
                severity: "success",
                eventCode: isClaim ? "QUEST_CLAIM_ALL_SUCCEEDED" : "QUEST_ACCEPT_ALL_SUCCEEDED",
                summary: `${batchLabel} completed`,
                detail: { total: result.total, confirmed: result.claimed, skipped: result.skipped, mode: batchMode },
                accountId
            });
        } catch (error) {
            if (!isClaimAllRuntimeGenerationActive(runtimeGeneration)) return;

            const stopped = error instanceof ClaimAllBatchStoppedError ? error : null;
            const isVerification = verificationStop(error);
            const at = stopped?.position ?? (getClaimAllRuntimeState().position || 1);
            const total = stopped?.result.total ?? snapshot.length;
            const reason = isVerification
                ? "Discord verification is required. Complete it manually, then run the batch again."
                : stopped?.message ?? (error instanceof Error ? error.message : "Claim all stopped unexpectedly.");
            const message = `${batchLabel} stopped at ${at}/${total}: ${reason}`;
            const actionError = stopped?.cause instanceof QuestActionError ? stopped.cause : null;

            if (isCurrentAccountSession(session)) showToast({ text: message, variant: "critical", duration: 7000 });
            void recordQuestUIEvent({
                severity: isVerification ? "warning" : "error",
                eventCode: isClaim ? "QUEST_CLAIM_ALL_STOPPED" : "QUEST_ACCEPT_ALL_STOPPED",
                summary: isVerification ? `${batchLabel} stopped for Discord verification` : `${batchLabel} stopped`,
                quest: stopped ? questRefs.get(stopped.quest.id) ?? { id: stopped.quest.id, name: stopped.quest.name } : undefined,
                detail: {
                    message: reason,
                    actionCode: actionError?.code ?? (isVerification ? "NATIVE_VERIFICATION_REQUIRED" : "BATCH_STOPPED"),
                    retryAfterMs: actionError?.resubmitAfterMs ?? null,
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
            endClaimAllRuntime(runtimeGeneration);
        }
    };

    return (
        <button
            type="button"
            className="quest-ui-toolbar-button quest-ui-claim-all-button"
            disabled={runtimeState.active || !ready || accountId == null || blocked || candidates.length === 0}
            aria-busy={runtimeState.active}
            onClick={run}
            title={blocked ? "Waiting for Discord to finish a previous Quest action."
                : candidates.length === 0 ? "No available Quests match the current filters."
                : `${label} matching the current filters, one at a time.`}
            aria-label={runtimeState.active
                ? `${activeLabel} ${Math.max(1, runtimeState.position)} of ${Math.max(1, runtimeState.total)}`
                : `${label}, ${candidates.length} Quests`}
        >
            {runtimeState.active ? (
                `${activeLabel} ${Math.max(1, runtimeState.position)}/${Math.max(1, runtimeState.total)}…`
            ) : (
                <>
                    <span className="quest-ui-claim-all-label">{label}</span>
                    <span className="quest-ui-claim-all-count" aria-hidden="true">{candidates.length}</span>
                </>
            )}
        </button>
    );
}
