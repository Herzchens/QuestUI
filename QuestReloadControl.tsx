import { showToast, Toasts, useState } from "@webpack/common";

import { reloadQuestList } from "./questReload";
import { remainingReloadSpinMs } from "./questReloadLogic";

import "./reload.css";

function ReloadIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19.4 7.35A8.5 8.5 0 1 0 20.5 14h-2.05A6.5 6.5 0 1 1 17.9 8.8L15 11.7h6.5V5.2l-2.1 2.15Z" />
        </svg>
    );
}

function delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function QuestReloadControl() {
    const [pending, setPending] = useState(false);

    const run = async () => {
        if (pending) return;
        const startedAt = Date.now();
        setPending(true);

        let failure: unknown = null;
        try {
            await reloadQuestList();
        } catch (error) {
            failure = error;
        }

        await delay(remainingReloadSpinMs(startedAt, Date.now()));

        try {
            if (failure) {
                showToast(
                    failure instanceof Error ? failure.message : "Failed to refresh the Quest list.",
                    Toasts.Type.FAILURE,
                    { duration: 6000 }
                );
            } else {
                showToast("Quest list refreshed.", Toasts.Type.SUCCESS);
            }
        } finally {
            setPending(false);
        }
    };

    return (
        <button
            type="button"
            className={`quest-ui-reload-icon-button${pending ? " is-spinning" : ""}`}
            disabled={pending}
            aria-busy={pending}
            aria-label="Refresh Quest list"
            title="Refresh Quest list"
            onClick={() => void run()}
        >
            <ReloadIcon />
        </button>
    );
}
