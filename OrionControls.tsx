import { showToast, Toasts, useEffect, useState } from "@webpack/common";

import { deriveGlobalOrionControl, farmableQuestIds } from "./orionControlLogic";
import { OrionPauseIcon, OrionPlayIcon, OrionStopIcon } from "./orionIcons";
import {
    getOrionControlSnapshot,
    invokeOrionEngineControl,
    invokeOrionGlobalTaskControl,
    subscribeOrionControlState
} from "./orionIntegration";
import type { OrionControlSnapshot } from "./orionCommandLogic";
import { useQuestSnapshot } from "./questData";

function smartLabel(action: "start" | "pause" | "resume"): string {
    if (action === "pause") return "Pause all Orion Quest farming";
    if (action === "resume") return "Resume all Orion Quest farming";
    return "Start all Orion Quest farming";
}

function showControlSuccess(response: string): void {
    showToast(`Orion: ${response}`, Toasts.Type.SUCCESS);
}

function showControlFailure(error: unknown): void {
    showToast(
        error instanceof Error ? error.message : "Orion rejected the requested control action.",
        Toasts.Type.FAILURE,
        { duration: 6000 }
    );
}

export function OrionGlobalControls() {
    const quests = useQuestSnapshot();
    const [snapshot, setSnapshot] = useState<OrionControlSnapshot | null>(() => getOrionControlSnapshot());
    const [pending, setPending] = useState(false);

    useEffect(() => {
        const refresh = () => setSnapshot(getOrionControlSnapshot());
        refresh();
        const unsubscribe = subscribeOrionControlState(refresh);
        return () => unsubscribe?.();
    }, []);

    // The Quest snapshot has a read-only fallback render clock. Re-read Orion here as well so a
    // Dashboard that survives an Orion hot-reload cannot remain visually pinned to the old object.
    const liveSnapshot = getOrionControlSnapshot() ?? snapshot;
    if (!liveSnapshot) return null;

    const control = deriveGlobalOrionControl(liveSnapshot, farmableQuestIds(quests));
    const smartTitle = smartLabel(control.action);

    const runSmart = async () => {
        if (pending || control.smartDisabled) return;
        setPending(true);
        try {
            const response = control.action === "start"
                ? await invokeOrionEngineControl("start")
                : await invokeOrionGlobalTaskControl(control.action);
            setSnapshot(getOrionControlSnapshot());
            showControlSuccess(response);
        } catch (error) {
            showControlFailure(error);
        } finally {
            setPending(false);
        }
    };

    const runStop = async () => {
        if (pending || control.stopDisabled) return;
        setPending(true);
        try {
            const response = await invokeOrionEngineControl("stop");
            setSnapshot(getOrionControlSnapshot());
            showControlSuccess(response);
        } catch (error) {
            showControlFailure(error);
        } finally {
            setPending(false);
        }
    };

    return (
        <span className="quest-ui-orion-controls">
            <button
                type="button"
                className={`quest-ui-orion-icon-button is-${control.action}`}
                disabled={pending || control.smartDisabled}
                aria-busy={pending}
                aria-label={smartTitle}
                title={smartTitle}
                onClick={() => void runSmart()}
            >
                {control.action === "pause" ? <OrionPauseIcon /> : <OrionPlayIcon />}
            </button>
            <button
                type="button"
                className="quest-ui-orion-icon-button is-stop"
                disabled={pending || control.stopDisabled}
                aria-busy={pending}
                aria-label="Stop Orion Quest farming"
                title="Stop Orion Quest farming"
                onClick={() => void runStop()}
            >
                <OrionStopIcon />
            </button>
        </span>
    );
}
