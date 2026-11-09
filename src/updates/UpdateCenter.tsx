import { relaunch } from "@utils/native";
import { Popout, useEffect, useRef, useState } from "@webpack/common";

import { checkForUpdates, getUpdateSnapshot, subscribeUpdateState, type PluginUpdateState, type UpdateProduct, type UpdateSnapshot } from "./runtime";
import { managedNative as Native, runManagedReleaseUpdate, runOrionUpdateDecision, saveSkippedUpdate, saveUpdateReminder, toastFailure, type AvailableUpdateState, type ManagedReleaseUpdateResult, type UpdatePendingAction } from "./managed";
import { UpdateCenterIcon, UpdateProductStatus, availableUpdate, combinedAvailabilityCopy, dashboardAvailabilityLines, formatCompactTimestamp, formatTimestamp, healthForProduct, productLabel, safeOpenRelease, stateCopy, updateProductTone, visibleReleaseVersion, visibleUpdate } from "./status";

import "./styles.css";

function useUpdateSnapshot(): UpdateSnapshot {
    const [, setRevision] = useState(0);
    useEffect(() => subscribeUpdateState(() => setRevision(value => value + 1)), []);
    return getUpdateSnapshot();
}

function UpdateResultNotice({ result }: { result: ManagedReleaseUpdateResult | null; }) {
    if (!result) return null;
    const tone = result.status === "decision-required" || result.status === "kept"
        ? " is-warning"
        : result.ok
            ? " is-success"
            : " is-error";
    return <span className={`quest-ui-update-result${tone}`}>{result.message}</span>;
}

function OrionUpdateDecisionPanel({
    result,
    pending,
    onDecision
}: {
    result: ManagedReleaseUpdateResult | null;
    pending: UpdatePendingAction;
    onDecision(action: "keep" | "discard"): void;
}) {
    if (result?.status !== "decision-required" || !result.decision) return null;

    return (
        <div className="quest-ui-update-decision">
            <strong>Local OrionQuests work detected</strong>
            <span>{result.decision.summary}</span>
            <span>
                Keep leaves the checkout untouched and skips this update. Discard &amp; update resets tracked local work,
                removes non-ignored untracked files, then updates and rebuilds Vencord.
            </span>
            <div className="quest-ui-update-decision-actions">
                <button type="button" disabled={pending !== null} onClick={() => onDecision("keep")}>
                    Keep
                </button>
                <button
                    type="button"
                    className="is-destructive"
                    disabled={pending !== null}
                    onClick={() => onDecision("discard")}
                >
                    {pending === "update" ? "Updating…" : "Discard & update"}
                </button>
            </div>
        </div>
    );
}

function UpdateCardActions({
    product,
    state,
    pending,
    updateResult,
    canNativeUpdate,
    awaitingDecision,
    onUpdate,
    onSnooze,
    onSkip
}: {
    product: UpdateProduct;
    state: AvailableUpdateState;
    pending: UpdatePendingAction;
    updateResult: ManagedReleaseUpdateResult | null;
    canNativeUpdate: boolean;
    awaitingDecision: boolean;
    onUpdate(): void;
    onSnooze(): void;
    onSkip(): void;
}) {
    return (
        <div className="quest-ui-update-card-actions">
            {canNativeUpdate && !updateResult?.restartRequired && !awaitingDecision && (
                <button type="button" disabled={pending !== null} onClick={onUpdate}>
                    {pending === "update" ? "Updating…" : "Update now"}
                </button>
            )}
            {updateResult?.ok && updateResult.restartRequired && (
                <button type="button" className="quest-ui-update-restart" onClick={relaunch}>Restart Discord</button>
            )}
            <button type="button" onClick={() => safeOpenRelease(product, state.release)}>View release</button>
            <button type="button" disabled={pending !== null} onClick={onSnooze}>
                {pending === "snooze" ? "Saving…" : "Remind me later"}
            </button>
            <button type="button" disabled={pending !== null} onClick={onSkip}>
                {pending === "skip" ? "Saving…" : `Skip ${state.release.tagName}`}
            </button>
        </div>
    );
}

function UpdateReleaseCard({ product, state }: {
    product: UpdateProduct;
    state: AvailableUpdateState;
}) {
    const [pending, setPending] = useState<UpdatePendingAction>(null);
    const [updateResult, setUpdateResult] = useState<ManagedReleaseUpdateResult | null>(null);
    const [checkoutInspection, setCheckoutInspection] = useState<ManagedReleaseUpdateResult | null>(null);
    const [checkoutInspectionPending, setCheckoutInspectionPending] = useState(false);
    const label = productLabel(product);
    const nativeAvailable = Native !== null;

    useEffect(() => {
        if (!Native) {
            setCheckoutInspection(null);
            setCheckoutInspectionPending(false);
            return;
        }

        let cancelled = false;
        setCheckoutInspection(null);
        setCheckoutInspectionPending(true);
        const inspect = product === "questui"
            ? Native.inspectQuestUICheckout
            : Native.inspectOrionCheckout;

        void inspect()
            .then(result => {
                if (!cancelled) setCheckoutInspection(result);
            })
            .catch(error => {
                if (cancelled) return;
                setCheckoutInspection({
                    ok: false,
                    status: "failed",
                    message: label + " could not inspect this managed checkout.",
                    diagnostic: error instanceof Error ? error.message : String(error)
                });
            })
            .finally(() => {
                if (!cancelled) setCheckoutInspectionPending(false);
            });

        return () => {
            cancelled = true;
        };
    }, [product, state.installed, state.release.tagName]);

    const canNativeUpdate = nativeAvailable
        && !checkoutInspectionPending
        && checkoutInspection?.ok === true;
    const awaitingDecision = product === "orion"
        && updateResult?.status === "decision-required"
        && updateResult.decision != null;
    const checkoutInspectionMessage = !nativeAvailable
        ? null
        : checkoutInspectionPending || checkoutInspection == null
            ? "Checking whether this " + label + " checkout can be updated safely…"
            : checkoutInspection.ok
                ? null
                : checkoutInspection.message;

    const updateRelease = () => {
        if (!canNativeUpdate || pending) return;
        void runManagedReleaseUpdate(product, state, label, setPending, setUpdateResult);
    };
    const resolveOrionDecision = (action: "keep" | "discard") => {
        if (product !== "orion" || pending || !updateResult?.decision) return;
        void runOrionUpdateDecision(action, state, updateResult, setPending, setUpdateResult);
    };
    const snooze = () => {
        if (pending) return;
        void saveUpdateReminder(product, label, setPending);
    };
    const skip = () => {
        if (pending) return;
        void saveSkippedUpdate(product, state, label, setPending);
    };

    return (
        <div className={`quest-ui-update-card${state.suppression ? " is-suppressed" : ""}`}>
            <div className="quest-ui-update-card-heading">
                <div>
                    <strong>{label}</strong>
                    <span>{state.installed} → {state.release.tagName}</span>
                </div>
                <span className={`quest-ui-update-channel${state.release.prerelease ? " is-prerelease" : ""}`}>
                    {state.release.prerelease ? "Pre-release" : "Stable"}
                </span>
            </div>

            {state.release.name && state.release.name !== state.release.tagName && (
                <span className="quest-ui-update-release-name">{state.release.name}</span>
            )}
            {state.suppression === "skipped" && <span className="quest-ui-update-suppressed-copy">Skipped for this version</span>}
            {state.suppression === "snoozed" && <span className="quest-ui-update-suppressed-copy">Reminder snoozed for 24 hours</span>}
            {!nativeAvailable && (
                <span className="quest-ui-update-suppressed-copy">Managed source updates require Vencord desktop. Use View release.</span>
            )}
            {checkoutInspectionMessage && (
                <span className="quest-ui-update-suppressed-copy">{checkoutInspectionMessage}</span>
            )}

            <UpdateResultNotice result={updateResult} />
            {product === "orion" && (
                <OrionUpdateDecisionPanel
                    result={updateResult}
                    pending={pending}
                    onDecision={resolveOrionDecision}
                />
            )}
            <UpdateCardActions
                product={product}
                state={state}
                pending={pending}
                updateResult={updateResult}
                canNativeUpdate={canNativeUpdate}
                awaitingDecision={awaitingDecision}
                onUpdate={updateRelease}
                onSnooze={snooze}
                onSkip={skip}
            />
        </div>
    );
}

function UpdateCenterPanel({ snapshot }: { snapshot: UpdateSnapshot; }) {
    const states: Array<[UpdateProduct, PluginUpdateState]> = [
        ["questui", snapshot.questUI],
        ["orion", snapshot.orion]
    ];
    const available = states.filter((entry): entry is [UpdateProduct, Extract<PluginUpdateState, { kind: "available"; }>] => availableUpdate(entry[1]));
    const visibleCount = states.filter(([, state]) => visibleUpdate(state)).length;
    const failedProducts = states.filter(([product, state]) =>
        healthForProduct(snapshot, product).error != null || state.kind === "error"
    );
    const hasError = failedProducts.length > 0;
    const failedProductCopy = failedProducts.map(([product]) => productLabel(product)).join(" and ");
    const availabilityCopy = combinedAvailabilityCopy(snapshot);

    return (
        <div className="quest-ui-update-panel" role="group" aria-label="Plugin updates">
            <div className="quest-ui-update-panel-heading">
                <div className="quest-ui-update-panel-title">
                    <span className="quest-ui-update-panel-title-icon"><UpdateCenterIcon /></span>
                    <div>
                        <strong>Updates</strong>
                        <span>QuestUI · OrionQuests</span>
                    </div>
                </div>
                <button
                    type="button"
                    className="quest-ui-update-check-button"
                    disabled={snapshot.checking}
                    onClick={() => { void checkForUpdates(true); }}
                >
                    {snapshot.checking ? "Checking…" : "Check now"}
                </button>
            </div>

            <div className={`quest-ui-update-overview${visibleCount > 0 ? " has-update" : hasError ? " has-error" : " is-current"}`}>
                <span className="quest-ui-update-overview-dot" aria-hidden="true" />
                <div>
                    <strong>
                        {snapshot.checking ? "Checking releases…" : availabilityCopy}
                    </strong>
                    <span>
                        {snapshot.checking
                            ? "Comparing installed versions with the configured release channels."
                            : visibleCount > 0 && hasError
                                ? `${failedProductCopy} check needs attention; known updates remain actionable.`
                                : visibleCount > 0
                                    ? "Review the release below or update directly when supported."
                                    : hasError
                                        ? `${failedProductCopy} ${failedProducts.length === 1 ? "check needs" : "checks need"} attention; successful product state is preserved.`
                                        : "Configured release feeds are current."}
                    </span>
                </div>
            </div>

            <div className="quest-ui-update-status-grid">
                {states.map(([product, state]) => {
                    const health = healthForProduct(snapshot, product);
                    const showHealth = state.kind !== "not-installed" && state.kind !== "disabled";
                    return (
                        <div className={`quest-ui-update-status-row is-${updateProductTone(state, health)}`} key={product}>
                            <UpdateProductStatus product={product} state={state} health={health} />
                            <div className="quest-ui-update-status-details">
                                <span className="quest-ui-update-status-copy">{stateCopy(product, state)}</span>
                                {health.error && <span className="quest-ui-update-status-error">{health.error}</span>}
                                {showHealth && (
                                    <span className="quest-ui-update-status-health">
                                        Last successful check · {formatCompactTimestamp(health.lastSuccessfulCheckAt)}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {available.length > 0 && (
                <div className="quest-ui-update-list">
                    {available.map(([product, state]) => <UpdateReleaseCard key={product} product={product} state={state} />)}
                </div>
            )}

            <div className="quest-ui-update-last-check">
                <span>QuestUI last successful check · {formatTimestamp(snapshot.questUIHealth.lastSuccessfulCheckAt)}</span>
                {snapshot.orion.kind !== "not-installed" && (
                    <span>OrionQuests last successful check · {formatTimestamp(snapshot.orionHealth.lastSuccessfulCheckAt)}</span>
                )}
                {!snapshot.automaticChecksEnabled && (
                    <span className="quest-ui-update-manual-warning">
                        You are turning off AutoUpdater, please check update manually
                    </span>
                )}
            </div>
        </div>
    );
}

export function UpdateCenterIndicator() {
    const snapshot = useUpdateSnapshot();
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const count = Number(visibleUpdate(snapshot.questUI)) + Number(visibleUpdate(snapshot.orion));
    const updateCopy = count > 0
        ? `${count} ${count === 1 ? "update" : "updates"} available`
        : "Open update center";

    return (
        <Popout
            position="bottom"
            align="right"
            animation={Popout.Animation.NONE}
            shouldShow={open}
            onRequestClose={() => setOpen(false)}
            targetElementRef={buttonRef}
            renderPopout={() => <UpdateCenterPanel snapshot={snapshot} />}
        >
            {(_, { isShown }) => (
                <button
                    ref={buttonRef}
                    type="button"
                    className={`quest-ui-toolbar-button quest-ui-update-center-button${isShown ? " is-open" : ""}${count > 0 ? " has-update" : ""}${snapshot.checking ? " is-checking" : ""}`}
                    onClick={() => setOpen(value => !value)}
                    aria-expanded={isShown}
                    aria-label={updateCopy}
                    title={count > 0 ? updateCopy : "Updates"}
                >
                    <UpdateCenterIcon />
                    {count > 0 && <span className="quest-ui-update-count" aria-hidden="true">{count > 9 ? "9+" : count}</span>}
                </button>
            )}
        </Popout>
    );
}

export function DashboardUpdateNotice() {
    const snapshot = useUpdateSnapshot();
    const questUIVersion = visibleReleaseVersion(snapshot.questUI);
    const orionVersion = visibleReleaseVersion(snapshot.orion);
    const hasUpdate = questUIVersion != null || orionVersion != null;
    const hasError = snapshot.questUIHealth.error != null
        || snapshot.orionHealth.error != null
        || snapshot.questUI.kind === "error"
        || snapshot.orion.kind === "error";

    const allCurrent = snapshot.questUI.kind === "up-to-date"
        && (
            snapshot.orion.kind === "up-to-date"
            || snapshot.orion.kind === "not-installed"
            || snapshot.orion.kind === "disabled"
        );

    if (!snapshot.checking && !hasUpdate && !hasError && !allCurrent) return null;

    const [primaryCopy, secondaryCopy] = dashboardAvailabilityLines(snapshot);
    const ariaCopy = secondaryCopy ? `${primaryCopy} ${secondaryCopy}` : primaryCopy;

    return (
        <div className="quest-ui-dashboard-update-slot" aria-label={ariaCopy}>
            <span className={`quest-ui-dashboard-update-chip${
                snapshot.checking
                    ? " is-checking"
                    : hasUpdate
                        ? " has-update"
                        : hasError
                            ? " has-error"
                            : " is-current"
            }`}>
                <span className="quest-ui-dashboard-update-chip-dot" aria-hidden="true" />
                <span className="quest-ui-dashboard-update-chip-copy">
                    <span>{primaryCopy}</span>
                    {secondaryCopy && <span>{secondaryCopy}</span>}
                </span>
            </span>
        </div>
    );
}

export function UpdateSettingsControl() {
    const snapshot = useUpdateSnapshot();
    const [manualPending, setManualPending] = useState(false);

    const check = async () => {
        if (manualPending || snapshot.checking) return;
        setManualPending(true);
        try {
            await checkForUpdates(true);
        } catch {
            toastFailure("QuestUI could not check for plugin updates.");
        } finally {
            setManualPending(false);
        }
    };

    const questUpdate = visibleUpdate(snapshot.questUI);
    const orionUpdate = visibleUpdate(snapshot.orion);
    const activeCount = Number(questUpdate) + Number(orionUpdate);
    const failedProducts = [
        snapshot.questUIHealth.error != null || snapshot.questUI.kind === "error" ? "QuestUI" : null,
        snapshot.orionHealth.error != null || snapshot.orion.kind === "error" ? "OrionQuests" : null
    ].filter((value): value is string => value !== null);
    const headline = activeCount > 0
        ? `${activeCount} ${activeCount === 1 ? "update" : "updates"} available`
        : snapshot.checking
            ? "Checking releases…"
            : failedProducts.length === 1
                ? `${failedProducts[0]} check needs attention`
                : failedProducts.length > 1
                    ? "Update checks need attention"
                    : "Checks current";

    return (
        <div className={`quest-ui-update-settings-control${activeCount > 0 ? " has-update" : ""}`}>
            <div className="quest-ui-update-settings-summary">
                <div className="quest-ui-update-settings-headline">
                    <strong>Update status</strong>
                    <span>{headline}</span>
                </div>
                <div className="quest-ui-update-settings-products">
                    <UpdateProductStatus product="questui" state={snapshot.questUI} health={snapshot.questUIHealth} compact />
                    {snapshot.orion.kind !== "not-installed" && (
                        <UpdateProductStatus product="orion" state={snapshot.orion} health={snapshot.orionHealth} compact />
                    )}
                </div>
            </div>
            <button type="button" disabled={manualPending || snapshot.checking} onClick={check}>
                {manualPending || snapshot.checking ? "Checking…" : "Check"}
            </button>
        </div>
    );
}


