import type { PluginNative } from "@utils/types";
import { showToast } from "@webpack/common";

import { recordQuestUIEvent } from "../eventLog/runtime";
import type { QuestUIUpdateResult } from "./questui/native";
import { skipUpdate, snoozeUpdate, type PluginUpdateState, type UpdateProduct } from "./runtime";
import { productLabel } from "./status";

export interface ManagedReleaseUpdateResult {
    ok: boolean;
    status: string;
    message: string;
    fromVersion?: string;
    toVersion?: string;
    fromCommit?: string;
    toCommit?: string;
    restartRequired?: boolean;
    phase?: string;
    diagnostic?: string;
    method?: string;
    trace?: readonly string[];
    sourceIdentity?: string;
    officialMainCommit?: string;
    decision?: {
        token: string;
        summary: string;
        changes: readonly string[];
        localCommitCount: number;
    };
}

type ManagedUpdateEventOutcome =
    | "started"
    | "decision-required"
    | "discard-confirmed"
    | "kept"
    | "succeeded"
    | "failed";

export const managedNative = !IS_WEB
    ? VencordNative.pluginHelpers.QuestUI as PluginNative<typeof import("../../native")>
    : null;

export function toastFailure(message: string): void {
    showToast({ text: message, variant: "critical" });
}

function managedUpdateEventCode(product: UpdateProduct, outcome: ManagedUpdateEventOutcome): string {
    const prefix = product === "questui" ? "QUESTUI_UPDATE" : "ORION_UPDATE";
    return prefix + "_" + outcome.replace(/-/g, "_").toUpperCase();
}

function managedUpdateSeverity(
    outcome: ManagedUpdateEventOutcome,
    result: ManagedReleaseUpdateResult | null
): "success" | "error" | "warning" | "info" {
    if (outcome === "succeeded") return "success";
    if (outcome === "failed") return result?.status === "rollback-failed" ? "error" : "warning";
    if (outcome === "decision-required") return "warning";
    return "info";
}

function managedUpdateSummary(
    product: UpdateProduct,
    outcome: ManagedUpdateEventOutcome,
    result: ManagedReleaseUpdateResult | null,
    installed: string,
    target: string
): string {
    const label = productLabel(product);
    const fromVersion = result?.fromVersion ?? installed;
    const toVersion = result?.toVersion ?? target;

    switch (outcome) {
        case "started":
            return label + " managed update started: " + installed + " -> " + target;
        case "decision-required":
            return label + " update needs a local-work decision: " + (result?.decision?.summary ?? "local checkout differs");
        case "discard-confirmed":
            return label + " local-work discard confirmed; revalidating the exact checkout snapshot";
        case "kept":
            return label + " local work kept; update skipped";
        case "succeeded":
            return label + " updated " + fromVersion + " -> " + toVersion
                + (result?.method ? " via " + result.method : "");
        case "failed":
            return label + " update stopped"
                + (result?.phase ? " at " + result.phase : "")
                + " (" + (result?.status ?? "failed") + "): "
                + (result?.message ?? "unknown failure");
    }
}

function managedUpdateTrace(
    outcome: ManagedUpdateEventOutcome,
    result: ManagedReleaseUpdateResult | null,
    installed: string,
    target: string
): string | null {
    if (result?.trace?.length) return result.trace.join("\n");
    if (outcome === "started") {
        return "Request: " + installed + " -> " + target + "\nExecutor: QuestUI native managed updater";
    }
    return null;
}

function recordManagedUpdateEvent(
    product: UpdateProduct,
    outcome: ManagedUpdateEventOutcome,
    result: ManagedReleaseUpdateResult | null,
    installed: string,
    target: string
): void {
    const rollbackFailed = result?.status === "rollback-failed";
    const fromVersion = result?.fromVersion ?? installed;
    const toVersion = result?.toVersion ?? target;

    void recordQuestUIEvent({
        severity: managedUpdateSeverity(outcome, result),
        category: "diagnostic",
        eventCode: managedUpdateEventCode(product, outcome),
        summary: managedUpdateSummary(product, outcome, result, installed, target),
        detail: {
            product,
            status: result?.status ?? outcome,
            phase: result?.phase ?? null,
            updateMethod: result?.method ?? null,
            fromVersion,
            toVersion,
            fromCommit: result?.fromCommit ?? null,
            toCommit: result?.toCommit ?? null,
            sourceIdentity: result?.sourceIdentity ?? null,
            officialMainCommit: result?.officialMainCommit ?? null,
            localWorkSummary: result?.decision?.summary ?? null,
            localCommitCount: result?.decision?.localCommitCount ?? null,
            updateTrace: managedUpdateTrace(outcome, result, installed, target),
            diagnostic: result?.diagnostic ?? null,
            terminal: rollbackFailed
        }
    });
}


export type AvailableUpdateState = Extract<PluginUpdateState, { kind: "available"; }>;
export type UpdatePendingAction = "update" | "snooze" | "skip" | null;

function applyManagedUpdateResult(
    product: UpdateProduct,
    state: AvailableUpdateState,
    result: ManagedReleaseUpdateResult,
    setUpdateResult: (value: ManagedReleaseUpdateResult | null) => void
): void {
    setUpdateResult(result);

    if (result.status === "decision-required") {
        recordManagedUpdateEvent(product, "decision-required", result, state.installed, state.release.tagName);
        return;
    }
    if (result.status === "kept") {
        recordManagedUpdateEvent(product, "kept", result, state.installed, state.release.tagName);
        return;
    }

    recordManagedUpdateEvent(
        product,
        result.ok ? "succeeded" : "failed",
        result,
        state.installed,
        state.release.tagName
    );
    showToast({ text: result.message, variant: result.ok ? "success" : "critical" });
}

function managedUpdateInvocationFailure(message: string, error: unknown): ManagedReleaseUpdateResult {
    return {
        ok: false,
        status: "failed",
        message,
        phase: "ipc",
        diagnostic: error instanceof Error ? error.message : String(error)
    };
}

export async function runManagedReleaseUpdate(
    product: UpdateProduct,
    state: AvailableUpdateState,
    label: string,
    setPending: (value: UpdatePendingAction) => void,
    setUpdateResult: (value: ManagedReleaseUpdateResult | null) => void
): Promise<void> {
    setPending("update");
    setUpdateResult(null);
    recordManagedUpdateEvent(product, "started", null, state.installed, state.release.tagName);

    try {
        if (!managedNative) return;
        const result = product === "questui"
            ? await managedNative.updateQuestUIRelease(state.installed, state.release.tagName) as QuestUIUpdateResult
            : await managedNative.updateOrionRelease(state.installed, state.release.tagName);
        applyManagedUpdateResult(product, state, result, setUpdateResult);
    } catch (error) {
        const result = managedUpdateInvocationFailure(
            `${label} could not invoke its managed release updater.`,
            error
        );
        setUpdateResult(result);
        recordManagedUpdateEvent(product, "failed", result, state.installed, state.release.tagName);
        toastFailure(result.message);
    } finally {
        setPending(null);
    }
}

export async function runOrionUpdateDecision(
    action: "keep" | "discard",
    state: AvailableUpdateState,
    currentResult: ManagedReleaseUpdateResult,
    setPending: (value: UpdatePendingAction) => void,
    setUpdateResult: (value: ManagedReleaseUpdateResult | null) => void
): Promise<void> {
    if (!managedNative || !currentResult.decision) return;

    setPending("update");
    if (action === "discard") {
        recordManagedUpdateEvent("orion", "discard-confirmed", currentResult, state.installed, state.release.tagName);
    }

    try {
        const result = await managedNative.updateOrionRelease(
            state.installed,
            state.release.tagName,
            { action, token: currentResult.decision.token }
        );
        applyManagedUpdateResult("orion", state, result, setUpdateResult);
    } catch (error) {
        const result = managedUpdateInvocationFailure(
            "OrionQuests could not resolve the local-work update choice.",
            error
        );
        setUpdateResult(result);
        recordManagedUpdateEvent("orion", "failed", result, state.installed, state.release.tagName);
        toastFailure(result.message);
    } finally {
        setPending(null);
    }
}

export async function saveUpdateReminder(
    product: UpdateProduct,
    label: string,
    setPending: (value: UpdatePendingAction) => void
): Promise<void> {
    setPending("snooze");
    try {
        await snoozeUpdate(product, 24);
    } catch {
        toastFailure(`Could not save the ${label} reminder.`);
    } finally {
        setPending(null);
    }
}

export async function saveSkippedUpdate(
    product: UpdateProduct,
    state: AvailableUpdateState,
    label: string,
    setPending: (value: UpdatePendingAction) => void
): Promise<void> {
    setPending("skip");
    try {
        await skipUpdate(product, state.release.tagName);
    } catch {
        toastFailure(`Could not save the skipped ${label} version.`);
    } finally {
        setPending(null);
    }
}

