import { relaunch } from "@utils/native";
import { plugins } from "@api/PluginManager";
import { openPluginModal } from "@components/settings";
import { Popout, useEffect, useRef, useState } from "@webpack/common";

import { checkForUpdates, getInstalledRelease, getUpdateSnapshot, subscribeUpdateState, type PluginUpdateState, type UpdateProduct, type UpdateSnapshot } from "./runtime";
import { managedNative as Native, runManagedReleaseUpdate, runOrionUpdateDecision, saveSkippedUpdate, saveUpdateReminder, toastFailure, type AvailableUpdateState, type ManagedReleaseUpdateResult, type UpdatePendingAction } from "./managed";
import { UpdateCenterIcon, UpdateProductStatus, availableUpdate, combinedAvailabilityCopy, dashboardAvailabilityLines, formatCompactTimestamp, healthForProduct, productLabel, safeOpenRelease, updateProductTone, visibleReleaseVersion, visibleUpdate } from "./status";
import { pushDashboardNotice } from "../dashboard/notifications";

import "./styles.css";

function useUpdateSnapshot(): UpdateSnapshot {
    const [, setRevision] = useState(0);
    useEffect(() => subscribeUpdateState(() => setRevision(value => value + 1)), []);
    return getUpdateSnapshot();
}

let lastDashboardUpdateNoticeSignature = "";

const UPDATE_REPOSITORY_URLS: Record<UpdateProduct, string> = {
    questui: "https://github.com/Herzchens/QuestUI",
    orion: "https://github.com/nyxxbit/discord-quest-completer"
};

function openUpdateRepository(product: UpdateProduct): void {
    const url = UPDATE_REPOSITORY_URLS[product];
    if (IS_WEB) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
    }
    VencordNative.native.openExternal(url);
}

function GitHubIcon() {
    return (
        <svg className="quest-ui-update-github-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-1.05-.02-1.9-2.78.62-3.37-1.2-3.37-1.2-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .08 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.67.35-1.11.64-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.4 9.4 0 0 1 12 6.93a9.3 9.3 0 0 1 2.5.35c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .27.18.6.69.49A10.25 10.25 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z"
            />
        </svg>
    );
}

function UpdateStateIcon({ kind }: { kind: "current" | "available" | "error" | "checking" | "muted"; }) {
    if (kind === "current") {
        return (
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m3.3 8.2 2.8 2.8 6.6-6.6" />
            </svg>
        );
    }
    if (kind === "available") {
        return (
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 12V4M4.8 7.2 8 4l3.2 3.2" />
            </svg>
        );
    }
    if (kind === "error") {
        return (
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 4.2v4.7M8 11.8v.1" />
            </svg>
        );
    }
    if (kind === "checking") {
        return (
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M13 8a5 5 0 1 1-1.4-3.46M13 3.5v3.2H9.8" />
            </svg>
        );
    }
    return <span aria-hidden="true">•</span>;
}

function ExternalLinkIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6.2 3.3H3.8a1.5 1.5 0 0 0-1.5 1.5v7.4a1.5 1.5 0 0 0 1.5 1.5h7.4a1.5 1.5 0 0 0 1.5-1.5V9.8" />
            <path d="M9 2.3h4.7V7M13.5 2.5 7.7 8.3" />
        </svg>
    );
}

function latestSuccessfulCheck(snapshot: UpdateSnapshot): number | null {
    const values = [
        snapshot.questUIHealth.lastSuccessfulCheckAt,
        snapshot.orionHealth.lastSuccessfulCheckAt
    ].filter((value): value is number => Number.isFinite(value));
    return values.length > 0 ? Math.max(...values) : null;
}

function formatReleaseDate(value: string | null | undefined): string {
    if (!value) return "Release date unavailable";
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return "Release date unavailable";
    return `Released ${new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    })}`;
}

function openQuestUIPluginSettings(): void {
    const plugin = plugins.QuestUI;
    if (!plugin) return;
    openPluginModal(plugin);
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
    state,
    pending,
    updateResult,
    canNativeUpdate,
    awaitingDecision,
    onUpdate,
    onSnooze,
    onSkip
}: {
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

function conciseProductState(state: PluginUpdateState, healthError: string | null): string {
    if (healthError || state.kind === "error") return "Check failed";
    if (state.kind === "available") {
        if (state.suppression === "skipped") return "Skipped";
        if (state.suppression === "snoozed") return "Snoozed";
        return "Update available";
    }
    if (state.kind === "up-to-date") return "Up to date";
    if (state.kind === "disabled") return "Checks disabled";
    if (state.kind === "custom-version") return "Custom version";
    if (state.kind === "not-installed") return "Not installed";
    if (state.kind === "idle") return "Not checked";
    return "Unknown";
}

function UpdateCenterPanel({ snapshot }: { snapshot: UpdateSnapshot; }) {
    const states: Array<[UpdateProduct, PluginUpdateState]> = [
        ["questui", snapshot.questUI],
        ["orion", snapshot.orion]
    ];
    const visibleCount = states.filter(([, state]) => visibleUpdate(state)).length;
    const hasError = states.some(([product, state]) =>
        healthForProduct(snapshot, product).error != null || state.kind === "error"
    );
    const availabilityCopy = combinedAvailabilityCopy(snapshot);
    const lastCheckAt = latestSuccessfulCheck(snapshot);
    const bannerTone = snapshot.checking
        ? "is-checking"
        : visibleCount > 0
            ? "has-update"
            : hasError
                ? "has-error"
                : "is-current";
    const bannerIconKind = snapshot.checking
        ? "checking"
        : visibleCount > 0
            ? "available"
            : hasError
                ? "error"
                : "current";
    const bannerDetail = snapshot.checking
        ? "Checking QuestUI and OrionQuest release feeds."
        : visibleCount > 0
            ? availabilityCopy
            : hasError
                ? "QuestUI or OrionQuest update checks need attention."
                : "OrionQuest and QuestUI are up to dated.";

    return (
        <div className="quest-ui-update-panel quest-ui-update-panel-v16" role="group" aria-label="Plugin updates">
            <header className="quest-ui-update-panel-heading">
                <div className="quest-ui-update-panel-title-block">
                    <div className="quest-ui-update-panel-title">
                        <span className="quest-ui-update-panel-title-icon"><UpdateCenterIcon /></span>
                        <strong>Update Center</strong>
                    </div>
                    <span className="quest-ui-update-panel-settings-hint">
                        You can also update plugins from{" "}
                        <button type="button" onClick={openQuestUIPluginSettings}>QuestUI settings</button>.
                    </span>
                </div>
                <div className="quest-ui-update-panel-heading-actions">
                    <button
                        type="button"
                        className="quest-ui-update-check-button"
                        disabled={snapshot.checking}
                        onClick={() => { void checkForUpdates(true); }}
                    >
                        {snapshot.checking ? "Checking…" : "Check now"}
                    </button>
                    <span className="quest-ui-update-panel-last-check">
                        Last check · {formatCompactTimestamp(lastCheckAt)}
                    </span>
                </div>
            </header>

            <div className={`quest-ui-update-banner ${bannerTone}`}>
                <span className="quest-ui-update-banner-mark" aria-hidden="true">
                    <UpdateStateIcon kind={bannerIconKind} />
                </span>
                <div>
                    <strong>
                        {snapshot.checking
                            ? "Checking releases…"
                            : visibleCount > 0
                                ? `${visibleCount} ${visibleCount === 1 ? "update is" : "updates are"} available`
                                : hasError
                                    ? "Update check needs attention"
                                    : "You are up to date"}
                    </strong>
                    <span>{bannerDetail}</span>
                </div>
            </div>

            <div className="quest-ui-update-product-list">
                {states.map(([product, state]) => {
                    const health = healthForProduct(snapshot, product);
                    if (product === "orion" && state.kind === "not-installed") return null;

                    const tone = updateProductTone(state, health);
                    const healthError = health.error ?? (state.kind === "error" ? state.message : null);
                    const installedRelease = getInstalledRelease(product);
                    const releaseDateCopy = formatReleaseDate(installedRelease?.publishedAt);
                    const target = state.kind === "available" ? state.release.tagName : null;
                    const stateIconKind = healthError || state.kind === "error"
                        ? "error"
                        : state.kind === "available"
                            ? "available"
                            : state.kind === "up-to-date"
                                ? "current"
                                : "muted";

                    return (
                        <div className={`quest-ui-update-product-entry is-${tone}`} key={product}>
                            <div className="quest-ui-update-product-row">
                                <div className="quest-ui-update-product-identity">
                                    <div>
                                        <strong>{productLabel(product)}</strong>
                                        <span className={`quest-ui-update-row-version${target ? " is-old-version" : ""}`}>
                                            {state.installed ?? "-"}
                                        </span>
                                        {target && (
                                            <>
                                                <span className="quest-ui-update-row-arrow" aria-hidden="true">→</span>
                                                <span className="quest-ui-update-row-target">{target}</span>
                                            </>
                                        )}
                                    </div>
                                    <span
                                        className="quest-ui-update-product-release-date"
                                        title={installedRelease?.publishedAt ?? undefined}
                                    >
                                        {releaseDateCopy}
                                    </span>
                                </div>

                                <div className="quest-ui-update-product-row-meta">
                                    <strong>
                                        <span className="quest-ui-update-row-state-mark" aria-hidden="true">
                                            <UpdateStateIcon kind={stateIconKind} />
                                        </span>
                                        {conciseProductState(state, healthError)}
                                    </strong>
                                    {healthError && <span>{healthError}</span>}
                                    {state.kind === "available" && (
                                        <button
                                            type="button"
                                            className="quest-ui-update-release-link"
                                            onClick={() => safeOpenRelease(product, state.release)}
                                        >
                                            <span>View release note</span>
                                            <ExternalLinkIcon />
                                        </button>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    className="quest-ui-update-github-button"
                                    onClick={() => openUpdateRepository(product)}
                                    aria-label={`Open ${productLabel(product)} on GitHub`}
                                    title={`Open ${productLabel(product)} on GitHub`}
                                >
                                    <GitHubIcon />
                                </button>
                            </div>

                            {availableUpdate(state) && (
                                <div className="quest-ui-update-product-expanded">
                                    <UpdateReleaseCard product={product} state={state} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {!snapshot.automaticChecksEnabled && (
                <div className="quest-ui-update-manual-warning">
                    AutoUpdater is off · check updates manually
                </div>
            )}

            <footer className="quest-ui-update-support-footer">
                <span>Enjoying QuestUI?</span>
                <button
                    type="button"
                    onClick={() => openUpdateRepository("questui")}
                    aria-label="Star QuestUI on GitHub"
                    title="Open QuestUI on GitHub"
                >
                    Give us a star on GitHub
                    <ExternalLinkIcon />
                </button>
                <span>to support the project.</span>
            </footer>
        </div>
    );
}

export function UpdateCenterIndicator() {
    const snapshot = useUpdateSnapshot();
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const count = Number(visibleUpdate(snapshot.questUI)) + Number(visibleUpdate(snapshot.orion));
    const updateNoticeSignature = [
        visibleReleaseVersion(snapshot.questUI),
        visibleReleaseVersion(snapshot.orion)
    ].filter((value): value is string => value != null).join("|");

    useEffect(() => {
        if (!updateNoticeSignature) {
            lastDashboardUpdateNoticeSignature = "";
            return;
        }
        if (lastDashboardUpdateNoticeSignature === updateNoticeSignature) return;
        lastDashboardUpdateNoticeSignature = updateNoticeSignature;
        pushDashboardNotice({
            tone: "info",
            text: "Update ready",
            duration: 2400
        });
    }, [updateNoticeSignature]);
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

export function DashboardProductUpdateNotice({ product }: { product: UpdateProduct; }) {
    const snapshot = useUpdateSnapshot();
    const state = product === "questui" ? snapshot.questUI : snapshot.orion;
    const health = healthForProduct(snapshot, product);
    const target = visibleReleaseVersion(state);

    // Orion's integration status already owns the "not installed" state in the
    // Dashboard strip. Avoid rendering the same semantic state twice.
    if (product === "orion" && state.kind === "not-installed") return null;

    let tone = "muted";
    let mark = "•";
    let copy = "Not checked yet";

    if (snapshot.checking) {
        tone = "checking";
        copy = "Checking updates…";
    } else if (target) {
        tone = "available";
        mark = "↑";
        copy = `${target} available`;
    } else if (health.error || state.kind === "error") {
        tone = "error";
        mark = "!";
        copy = "Update check failed";
    } else if (state.kind === "up-to-date") {
        tone = "current";
        mark = "✓";
        copy = "You are up to date";
    } else if (state.kind === "disabled") {
        copy = "Updates disabled";
    } else if (state.kind === "custom-version") {
        tone = "warning";
        copy = "Custom version";
    } else if (state.kind === "not-installed") {
        copy = "Not installed";
    }

    return (
        <span className={`quest-ui-product-update-chip is-${tone}`} title={copy}>
            <span className="quest-ui-product-update-mark" aria-hidden="true">{mark}</span>
            <span>{copy}</span>
        </span>
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


