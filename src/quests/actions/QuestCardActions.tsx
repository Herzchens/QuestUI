import { showToast, UserStore, useEffect, useState, useStateFromStores } from "@webpack/common";

import { recordQuestUIEvent } from "../../eventLog/runtime";
import { pushDashboardNotice } from "../../dashboard/notifications";
import { setQuestIgnored } from "../ignored/runtime";
import { shouldPauseOrionQuestBeforeIgnore } from "../../orion/controls";
import {
    getOrionControlSnapshot,
    invokeOrionEngineControl,
    invokeOrionQuestTaskControl,
    isOrionCommandReady
} from "../../orion/integration";
import { OrionQuestControl } from "../../orion/OrionQuestControl";
import { claimQuestReward, enrollQuest, QuestActionError } from "./native";
import { getClaimAllRuntimeState } from "./claimAllState";
import type { QuestActionResult } from "./native";
import type { NormalizedQuest } from "../data";
import settings from "../../plugin/settings";

import "./actions.css";

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
    const currentUserIdFromStore = useStateFromStores([UserStore], currentUserId);
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
        if (!action || !userIdAtClick || pending) return;
        if (submitted?.action === action && submitted.userId === userIdAtClick) return;
        // Disabled UI is not a synchronization primitive: a stale click event can still arrive
        // during the render that starts Claim all. Re-check the module-global batch lock here.
        if (action === "claim" && getClaimAllRuntimeState().active) return;
        setPending(true);
        void recordQuestUIEvent({
            severity: "info",
            eventCode: action === "enroll" ? "QUEST_ACCEPT_REQUESTED" : "QUEST_CLAIM_REQUESTED",
            summary: action === "enroll" ? "Quest acceptance requested" : "Quest reward claim requested",
            quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null }
        });

        try {
            const result = action === "enroll"
                ? await enrollQuest(quest)
                : await claimQuestReward(quest);

            // A store-confirmed action is already protected by its new server/store state. Only
            // keep local Sent state for a successful submission whose store transition is still
            // pending, and bind it to the account that made the request.
            setSubmitted(result.resubmitAfterMs == null
                ? null
                : submittedState(action, userIdAtClick, result.resubmitAfterMs));
            pushDashboardNotice({
                tone: "success",
                text: action === "enroll" ? "Accepted" : "Claimed",
                duration: 2100
            });
            void recordQuestUIEvent({
                severity: "success",
                eventCode: action === "enroll" ? "QUEST_ACCEPT_SUCCEEDED" : "QUEST_CLAIM_SUCCEEDED",
                summary: action === "enroll" ? "Quest accepted" : "Quest reward claimed",
                quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null },
                detail: { storeConfirmed: result.storeConfirmed, resubmitAfterMs: result.resubmitAfterMs }
            });

            // QuestUI's explicit Accept should start farming even when Orion's independent
            // watchForEnrollments setting is off. Only do this after Discord's store confirmed
            // enrolledAt; a merely submitted/uncertain enrollment is not enough to start a run.
            if (action === "enroll" && result.storeConfirmed && orionIntegration && isOrionCommandReady()) {
                const snapshot = getOrionControlSnapshot();
                if (snapshot && !snapshot.running) {
                    try {
                        await invokeOrionEngineControl("start");
                    } catch (error) {
                        void recordQuestUIEvent({
                            severity: "warning",
                            eventCode: "ORION_AUTO_START_FAILED",
                            summary: "Quest accepted, but Orion auto-start failed",
                            quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null },
                            detail: { message: error instanceof Error ? error.message : String(error) }
                        });
                        showToast({
                            text: `Quest was accepted, but Orion could not start automatically: ${error instanceof Error ? error.message : "unknown control error"}`,
                            variant: "critical",
                            duration: 6000
                        });
                    }
                }
            }
        } catch (error) {
            if (error instanceof QuestActionError && error.resubmitAfterMs != null) {
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
                quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null },
                detail: {
                    message,
                    reason: error instanceof QuestActionError && error.cause instanceof Error ? error.cause.message : null,
                    stack: error instanceof Error ? error.stack ?? null : null
                }
            });
            showToast({ text: message, variant: "critical", duration: 6000 });
        } finally {
            setPending(false);
        }
    };

    const canToggleIgnored = ignored || quest.status === "in-progress";
    const toggleIgnored = async () => {
        const userIdAtClick = currentUserIdFromStore;
        if (!canToggleIgnored || !userIdAtClick || ignorePending) return;
        setIgnorePending(true);
        const nextIgnored = !ignored;
        let orionPausedForIgnore = false;

        try {
            // Ignore is a user request to remove this Quest from QuestUI attention. If compatible
            // Orion still owns the exact Quest as RUNNING/QUEUE (or scheduler RUNNING/WAITING),
            // pause that Quest first so hiding it cannot leave farming running invisibly.
            if (nextIgnored && orionIntegration && isOrionCommandReady()) {
                const snapshot = getOrionControlSnapshot();
                if (shouldPauseOrionQuestBeforeIgnore(snapshot, quest.id)) {
                    try {
                        await invokeOrionQuestTaskControl(quest.id, "pause");
                        orionPausedForIgnore = true;
                        void recordQuestUIEvent({
                            severity: "info",
                            eventCode: "ORION_QUEST_PAUSED_FOR_IGNORE",
                            summary: "Orion Quest paused before Ignore",
                            quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null },
                            accountId: userIdAtClick
                        });
                    } catch (error) {
                        // A completion/rescan/plugin transition may settle while the pause request
                        // is in flight. Re-read Orion before failing: if it no longer publishes the
                        // Quest as active, there is no invisible work left to protect against.
                        const latestSnapshot = getOrionControlSnapshot();
                        if (shouldPauseOrionQuestBeforeIgnore(latestSnapshot, quest.id)) {
                            const reason = error instanceof Error ? error.message : String(error);
                            const message = `Could not ignore ${quest.name} because Orion could not pause this Quest.`;
                            void recordQuestUIEvent({
                                severity: "error",
                                eventCode: "QUEST_IGNORE_ORION_PAUSE_FAILED",
                                summary: "Ignore blocked because Orion Quest pause failed",
                                quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null },
                                detail: { message: reason },
                                accountId: userIdAtClick
                            });
                            if (currentUserId() === userIdAtClick) {
                                showToast({ text: message, variant: "critical", duration: 6000 });
                            }
                            return;
                        }
                    }
                }
            }

            // Persistence belongs to the account that clicked even if Discord switches accounts
            // while the async work is in flight. Unignore deliberately does not resume Orion: a
            // presentation action must not unexpectedly start the engine or farming again.
            await setQuestIgnored(userIdAtClick, quest.id, nextIgnored);
            void recordQuestUIEvent({
                severity: "info",
                eventCode: nextIgnored ? "QUEST_IGNORED" : "QUEST_UNIGNORED",
                summary: nextIgnored ? "Quest ignored in QuestUI" : "Quest unignored in QuestUI",
                quest: { id: quest.id, name: quest.name, taskType: quest.primaryTask?.key ?? null },
                detail: nextIgnored ? { orionPaused: orionPausedForIgnore } : undefined,
                accountId: userIdAtClick
            });
            if (currentUserId() === userIdAtClick) {
                showToast({
                    text: nextIgnored
                        ? orionPausedForIgnore
                            ? `Ignored ${quest.name} and paused it in Orion`
                            : `Ignored ${quest.name}`
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
            if (currentUserId() === userIdAtClick) {
                showToast({ text: message, variant: "critical", duration: 6000 });
            }
        } finally {
            setIgnorePending(false);
        }
    };

    const actionSubmitted = currentUserIdFromStore != null
        && submitted?.action === action
        && submitted.userId === currentUserIdFromStore;
    const showOrionControl = quest.status === "in-progress" && orionIntegration && isOrionCommandReady();

    if (!action && !showOrionControl && !canToggleIgnored) return null;

    return (
        <span className="quest-ui-card-actions">
            {action && (
                <button
                    type="button"
                    className={`quest-ui-card-action quest-ui-card-action-${action}`}
                    disabled={pending || actionSubmitted || currentUserIdFromStore == null || (action === "claim" && claimBatchActive)}
                    aria-busy={pending}
                    onClick={run}
                    title={action === "claim" && claimBatchActive ? "Claim all is processing Ready rewards" : undefined}
                >
                    {pending ? "Processing…" : actionSubmitted ? "Sent" : actionLabel(action)}
                </button>
            )}

            {!action && showOrionControl && <OrionQuestControl quest={quest} />}

            {canToggleIgnored && (
                <button
                    type="button"
                    className={`quest-ui-card-action quest-ui-card-action-ignore${ignored ? " is-unignore" : ""}`}
                    disabled={ignorePending || currentUserIdFromStore == null}
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
