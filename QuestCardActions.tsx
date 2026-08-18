import { showToast, Toasts, UserStore, useEffect, useState, useStateFromStores } from "@webpack/common";

import { claimQuestReward, enrollQuest, QuestActionError } from "./questActions";
import type { QuestActionResult } from "./questActions";
import type { NormalizedQuest } from "./questData";

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
            showToast(message, Toasts.Type.FAILURE, { duration: 6000 });
        } finally {
            setPending(false);
        }
    };

    if (!action) return null;

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
                {pending ? "Working…" : actionSubmitted ? "Sent" : actionLabel(action)}
            </button>
        </span>
    );
}
