import { showToast, UserStore, useEffect, useRef, useState, useStateFromStores } from "@webpack/common";

import { recordQuestUIEvent } from "../../eventLog/runtime";
import { pushDashboardNotice } from "../../dashboard/notifications";
import { ignoredQuestIds, isIgnoredQuestStateReady, setQuestIgnored } from "../ignored/runtime";
import { shouldPauseOrionQuestBeforeIgnore } from "../../orion/controls";
import {
    getOrionControlSnapshot,
    invokeOrionEngineControl,
    invokeOrionQuestTaskControl,
    isOrionCommandReady,
    syncOrionExclusions
} from "../../orion/integration";
import { OrionQuestControl } from "../../orion/OrionQuestControl";
import {
    claimQuestReward,
    enrollQuest,
    prepareQuestRewardCode,
    QuestActionError,
    usePendingQuestAction,
    hasPendingQuestAction,
    useNativeQuestRewardOpener
} from "./native";
import { isExplicitRewardCodeConfig } from "./responses";
import { getClaimAllRuntimeState } from "./claimAllState";
import type { NormalizedQuest } from "../data";
import { captureQuestEventRef } from "../presentation";
import settings from "../../plugin/settings";
import { captureAccountSession, isCurrentAccountSession } from "../../plugin/accountSession";

type QuestAction = "enroll" | "claim";
type SubmittedState = { action: QuestAction; userId: string; releaseAt: number; };

function actionLabel(action: QuestAction): string {
    return action === "enroll" ? "Accept Quest" : "Claim Reward";
}

function submittedState(action: QuestAction, userId: string, delayMs: number): SubmittedState {
    return { action, userId, releaseAt: Date.now() + delayMs };
}

function currentUserId(): string | null {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id ? id : null;
    } catch {
        return null;
    }
}

function IgnoreGlyph({ ignored }: { ignored: boolean; }) {
    return (
        <svg
            className="quest-ui-card-action-ignore-glyph"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
        >
            {ignored ? (
                <path d="M2.5 12C4.7 7.55 8 5 12 5s7.3 2.55 9.5 7C19.3 16.45 16 19 12 19S4.7 16.45 2.5 12Zm6.5 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" />
            ) : (
                <path d="M3 3 21 21M9.8 4.35A10.2 10.2 0 0 1 12 4c4.2 0 7.6 2.65 9.5 8a16.2 16.2 0 0 1-2.25 3.35M6.7 6.7A16.4 16.4 0 0 0 2.5 12c1.9 5.35 5.3 8 9.5 8 1.9 0 3.6-.55 5.05-1.55M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            )}
        </svg>
    );
}

export function QuestCardActions({ quest, ignored = false, claimBatchActive = false }: {
    quest: NormalizedQuest;
    ignored?: boolean;
    claimBatchActive?: boolean;
}) {
    const action: QuestAction | null = quest.status === "available"
        ? "enroll"
        : quest.status === "claimable"
            ? "claim"
            : null;
    const showViewCode = quest.status === "claimed"
        && isExplicitRewardCodeConfig(quest.rawQuest?.config?.rewardsConfig);
    const currentUserIdFromStore = useStateFromStores([UserStore], currentUserId);
    const session = captureAccountSession();
    const nativeBlocked = usePendingQuestAction(currentUserIdFromStore);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const openNativeQuestReward = useNativeQuestRewardOpener(quest);
    const { orionIntegration } = settings.use(["orionIntegration"]);
    const [pending, setPending] = useState(false);
    const [ignorePending, setIgnorePending] = useState(false);
    const [submitted, setSubmitted] = useState<SubmittedState | null>(null);

    useEffect(() => {
        if (!submitted) return;
        const delay = Math.max(0, submitted.releaseAt - Date.now());
        const timer = setTimeout(() => {
            setSubmitted(current => current === submitted ? null : current);
        }, delay);
        return () => clearTimeout(timer);
    }, [submitted]);

    const run = async () => {
        const userIdAtClick = currentUserIdFromStore;
        if (!action || !userIdAtClick || pending || ignorePending || !mounted.current || session?.accountId !== userIdAtClick || !isCurrentAccountSession(session)) return;
        if (action === "enroll" && (!isIgnoredQuestStateReady() || ignoredQuestIds(userIdAtClick).has(quest.id))) return;
        if (submitted?.action === action && submitted.userId === userIdAtClick) return;
        // Disabled UI is not a synchronization primitive: a stale click event can still arrive
        // during the render that starts Claim all. Re-check the module-global batch lock here.
        if (getClaimAllRuntimeState().active || hasPendingQuestAction(userIdAtClick)) return;
        const questRef = captureQuestEventRef(quest, userIdAtClick);
        setPending(true);
        void recordQuestUIEvent({
            severity: "info",
            eventCode: action === "enroll" ? "QUEST_ACCEPT_REQUESTED" : "QUEST_CLAIM_REQUESTED",
            summary: action === "enroll" ? "Quest acceptance requested" : "Quest reward claim requested",
            quest: questRef,
            accountId: userIdAtClick
        });

        try {
            const result = action === "enroll"
                ? await enrollQuest(quest)
                : await claimQuestReward(quest);

            // A store-confirmed action is already protected by its new server/store state. Only
            // keep local Sent state for a successful submission whose store transition is still
            // pending, and bind it to the account that made the request.
            if (mounted.current && isCurrentAccountSession(session)) setSubmitted(result.resubmitAfterMs == null
                ? null
                : submittedState(action, userIdAtClick, result.resubmitAfterMs));
            const confirmed = result.storeConfirmed;
            const outcome = action === "enroll"
                ? confirmed ? "Quest accepted" : "Acceptance submitted"
                : confirmed ? "Reward claimed" : "Claim submitted";
            if (isCurrentAccountSession(session)) {
                pushDashboardNotice({ tone: confirmed ? "success" : "info", text: outcome, duration: 2100 });
            }
            void recordQuestUIEvent({
                severity: confirmed ? "success" : "info",
                eventCode: action === "enroll"
                    ? confirmed ? "QUEST_ACCEPT_SUCCEEDED" : "QUEST_ACCEPT_SUBMITTED"
                    : confirmed ? "QUEST_CLAIM_SUCCEEDED" : "QUEST_CLAIM_SUBMITTED",
                summary: outcome,
                quest: questRef,
                detail: { storeConfirmed: confirmed, resubmitAfterMs: result.resubmitAfterMs },
                accountId: userIdAtClick
            });

            // QuestUI's explicit Accept should start farming even when Orion's independent
            // watchForEnrollments setting is off. Only do this after Discord's store confirmed
            // enrolledAt; a merely submitted/uncertain enrollment is not enough to start a run.
            if (action === "enroll" && result.storeConfirmed && isCurrentAccountSession(session) && orionIntegration && isOrionCommandReady()) {
                const snapshot = getOrionControlSnapshot();
                if (snapshot && !snapshot.running) {
                    try {
                        await invokeOrionEngineControl("start");
                    } catch (error) {
                        void recordQuestUIEvent({
                            severity: "warning",
                            eventCode: "ORION_AUTO_START_FAILED",
                            summary: "Quest accepted, but Orion auto-start failed",
                            quest: questRef,
                            detail: { message: error instanceof Error ? error.message : String(error) },
                            accountId: userIdAtClick
                        });
                        if (isCurrentAccountSession(session)) showToast({
                            text: `Quest was accepted, but Orion could not start automatically: ${error instanceof Error ? error.message : "unknown control error"}`,
                            variant: "critical",
                            duration: 6000
                        });
                    }
                }
            }
        } catch (error) {
            if (mounted.current && isCurrentAccountSession(session) && error instanceof QuestActionError && error.resubmitAfterMs != null) {
                // The request may have reached Discord even though confirmation failed. Mirror
                // the module-level duplicate guard so the button does not look immediately
                // reusable while the mutation outcome is intentionally uncertain.
                setSubmitted(submittedState(action, userIdAtClick, error.resubmitAfterMs));
            }
            const message = error instanceof QuestActionError
                ? error.message
                : "The Quest action failed unexpectedly.";
            void recordQuestUIEvent({
                severity: "error",
                eventCode: action === "enroll" ? "QUEST_ACCEPT_FAILED" : "QUEST_CLAIM_FAILED",
                summary: action === "enroll" ? "Quest acceptance failed" : "Quest reward claim failed",
                quest: questRef,
                accountId: userIdAtClick,
                detail: {
                    message,
                    actionCode: error instanceof QuestActionError ? error.code : "UNKNOWN_ACTION_ERROR",
                    retryAfterMs: error instanceof QuestActionError ? error.resubmitAfterMs : null,
                    reason: error instanceof QuestActionError && error.cause instanceof Error ? error.cause.message : null,
                    stack: error instanceof Error ? error.stack ?? null : null
                }
            });
            if (isCurrentAccountSession(session)) showToast({ text: message, variant: "critical", duration: 6000 });
        } finally {
            if (mounted.current) setPending(false);
        }
    };

    const viewCode = async () => {
        if (!showViewCode || pending || !mounted.current || session?.accountId !== currentUserIdFromStore || !isCurrentAccountSession(session)) return;
        setPending(true);
        try {
            await prepareQuestRewardCode(quest);
            if (mounted.current && isCurrentAccountSession(session)) openNativeQuestReward();
        } catch (error) {
            const message = error instanceof QuestActionError
                ? error.message
                : "Discord could not open this Quest reward code.";
            if (isCurrentAccountSession(session)) showToast({ text: message, variant: "critical", duration: 6000 });
        } finally {
            if (mounted.current) setPending(false);
        }
    };

    const canToggleIgnored = quest.status !== "claimed" && quest.status !== "expired" && (ignored || quest.status === "in-progress" || quest.status === "available");
    const toggleIgnored = async () => {
        const userIdAtClick = currentUserIdFromStore;
        if (!canToggleIgnored || !isIgnoredQuestStateReady() || !userIdAtClick || pending || ignorePending || !mounted.current || session?.accountId !== userIdAtClick || !isCurrentAccountSession(session)) return;
        setIgnorePending(true);
        const nextIgnored = !ignoredQuestIds(userIdAtClick).has(quest.id);
        let orionPausedForIgnore = false;
        let pausePending = false;
        let nativeExclusion = false;

        try {
            // Publish the preference first. Native exclusion synchronizes the complete set;
            // legacy Pause is only a fallback, never a prerequisite for saving Ignore.
            await setQuestIgnored(userIdAtClick, quest.id, nextIgnored);
            if (isCurrentAccountSession(session) && orionIntegration && isOrionCommandReady()) {
                nativeExclusion = syncOrionExclusions();
                if (nextIgnored && !nativeExclusion && ignoredQuestIds(userIdAtClick).has(quest.id)
                    && shouldPauseOrionQuestBeforeIgnore(getOrionControlSnapshot(), quest.id)) {
                    try {
                        await invokeOrionQuestTaskControl(quest.id, "pause");
                        if (isCurrentAccountSession(session)) {
                            orionPausedForIgnore = !shouldPauseOrionQuestBeforeIgnore(getOrionControlSnapshot(), quest.id);
                            pausePending = !orionPausedForIgnore;
                        }
                    } catch (error) {
                        if (isCurrentAccountSession(session) && shouldPauseOrionQuestBeforeIgnore(getOrionControlSnapshot(), quest.id)) {
                            pausePending = true;
                            void recordQuestUIEvent({
                                severity: "warning",
                                eventCode: "QUEST_IGNORE_ORION_PAUSE_FAILED",
                                summary: "Orion pause pending; Ignore enforcement will reconcile",
                                quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null },
                                detail: { message: error instanceof Error ? error.message : String(error) },
                                accountId: userIdAtClick
                            });
                        }
                    }
                }
            }
            void recordQuestUIEvent({
                severity: "info",
                eventCode: nextIgnored ? "QUEST_IGNORED" : "QUEST_UNIGNORED",
                summary: nextIgnored ? "Quest ignored in QuestUI" : "Quest unignored in QuestUI",
                quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null },
                detail: nextIgnored ? { orionPaused: orionPausedForIgnore, pausePending, nativeExclusion } : undefined,
                accountId: userIdAtClick
            });
            if (isCurrentAccountSession(session)) {
                showToast({
                    text: nextIgnored
                        ? nativeExclusion ? `Ignored ${quest.name} in QuestUI and Orion` : orionPausedForIgnore
                            ? `Ignored ${quest.name} and paused it in Orion`
                            : pausePending ? `Ignored ${quest.name}; Orion pause pending` : `Ignored ${quest.name}`
                        : `Unignored ${quest.name}`,
                    variant: "success"
                });
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : "QuestUI could not update the ignored Quest preference.";
            const message = orionPausedForIgnore
                ? `Orion paused ${quest.name}, but QuestUI could not save Ignore: ${reason}`
                : reason;
            void recordQuestUIEvent({
                severity: "error",
                eventCode: "QUEST_IGNORE_PERSIST_FAILED",
                summary: orionPausedForIgnore
                    ? "Ignore preference could not be saved after Orion pause"
                    : "Ignored Quest preference could not be saved",
                quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null },
                detail: { message: reason, orionPaused: orionPausedForIgnore },
                accountId: userIdAtClick
            });
            if (isCurrentAccountSession(session)) {
                showToast({ text: message, variant: "critical", duration: 6000 });
            }
        } finally {
            if (mounted.current) setIgnorePending(false);
        }
    };

    const actionSubmitted = currentUserIdFromStore != null
        && submitted?.action === action
        && submitted.userId === currentUserIdFromStore;
    const showOrionControl = quest.status === "in-progress" && orionIntegration && isOrionCommandReady();

    if (!action && !showViewCode && !showOrionControl && !canToggleIgnored) return null;

    return (
        <span className="quest-ui-card-actions">
            {action && (
                <button
                    type="button"
                    className={`quest-ui-card-action quest-ui-card-action-${action}`}
                    disabled={pending || ignorePending || actionSubmitted || currentUserIdFromStore == null || (claimBatchActive || nativeBlocked) || (action === "enroll" && (ignored || !isIgnoredQuestStateReady()))}
                    aria-busy={pending}
                    onClick={run}
                    title={claimBatchActive ? "A Quest batch is processing actions" : nativeBlocked ? "Waiting for Discord to finish a previous Quest action" : undefined}
                >
                    {pending ? "Processing…" : actionSubmitted ? "Sent" : actionLabel(action)}
                </button>
            )}

            {!action && showViewCode && (
                <button
                    type="button"
                    className="quest-ui-card-action quest-ui-card-action-view-code"
                    disabled={pending || currentUserIdFromStore == null}
                    aria-busy={pending}
                    onClick={() => void viewCode()}
                    title="Open this claimed reward code in Discord's native Reward Code modal"
                >
                    {pending ? "Opening…" : "View Code"}
                </button>
            )}

            {!action && !showViewCode && showOrionControl && <OrionQuestControl quest={quest} />}

            {canToggleIgnored && (
                <button
                    type="button"
                    className={`quest-ui-card-action quest-ui-card-action-ignore${ignored ? " is-unignore" : ""}`}
                    disabled={ignorePending || pending || currentUserIdFromStore == null || !isIgnoredQuestStateReady()}
                    aria-busy={ignorePending}
                    aria-label={ignored ? "Unignore Quest" : "Ignore Quest"}
                    onClick={toggleIgnored}
                    title={ignored
                        ? "Show this Quest normally again; Orion stays paused"
                        : "Pause this Quest in Orion if active, then hide it from normal QuestUI views"}
                >
                    <IgnoreGlyph ignored={ignored} />
                </button>
            )}
        </span>
    );
}
