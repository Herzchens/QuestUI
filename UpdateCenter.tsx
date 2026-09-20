import type { PluginNative } from "@utils/types";
import { relaunch } from "@utils/native";
import { Popout, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";

import type { QuestUIUpdateResult } from "./updateNative";
import {
    checkForUpdates,
    getUpdateSnapshot,
    skipUpdate,
    snoozeUpdate,
    subscribeUpdateState,
    type PluginUpdateState,
    type UpdateProduct,
    type UpdateRelease,
    type UpdateSnapshot
} from "./updates";

import "./updateCenter.css";

interface ManagedReleaseUpdateResult {
    ok: boolean;
    status: string;
    message: string;
    restartRequired?: boolean;
}

type OrionNativeUpdater = {
    updateOrionRelease?: (
        installedVersion: string,
        targetVersion: string
    ) => Promise<ManagedReleaseUpdateResult> | ManagedReleaseUpdateResult;
};

const Native = !IS_WEB
    ? VencordNative.pluginHelpers.QuestUI as PluginNative<typeof import("./native")>
    : null;

const RELEASE_URL_PREFIXES: Record<UpdateProduct, string> = {
    questui: "https://github.com/Herzchens/QuestUI/releases/",
    orion: "https://github.com/nyxxbit/discord-quest-completer/releases/"
};

function orionNativeUpdater(): OrionNativeUpdater | null {
    if (IS_WEB) return null;
    try {
        const helpers = VencordNative.pluginHelpers as unknown as Record<string, unknown>;
        const candidate = helpers?.OrionQuests;
        return candidate && typeof candidate === "object" ? candidate as OrionNativeUpdater : null;
    } catch {
        return null;
    }
}

function useUpdateSnapshot(): UpdateSnapshot {
    const [, setRevision] = useState(0);
    useEffect(() => subscribeUpdateState(() => setRevision(value => value + 1)), []);
    return getUpdateSnapshot();
}

function productLabel(product: UpdateProduct): string {
    return product === "questui" ? "QuestUI" : "OrionQuests";
}

function visibleUpdate(state: PluginUpdateState): boolean {
    return state.kind === "available" && state.suppression === null;
}

function availableUpdate(state: PluginUpdateState): state is Extract<PluginUpdateState, { kind: "available"; }> {
    return state.kind === "available";
}

function safeOpenRelease(product: UpdateProduct, release: UpdateRelease): void {
    if (!release.htmlUrl.startsWith(RELEASE_URL_PREFIXES[product])) return;
    if (IS_WEB) {
        window.open(release.htmlUrl, "_blank", "noopener,noreferrer");
        return;
    }
    VencordNative.native.openExternal(release.htmlUrl);
}

function formatTimestamp(timestamp: number | null): string {
    if (!Number.isFinite(timestamp)) return "Never";
    try {
        return new Date(Number(timestamp)).toLocaleString();
    } catch {
        return "Unknown";
    }
}

function formatCompactTimestamp(timestamp: number | null): string {
    if (!Number.isFinite(timestamp)) return "Never";
    try {
        return new Date(Number(timestamp)).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    } catch {
        return "Unknown";
    }
}

function stateCopy(product: UpdateProduct, state: PluginUpdateState): string {
    if (state.kind === "not-installed") return "Not installed";
    if (state.kind === "disabled") return "Update checks disabled";
    if (state.kind === "idle") return state.installed ? `Installed ${state.installed}` : "Waiting for first check";
    if (state.kind === "custom-version") return state.installed
        ? `Custom version ${state.installed}; automatic version comparison is disabled.`
        : "Installed version is unavailable.";
    if (state.kind === "up-to-date") return `${state.installed} is up to date.`;
    if (state.kind === "error") return state.message;
    if (state.suppression === "skipped") return `${state.release.tagName} is available, but this version is skipped.`;
    if (state.suppression === "snoozed") return `${state.release.tagName} is available; reminder snoozed until ${formatTimestamp(state.snoozeUntil)}.`;
    return `${state.installed} → ${state.release.tagName}`;
}

type UpdateVisualTone = "current" | "available" | "warning" | "error" | "muted";

function stateTone(state: PluginUpdateState): UpdateVisualTone {
    if (state.kind === "up-to-date") return "current";
    if (state.kind === "available" && state.suppression === null) return "available";
    if (state.kind === "error") return "error";
    if (state.kind === "custom-version" || (state.kind === "available" && state.suppression !== null)) return "warning";
    return "muted";
}

function stateMark(state: PluginUpdateState): string {
    if (state.kind === "up-to-date") return "✓";
    if (state.kind === "available" && state.suppression === null) return "↑";
    if (state.kind === "error") return "!";
    if (state.kind === "custom-version") return "•";
    if (state.kind === "disabled") return "–";
    return "•";
}

function installedVersion(state: PluginUpdateState): string {
    return state.installed ?? "—";
}

function targetVersion(state: PluginUpdateState): string | null {
    return state.kind === "available" ? state.release.tagName : null;
}

function UpdateProductStatus({ product, state, compact = false }: {
    product: UpdateProduct;
    state: PluginUpdateState;
    compact?: boolean;
}) {
    const tone = stateTone(state);
    const target = targetVersion(state);
    const available = state.kind === "available" && state.suppression === null;

    return (
        <div className={`quest-ui-update-product-status is-${tone}${compact ? " is-compact" : ""}`}>
            <span className="quest-ui-update-product-mark" aria-hidden="true">{stateMark(state)}</span>
            <strong>{productLabel(product)}</strong>
            <span className="quest-ui-update-product-version">{installedVersion(state)}</span>
            {target && (
                <>
                    <span className="quest-ui-update-product-arrow" aria-hidden="true">→</span>
                    <span className="quest-ui-update-product-target">{target}</span>
                </>
            )}
            {compact && available && <span className="quest-ui-update-product-new">NEW</span>}
        </div>
    );
}

function toastFailure(message: string): void {
    showToast(message, Toasts.Type.FAILURE);
}

function UpdateCenterIcon() {
    return (
        <svg className="quest-ui-update-center-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 3h2v9.17l2.59-2.58L17 11l-5 5-5-5 1.41-1.41L11 12.17V3Z" />
            <path d="M5 17h2v2h10v-2h2v4H5v-4Z" />
        </svg>
    );
}

function UpdateReleaseCard({ product, state }: {
    product: UpdateProduct;
    state: Extract<PluginUpdateState, { kind: "available"; }>;
}) {
    const [pending, setPending] = useState<"update" | "snooze" | "skip" | null>(null);
    const [updateResult, setUpdateResult] = useState<ManagedReleaseUpdateResult | null>(null);
    const label = productLabel(product);
    const canNativeUpdate = product === "questui"
        ? Native !== null
        : typeof orionNativeUpdater()?.updateOrionRelease === "function";

    const updateRelease = async () => {
        if (!canNativeUpdate || pending) return;
        setPending("update");
        setUpdateResult(null);
        try {
            let result: ManagedReleaseUpdateResult;
            if (product === "questui") {
                if (!Native) return;
                result = await Native.updateQuestUIRelease(state.installed, state.release.tagName) as QuestUIUpdateResult;
            } else {
                const orionNative = orionNativeUpdater();
                if (typeof orionNative?.updateOrionRelease !== "function") {
                    throw new Error("This OrionQuests build does not expose its managed release updater.");
                }
                result = await orionNative.updateOrionRelease(state.installed, state.release.tagName);
            }
            setUpdateResult(result);
            showToast(result.message, result.ok ? Toasts.Type.SUCCESS : Toasts.Type.FAILURE);
        } catch {
            const result: ManagedReleaseUpdateResult = {
                ok: false,
                status: "failed",
                message: `${label} could not invoke its managed release updater.`
            };
            setUpdateResult(result);
            toastFailure(result.message);
        } finally {
            setPending(null);
        }
    };

    const snooze = async () => {
        if (pending) return;
        setPending("snooze");
        try {
            await snoozeUpdate(product, 24);
        } catch {
            toastFailure(`Could not save the ${label} reminder.`);
        } finally {
            setPending(null);
        }
    };

    const skip = async () => {
        if (pending) return;
        setPending("skip");
        try {
            await skipUpdate(product, state.release.tagName);
        } catch {
            toastFailure(`Could not save the skipped ${label} version.`);
        } finally {
            setPending(null);
        }
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
            {product === "orion" && !canNativeUpdate && (
                <span className="quest-ui-update-suppressed-copy">One-click update is not exposed by this OrionQuests build. Use View release.</span>
            )}
            {updateResult && (
                <span className={`quest-ui-update-result${updateResult.ok ? " is-success" : " is-error"}`}>
                    {updateResult.message}
                </span>
            )}

            <div className="quest-ui-update-card-actions">
                {canNativeUpdate && !updateResult?.restartRequired && (
                    <button type="button" disabled={pending !== null} onClick={updateRelease}>
                        {pending === "update" ? "Updating…" : "Update now"}
                    </button>
                )}
                {updateResult?.ok && updateResult.restartRequired && (
                    <button type="button" className="quest-ui-update-restart" onClick={relaunch}>Restart Discord</button>
                )}
                <button type="button" onClick={() => safeOpenRelease(product, state.release)}>View release</button>
                <button type="button" disabled={pending !== null} onClick={snooze}>{pending === "snooze" ? "Saving…" : "Remind me later"}</button>
                <button type="button" disabled={pending !== null} onClick={skip}>{pending === "skip" ? "Saving…" : `Skip ${state.release.tagName}`}</button>
            </div>
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
    const hasError = states.some(([, state]) => state.kind === "error");

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
                        {snapshot.checking
                            ? "Checking releases…"
                            : visibleCount > 0
                                ? `${visibleCount} ${visibleCount === 1 ? "update" : "updates"} available`
                                : hasError
                                    ? "Some checks need attention"
                                    : "Everything is current"}
                    </strong>
                    <span>
                        {snapshot.checking
                            ? "Comparing installed versions with the configured release channels."
                            : visibleCount > 0
                                ? "Review the new version below or update directly when supported."
                                : hasError
                                    ? "The last successful versions remain shown below."
                                    : `Last checked ${formatCompactTimestamp(snapshot.lastSuccessfulCheckAt)}`}
                    </span>
                </div>
            </div>

            <div className="quest-ui-update-status-grid">
                {states.map(([product, state]) => (
                    <div className={`quest-ui-update-status-row is-${stateTone(state)}`} key={product}>
                        <UpdateProductStatus product={product} state={state} />
                        <span className="quest-ui-update-status-copy">{stateCopy(product, state)}</span>
                    </div>
                ))}
            </div>

            {available.length > 0 && (
                <div className="quest-ui-update-list">
                    {available.map(([product, state]) => <UpdateReleaseCard key={product} product={product} state={state} />)}
                </div>
            )}

            <span className="quest-ui-update-last-check">
                Last successful check · {formatTimestamp(snapshot.lastSuccessfulCheckAt)}
            </span>
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
    const updates: Array<[UpdateProduct, Extract<PluginUpdateState, { kind: "available"; }>]> = [];

    if (visibleUpdate(snapshot.questUI) && snapshot.questUI.kind === "available") {
        updates.push(["questui", snapshot.questUI]);
    }
    if (visibleUpdate(snapshot.orion) && snapshot.orion.kind === "available") {
        updates.push(["orion", snapshot.orion]);
    }

    const allCurrent = snapshot.questUI.kind === "up-to-date"
        && (
            snapshot.orion.kind === "up-to-date"
            || snapshot.orion.kind === "not-installed"
            || snapshot.orion.kind === "disabled"
        );

    if (updates.length === 0 && !snapshot.checking && !allCurrent) return null;

    return (
        <div className="quest-ui-dashboard-update-slot" aria-label="Update status">
            {snapshot.checking && updates.length === 0 ? (
                <span className="quest-ui-dashboard-update-chip is-checking">
                    <span className="quest-ui-dashboard-update-chip-dot" aria-hidden="true" />
                    Checking updates…
                </span>
            ) : updates.length > 0 ? updates.map(([product, state]) => (
                <span className="quest-ui-dashboard-update-chip has-update" key={product}>
                    <span className="quest-ui-dashboard-update-chip-dot" aria-hidden="true" />
                    <strong>{product === "questui" ? "QuestUI" : "Orion"}</strong>
                    <span>{state.release.tagName}</span>
                </span>
            )) : (
                <span className="quest-ui-dashboard-update-chip is-current">
                    <span className="quest-ui-dashboard-update-chip-check" aria-hidden="true">✓</span>
                    <strong>Up to date</strong>
                </span>
            )}
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
    const headline = activeCount > 0
        ? `${activeCount} ${activeCount === 1 ? "update" : "updates"} available`
        : snapshot.checking
            ? "Checking releases…"
            : `Checked ${formatCompactTimestamp(snapshot.lastSuccessfulCheckAt)}`;

    return (
        <div className={`quest-ui-update-settings-control${activeCount > 0 ? " has-update" : ""}`}>
            <div className="quest-ui-update-settings-summary">
                <div className="quest-ui-update-settings-headline">
                    <strong>Update status</strong>
                    <span>{headline}</span>
                </div>
                <div className="quest-ui-update-settings-products">
                    <UpdateProductStatus product="questui" state={snapshot.questUI} compact />
                    {snapshot.orion.kind !== "not-installed" && (
                        <UpdateProductStatus product="orion" state={snapshot.orion} compact />
                    )}
                </div>
            </div>
            <button type="button" disabled={manualPending || snapshot.checking} onClick={check}>
                {manualPending || snapshot.checking ? "Checking…" : "Check"}
            </button>
        </div>
    );
}
