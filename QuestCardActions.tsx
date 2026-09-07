import { showToast, Toasts, UserStore, useEffect, useState, useStateFromStores } from "@webpack/common";

import { recordQuestUIEvent } from "./eventLog";
import {
    getOrionControlSnapshot,
    invokeOrionEngineControl,
    isOrionCommandReady
} from "./orionIntegration";
import { OrionQuestControl } from "./OrionQuestControl";
import { claimQuestReward, enrollQuest, QuestActionError } from "./questActions";
import type { QuestActionResult } from "./questActions";
import type { NormalizedQuest } from "./questData";
import settings from "./settings";

import "./actions.css";

type QuestAction = "enroll" | "claim";
type SubmittedState = { action: QuestAction; userId: string; releaseAt: number; };

function actionLabel(action: QuestAction): string {
    return action === "enroll" ? "Accept Quest" : "Claim Reward";
}

function successMessage(action: QuestAction, quest: NormalizedQuest, result: QuestActionResult): string {
    if (result.storeConfirmed) {
        return action === "enroll"
            ? `Accepted ${quest.name}`
            : `Claimed reward for ${quest.name}`;
    }

    return action === "enroll"
        ? `Enrollment submitted for ${quest.name}; waiting for Discord to refresh.`
        : `Claim submitted for ${quest.name}; waiting for Discord to refresh.`;
}

function submittedState(action: QuestAction, userId: string, delayMs: number): SubmittedState {
    return { action, userId, releaseAt: Date.now() + delayMs };
}

export function QuestCardActions({ quest }: { quest: NormalizedQuest; }) {
    const action: QuestAction | null = quest.status === "available"
        ? "enroll"
        : quest.status === "claimable"
            ? "claim"
            : null;
    const currentUserId = useStateFromStores([UserStore], () => UserStore?.getCurrentUser?.()?.id ?? null);
    const { orionIntegration } = settings.use(["orionIntegration"]);
    const [pending, setPending] = useState(false);
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
        const userIdAtClick = currentUserId;
        if (!action || !userIdAtClick || pending) return;
        if (submitted?.action === action && submitted.userId === userIdAtClick) return;
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
            showToast(successMessage(action, quest, result), Toasts.Type.SUCCESS);
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
                        showToast(
                            `Quest was accepted, but Orion could not start automatically: ${error instanceof Error ? error.message : "unknown control error"}`,
                            Toasts.Type.FAILURE,
                            { duration: 6000 }
                        );
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
            showToast(message, Toasts.Type.FAILURE, { duration: 6000 });
        } finally {
            setPending(false);
        }
    };

    if (!action) {
        if (quest.status === "in-progress" && orionIntegration && isOrionCommandReady()) {
            return <span className="quest-ui-card-actions"><OrionQuestControl quest={quest} /></span>;
        }
        return null;
    }

    const actionSubmitted = currentUserId != null
        && submitted?.action === action
        && submitted.userId === currentUserId;

    return (
        <span className="quest-ui-card-actions">
            <button
                type="button"
                className={`quest-ui-card-action quest-ui-card-action-${action}`}
                disabled={pending || actionSubmitted || currentUserId == null}
                aria-busy={pending}
                onClick={run}
            >
                {pending ? "Processing…" : actionSubmitted ? "Sent" : actionLabel(action)}
            </button>
        </span>
    );
}
