import { captureAccountSession, isCurrentAccountSession } from "../plugin/accountSession";
import { showToast, useEffect, useRef, useState } from "@webpack/common";

import { pushDashboardNotice } from "../dashboard/notifications";

import { deriveGlobalOrionControl, farmableQuestIds } from "./controls";
import { OrionPauseIcon, OrionPlayIcon, OrionStopIcon } from "./icons";
import {
    getOrionControlSnapshot,
    invokeOrionEngineControl,
    invokeOrionGlobalTaskControl,
    subscribeOrionControlState
} from "./integration";
import { useQuestSnapshot } from "../quests/data";

function smartLabel(action: "start" | "pause" | "resume"): string {
    if (action === "pause") return "Pause all Orion Quest farming";
    if (action === "resume") return "Resume all Orion Quest farming";
    return "Start all Orion Quest farming";
}

function showControlSuccess(action: "start" | "pause" | "resume" | "stop"): void {
    pushDashboardNotice({
        tone: "success",
        text: action === "start"
            ? "Orion started"
            : action === "pause"
                ? "Orion paused"
                : action === "resume"
                    ? "Orion resumed"
                    : "Orion stopped",
        duration: 2100
    });
}

function showControlFailure(error: unknown): void {
    showToast({
        text: error instanceof Error ? error.message : "Orion rejected the requested control action.",
        variant: "critical",
        duration: 6000
    });
}

export function OrionGlobalControls() {
    const quests = useQuestSnapshot();
    const [, setRevision] = useState(0);
    const [pending, setPending] = useState(false);
    const mounted = useRef(true);
    const pendingRef = useRef(false);
    const session = captureAccountSession();
    const ownsView = () => mounted.current && isCurrentAccountSession(session);

    useEffect(() => {
        mounted.current = true;
        const refresh = () => setRevision(revision => revision + 1);
        const unsubscribe = subscribeOrionControlState(refresh);
        return () => { mounted.current = false; unsubscribe?.(); };
    }, []);

    // The subscription only schedules a render. Every render re-reads Orion itself, so QuestUI
    // never keeps a second engine/task snapshot that can outlive a plugin reload or disable.
    const snapshot = getOrionControlSnapshot();
    if (!snapshot) return null;

    const control = deriveGlobalOrionControl(snapshot, farmableQuestIds(quests));
    const smartTitle = smartLabel(control.action);

    const runSmart = async () => {
        if (pendingRef.current || !ownsView()) return;
        const latest = getOrionControlSnapshot();
        if (!latest) return;
        const fresh = deriveGlobalOrionControl(latest, farmableQuestIds(quests));
        if (fresh.smartDisabled || fresh.action !== control.action) return;
        pendingRef.current = true;
        setPending(true);
        try {
            if (control.action === "start") {
                await invokeOrionEngineControl("start");
            } else {
                await invokeOrionGlobalTaskControl(control.action);
            }
            if (ownsView()) showControlSuccess(control.action);
        } catch (error) {
            if (ownsView()) showControlFailure(error);
        } finally {
            pendingRef.current = false;
            if (mounted.current) setPending(false);
        }
    };

    const runStop = async () => {
        if (pendingRef.current || !ownsView()) return;
        const latest = getOrionControlSnapshot();
        if (!latest || deriveGlobalOrionControl(latest, farmableQuestIds(quests)).stopDisabled) return;
        pendingRef.current = true;
        setPending(true);
        try {
            await invokeOrionEngineControl("stop");
            if (ownsView()) showControlSuccess("stop");
        } catch (error) {
            if (ownsView()) showControlFailure(error);
        } finally {
            pendingRef.current = false;
            if (mounted.current) setPending(false);
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
                <span className="quest-ui-orion-control-label">
                    {control.action === "pause" ? "Pause" : control.action === "resume" ? "Resume" : "Start"}
                </span>
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
                <span className="quest-ui-orion-control-label">Stop</span>
            </button>
        </span>
    );
}
