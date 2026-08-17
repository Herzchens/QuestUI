import { showToast, Toasts, useState } from "@webpack/common";

import { claimQuestReward, enrollQuest, QuestActionError } from "./questActions";
import type { QuestActionResult } from "./questActions";
import type { NormalizedQuest } from "./questData";

import "./actions.css";

type QuestAction = "enroll" | "claim";

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

export function QuestCardActions({ quest }: { quest: NormalizedQuest; }) {
    const action: QuestAction | null = quest.status === "available"
        ? "enroll"
        : quest.status === "claimable"
            ? "claim"
            : null;
    const [pending, setPending] = useState(false);
    const [submitted, setSubmitted] = useState<QuestAction | null>(null);

    const run = async () => {
        if (!action || pending || submitted === action) return;
        setPending(true);

        try {
            const result = action === "enroll"
                ? await enrollQuest(quest)
                : await claimQuestReward(quest);

            // Keep the same action disabled until QuestStore advances the card to its next
            // state. A successful request can beat the Gateway/store update by a moment;
            // re-enabling immediately would allow a second click to submit the action twice.
            setSubmitted(action);
            showToast(successMessage(action, quest, result), Toasts.Type.SUCCESS);
        } catch (error) {
            const message = error instanceof QuestActionError
                ? error.message
                : "The Quest action failed unexpectedly.";
            showToast(message, Toasts.Type.FAILURE, { duration: 6000 });
        } finally {
            setPending(false);
        }
    };

    if (!action) return null;

    const actionSubmitted = submitted === action;

    return (
        <span className="quest-ui-card-actions">
            <button
                type="button"
                className={`quest-ui-card-action quest-ui-card-action-${action}`}
                disabled={pending || actionSubmitted}
                aria-busy={pending}
                onClick={run}
            >
                {pending ? "Working…" : actionSubmitted ? "Sent" : actionLabel(action)}
            </button>
        </span>
    );
}
