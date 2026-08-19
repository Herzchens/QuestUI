import { showToast, Toasts, useEffect, useState } from "@webpack/common";

import { deriveQuestOrionControl } from "./orionControlLogic";
import { OrionPauseIcon, OrionPlayIcon } from "./orionIcons";
import {
    getOrionControlSnapshot,
    invokeOrionEngineControl,
    invokeOrionQuestTaskControl,
    subscribeOrionControlState
} from "./orionIntegration";
import type { NormalizedQuest } from "./questData";

function titleFor(action: "start" | "pause" | "resume", questName: string, disabled: boolean): string {
    if (disabled) return `Waiting for Orion to queue ${questName}`;
    if (action === "pause") return `Pause Orion farming for ${questName}`;
    if (action === "resume") return `Resume Orion farming for ${questName}`;
    return "Start Orion Quest farming";
}

export function OrionQuestControl({ quest }: { quest: NormalizedQuest; }) {
    const [, setRevision] = useState(0);
    const [pending, setPending] = useState(false);

    useEffect(() => {
        const refresh = () => setRevision(revision => revision + 1);
        const unsubscribe = subscribeOrionControlState(refresh);
        return () => unsubscribe?.();
    }, []);

    const snapshot = getOrionControlSnapshot();
    if (!snapshot) return null;

    const control = deriveQuestOrionControl(snapshot, quest.id);
    const title = titleFor(control.action, quest.name, control.disabled);

    const run = async () => {
        if (pending || control.disabled) return;
        setPending(true);
        try {
            const response = control.action === "start"
                ? await invokeOrionEngineControl("start")
                : await invokeOrionQuestTaskControl(quest.id, control.action);
            showToast(`Orion: ${response}`, Toasts.Type.SUCCESS);
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "Orion rejected the requested Quest control action.",
                Toasts.Type.FAILURE,
                { duration: 6000 }
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <button
            type="button"
            className={`quest-ui-card-orion-control is-${control.action}`}
            disabled={pending || control.disabled}
            aria-busy={pending}
            aria-label={title}
            title={title}
            onClick={() => void run()}
        >
            {control.action === "pause" ? <OrionPauseIcon /> : <OrionPlayIcon />}
        </button>
    );
}
