import { showToast, Toasts, useEffect, useState } from "@webpack/common";

import { getOrionEngineRunning, invokeOrionControl, subscribeOrionEngineRunning } from "./orionIntegration";
import type { OrionCommandAction } from "./orionCommandLogic";

function TriangleIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13L18.5 12 8 5.5Z" /></svg>;
}

function SquareIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5h11v11h-11Z" /></svg>;
}

function labelFor(action: OrionCommandAction): string {
    return action === "start" ? "Start all Orion Quest farming" : "Stop all Orion Quest farming";
}

export function OrionGlobalControls() {
    const [running, setRunning] = useState(() => getOrionEngineRunning());
    const [pending, setPending] = useState(false);

    useEffect(() => {
        const refresh = () => setRunning(getOrionEngineRunning());
        refresh();
        const unsubscribe = subscribeOrionEngineRunning(refresh);
        return () => unsubscribe?.();
    }, []);

    if (running === null) return null;
    const action: OrionCommandAction = running ? "stop" : "start";
    const label = labelFor(action);

    const run = async () => {
        if (pending) return;
        setPending(true);
        try {
            await invokeOrionControl(action);
            setRunning(getOrionEngineRunning());
        } catch (error) {
            showToast(
                error instanceof Error ? error.message : "Orion rejected the requested control action.",
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
            className={`quest-ui-orion-icon-button is-${action}`}
            disabled={pending}
            aria-busy={pending}
            aria-label={label}
            title={label}
            onClick={() => void run()}
        >
            {action === "start" ? <TriangleIcon /> : <SquareIcon />}
        </button>
    );
}
