import { execFile as execFileCallback } from "child_process";
import { createHash } from "crypto";
import { lstat, readFile, readlink, readdir, stat } from "fs/promises";
import { join } from "path";
import { promisify } from "util";

import { compareSemver, parseSemver } from "./updateLogic";

export type OrionUpdateStatus =
    | "updated"
    | "kept"
    | "decision-required"
    | "decision-stale"
    | "busy"
    | "unsupported-install"
    | "wrong-origin"
    | "dirty"
    | "custom-checkout"
    | "source-mismatch"
    | "invalid-version"
    | "target-mismatch"
    | "build-failed"
    | "rollback-failed"
    | "failed";

export type OrionUpdatePhase =
    | "preflight"
    | "fetch"
    | "validate-target"
    | "decision"
    | "checkout"
    | "build"
    | "rollback";

export interface OrionUpdateDecisionRequest {
    action: "keep" | "discard";
    token: string;
}

export interface OrionUpdateDecisionContext {
    token: string;
    summary: string;
    changes: readonly string[];
    localCommitCount: number;
}

export interface OrionUpdateResult {
    ok: boolean;
    status: OrionUpdateStatus;
    message: string;
    fromVersion?: string;
    toVersion?: string;
    fromCommit?: string;
    toCommit?: string;
    restartRequired?: boolean;
    phase?: OrionUpdatePhase;
    diagnostic?: string;
    method?: string;
    trace?: readonly string[];
    decision?: OrionUpdateDecisionContext;
}

export interface OrionUpdateEngineConfig {
    userpluginsDir: string;
    vencordSrcDir: string;
    officialRepo: string;
    buildVencord(): Promise<void>;
    buildCommand?: string;
    now?: () => number;
    randomSuffix?: () => string;
}

interface PendingDecision {
    checkout: string;
    runningVersion: string;
    targetVersion: string;
    currentHead: string;
    targetCommit: string;
    remoteMain: string;
    fingerprint: string;
    summary: string;
    changes: readonly string[];
    localCommitCount: number;
    trace: readonly string[];
    createdAt: number;
}

const execFile = promisify(execFileCallback);
const MAX_BUFFER = 16 * 1024 * 1024;
const DECISION_TTL_MS = 10 * 60 * 1000;

export function normalizeOrionUpdaterRepoUrl(value: string): string {
    return value.trim()
        .replace(/\\/g, "/")
        .replace(/^git@github\.com:/i, "https://github.com/")
        .replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/")
        .replace(/\/+$/, "")
        .replace(/\.git$/i, "")
        .toLowerCase();
}

export function normalizeOrionReleaseTag(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const tag = value.trim();
    if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(tag)) return null;
    return parseSemver(tag) ? tag : null;
}

function sourceVersion(source: string): string | null {
    return /export\s+const\s+PLUGIN_VERSION\s*=\s*["']([^"']+)["']/.exec(source)?.[1]?.trim() ?? null;
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

function diagnosticText(error: unknown): string {
    if (!(error instanceof Error)) return String(error).slice(0, 4000);

    const processError = error as Error & { stdout?: unknown; stderr?: unknown; };
    const parts = [
        error.message,
        String(processError.stderr ?? "").trim(),
        String(processError.stdout ?? "").trim()
    ].filter(Boolean);

    return [...new Set(parts)]
        .join(" | ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4000);
}

async function run(
    command: string,
    args: string[],
    cwd: string
): Promise<{ stdout: string; stderr: string; }> {
    const result = await execFile(command, args, {
        cwd,
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8"
    });
    return {
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? "")
    };
}

function splitNul(value: string): string[] {
    return value.split("\0").filter(Boolean);
}

function shortCommit(value: string): string {
    return value.length > 12 ? value.slice(0, 12) : value;
}

export function createOrionUpdateEngine(config: OrionUpdateEngineConfig) {
    const officialRepo = normalizeOrionUpdaterRepoUrl(config.officialRepo);
    const pendingDecisions = new Map<string, PendingDecision>();
    let updateInFlight = false;
    let decisionCounter = 0;

    function now(): number {
        return config.now?.() ?? Date.now();
    }

    function pruneDecisions(): void {
        const cutoff = now() - DECISION_TTL_MS;
        for (const [token, pending] of pendingDecisions) {
            if (pending.createdAt < cutoff) pendingDecisions.delete(token);
        }
    }

    function nextDecisionToken(): string {
        decisionCounter++;
        const suffix = config.randomSuffix?.() ?? Math.random().toString(16).slice(2);
        return now() + "-" + suffix + "-" + decisionCounter;
    }

    async function git(dir: string, ...args: string[]): Promise<{ stdout: string; stderr: string; }> {
        return run("git", args, dir);
    }

    async function gitText(dir: string, ...args: string[]): Promise<string> {
        return (await git(dir, ...args)).stdout.trim();
    }

    async function deleteRef(dir: string, ref: string): Promise<void> {
        try {
            await git(dir, "update-ref", "-d", ref);
        } catch {
            // Best-effort cleanup only. A failed cleanup must not mask the updater result.
        }
    }

    async function currentBranch(dir: string): Promise<string | null> {
        try {
            const branch = await gitText(dir, "symbolic-ref", "--quiet", "--short", "HEAD");
            return branch || null;
        } catch {
            return null;
        }
    }

    async function isAncestor(dir: string, ancestor: string, descendant: string): Promise<boolean> {
        try {
            await git(dir, "merge-base", "--is-ancestor", ancestor, descendant);
            return true;
        } catch {
            return false;
        }
    }

    async function statusRows(dir: string): Promise<string[]> {
        const text = (await git(dir, "status", "--short", "--untracked-files=all")).stdout;
        return text.split(/\r?\n/).map(row => row.trimEnd()).filter(Boolean);
    }

    async function checkoutFingerprint(dir: string): Promise<string> {
        const indexState = (await git(dir, "ls-files", "--stage", "-z")).stdout;
        const tracked = splitNul((await git(dir, "ls-files", "-z")).stdout);
        const untracked = splitNul((await git(dir, "ls-files", "--others", "--exclude-standard", "-z")).stdout);

        const entries = [
            ...tracked.map(path => ({ kind: "T", path })),
            ...untracked.map(path => ({ kind: "U", path }))
        ].sort((left, right) => (left.kind + "\0" + left.path).localeCompare(right.kind + "\0" + right.path));

        const hash = createHash("sha256");
        hash.update("index\0");
        hash.update(indexState, "utf8");

        for (const entry of entries) {
            hash.update("\0" + entry.kind + "\0" + entry.path + "\0", "utf8");
            const full = join(dir, entry.path);
            try {
                const info = await lstat(full);
                if (info.isSymbolicLink()) {
                    hash.update("L\0" + await readlink(full), "utf8");
                } else if (info.isFile()) {
                    hash.update("F\0", "utf8");
                    hash.update(await readFile(full));
                } else if (info.isDirectory()) {
                    hash.update("D", "utf8");
                } else {
                    hash.update("O", "utf8");
                }
            } catch {
                hash.update("MISSING", "utf8");
            }
        }

        return hash.digest("hex");
    }

    async function locateManagedCheckout(): Promise<
        | { checkout: string; blocked: null; }
        | { checkout: null; blocked: OrionUpdateResult; }
    > {
        let names: string[];
        try {
            names = await readdir(config.userpluginsDir);
        } catch {
            return {
                checkout: null,
                blocked: {
                    ok: false,
                    status: "unsupported-install",
                    phase: "preflight",
                    message: "OrionQuests could not locate the Vencord userplugins directory."
                }
            };
        }

        const candidates: string[] = [];
        for (const name of names) {
            const dir = join(config.userpluginsDir, name);
            const entry = join(dir, "index.tsx");
            if (!await exists(entry)) continue;

            let source = "";
            try {
                source = await readFile(entry, "utf8");
            } catch {
                continue;
            }

            if (!/name\s*:\s*["']OrionQuests["']/.test(source) || !sourceVersion(source)) continue;
            candidates.push(dir);
        }

        if (candidates.length !== 1) {
            return {
                checkout: null,
                blocked: {
                    ok: false,
                    status: "unsupported-install",
                    phase: "preflight",
                    message: candidates.length === 0
                        ? "OrionQuests could not find a managed source checkout in this Vencord source tree."
                        : "OrionQuests found multiple source checkouts. Automatic update will not guess which one to modify."
                }
            };
        }

        const checkout = candidates[0];
        if (!await exists(join(checkout, ".git"))) {
            return {
                checkout: null,
                blocked: {
                    ok: false,
                    status: "unsupported-install",
                    phase: "preflight",
                    message: "OrionQuests is installed as copied files rather than a managed Git checkout."
                }
            };
        }

        let origin: string;
        try {
            origin = await gitText(checkout, "remote", "get-url", "origin");
        } catch {
            return {
                checkout: null,
                blocked: {
                    ok: false,
                    status: "wrong-origin",
                    phase: "preflight",
                    message: "OrionQuests checkout has no readable origin remote."
                }
            };
        }

        if (normalizeOrionUpdaterRepoUrl(origin) !== officialRepo) {
            return {
                checkout: null,
                blocked: {
                    ok: false,
                    status: "wrong-origin",
                    phase: "preflight",
                    message: "Automatic OrionQuests updates are disabled because this checkout does not use the official nyxxbit/discord-quest-completer origin."
                }
            };
        }

        return { checkout, blocked: null };
    }

    async function checkoutStillMatches(
        checkout: string,
        expectedHead: string,
        expectedBranch: string,
        requireClean = true
    ): Promise<boolean> {
        const branch = await currentBranch(checkout);
        const head = await gitText(checkout, "rev-parse", "HEAD");
        if (branch !== expectedBranch || head !== expectedHead) return false;
        if (!requireClean) return true;
        return (await statusRows(checkout)).length === 0;
    }

    async function targetBuildWithRollback(
        checkout: string,
        runningVersion: string,
        targetVersion: string,
        currentHead: string,
        targetCommit: string,
        discardedLocalWork: boolean,
        method: string,
        trace: string[]
    ): Promise<OrionUpdateResult> {
        let phase: OrionUpdatePhase = "build";
        const buildCommand = config.buildCommand ?? "Vencord build command";
        trace.push("Build: " + buildCommand);

        try {
            await config.buildVencord();
            trace.push("Build: completed successfully");
        } catch (buildError) {
            const buildDiagnostic = diagnosticText(buildError);
            trace.push("Build: failed");
            phase = "rollback";

            if (!await checkoutStillMatches(checkout, targetCommit, "main")) {
                trace.push("Rollback: refused because the checkout changed after the failed build");
                return {
                    ok: false,
                    status: "rollback-failed",
                    phase,
                    method,
                    trace: [...trace],
                    message: "The " + targetVersion + " build failed, and the OrionQuests checkout changed while the build was running. Automatic rollback refused to overwrite the newer local state.",
                    fromVersion: runningVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead,
                    toCommit: targetCommit,
                    diagnostic: buildDiagnostic
                };
            }

            try {
                trace.push("Rollback: git reset --hard " + shortCommit(currentHead));
                await git(checkout, "reset", "--hard", currentHead);
                trace.push("Rollback build: " + buildCommand);
                await config.buildVencord();
                trace.push("Rollback build: completed successfully");
            } catch (rollbackError) {
                trace.push("Rollback: failed");
                return {
                    ok: false,
                    status: "rollback-failed",
                    phase,
                    method,
                    trace: [...trace],
                    message: "The update build failed and OrionQuests could not fully rebuild the previous checkout."
                        + (discardedLocalWork ? " Uncommitted work that was explicitly discarded cannot be restored." : ""),
                    fromVersion: runningVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead,
                    toCommit: targetCommit,
                    diagnostic: [buildDiagnostic, diagnosticText(rollbackError)].filter(Boolean).join(" | ")
                };
            }

            return {
                ok: false,
                status: "build-failed",
                phase: "build",
                method,
                trace: [...trace],
                message: "The " + targetVersion + " build failed. OrionQuests restored the previous commit and rebuilt it successfully."
                    + (discardedLocalWork ? " Uncommitted work that you explicitly discarded remains discarded." : ""),
                fromVersion: runningVersion,
                toVersion: targetVersion,
                fromCommit: currentHead,
                toCommit: targetCommit,
                diagnostic: buildDiagnostic
            };
        }

        if (!await checkoutStillMatches(checkout, targetCommit, "main")) {
            trace.push("Post-build validation: checkout no longer matches the selected target");
            return {
                ok: false,
                status: "failed",
                phase,
                method,
                trace: [...trace],
                message: "The Vencord build completed, but the OrionQuests checkout changed during the build. No further automatic reset was attempted.",
                fromVersion: runningVersion,
                toVersion: targetVersion,
                fromCommit: currentHead,
                toCommit: targetCommit
            };
        }

        trace.push("Post-build validation: main is clean at " + shortCommit(targetCommit));
        return {
            ok: true,
            status: "updated",
            phase,
            method,
            trace: [...trace],
            message: "OrionQuests updated from " + runningVersion + " to " + targetVersion + ". Restart Discord to load the new build.",
            fromVersion: runningVersion,
            toVersion: targetVersion,
            fromCommit: currentHead,
            toCommit: targetCommit,
            restartRequired: true
        };
    }

    async function validateFetchedTarget(
        checkout: string,
        targetVersion: string,
        tagRef: string,
        currentHead: string,
        runningVersion: string
    ): Promise<{ blocked: OrionUpdateResult | null; targetCommit: string; remoteMain: string; }> {
        const targetCommit = await gitText(checkout, "rev-parse", tagRef + "^{}");
        const targetType = await gitText(checkout, "cat-file", "-t", targetCommit);
        if (targetType !== "commit") {
            return {
                targetCommit,
                remoteMain: "",
                blocked: {
                    ok: false,
                    status: "target-mismatch",
                    phase: "validate-target",
                    message: "The " + targetVersion + " release does not resolve to a Git commit.",
                    fromVersion: runningVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead,
                    toCommit: targetCommit
                }
            };
        }

        const remoteMain = await gitText(checkout, "rev-parse", "refs/remotes/origin/main");
        const targetSource = (await git(checkout, "show", targetCommit + ":index.tsx")).stdout;
        if (sourceVersion(targetSource) !== targetVersion) {
            return {
                targetCommit,
                remoteMain,
                blocked: {
                    ok: false,
                    status: "target-mismatch",
                    phase: "validate-target",
                    message: "The " + targetVersion + " tag does not declare the same OrionQuests plugin version.",
                    fromVersion: runningVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead,
                    toCommit: targetCommit
                }
            };
        }

        if (!await isAncestor(checkout, targetCommit, remoteMain)) {
            return {
                targetCommit,
                remoteMain,
                blocked: {
                    ok: false,
                    status: "target-mismatch",
                    phase: "validate-target",
                    message: "The " + targetVersion + " release is not on OrionQuests' current official main history.",
                    fromVersion: runningVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead,
                    toCommit: targetCommit
                }
            };
        }

        return { blocked: null, targetCommit, remoteMain };
    }

    async function resolvePendingDecision(
        runningVersion: string,
        targetVersion: string,
        request: OrionUpdateDecisionRequest
    ): Promise<OrionUpdateResult> {
        pruneDecisions();
        const pending = pendingDecisions.get(request.token);
        if (!pending
            || pending.runningVersion !== runningVersion
            || pending.targetVersion !== targetVersion) {
            return {
                ok: false,
                status: "decision-stale",
                phase: "decision",
                method: request.action === "discard" ? "discard-reset" : "keep",
                trace: ["Decision: previous local-work snapshot is missing, expired, or no longer matches this update request"],
                message: "That OrionQuests update choice is no longer valid. Run Update now again to inspect the current checkout.",
                fromVersion: runningVersion,
                toVersion: targetVersion
            };
        }

        pendingDecisions.delete(request.token);
        const trace = [...pending.trace];

        if (request.action === "keep") {
            trace.push("Decision: Keep");
            trace.push("Result: local checkout left untouched; update skipped");
            return {
                ok: false,
                status: "kept",
                phase: "decision",
                method: "keep",
                trace,
                message: "Local OrionQuests work was kept. The managed update was skipped.",
                fromVersion: runningVersion,
                toVersion: targetVersion,
                fromCommit: pending.currentHead,
                toCommit: pending.targetCommit
            };
        }

        trace.push("Decision: Discard & update");
        trace.push("Revalidation: locating the same official main checkout");

        const located = await locateManagedCheckout();
        if (located.blocked) {
            trace.push("Revalidation: failed before any destructive command");
            return { ...located.blocked, method: "discard-reset", trace };
        }
        const checkout = located.checkout;

        if (checkout !== pending.checkout || await currentBranch(checkout) !== "main") {
            trace.push("Revalidation: checkout path or branch changed; destructive action cancelled");
            return {
                ok: false,
                status: "decision-stale",
                phase: "decision",
                method: "discard-reset",
                trace,
                message: "OrionQuests checkout changed while the discard choice was pending. Nothing was reset.",
                fromVersion: runningVersion,
                toVersion: targetVersion
            };
        }

        const decisionHead = await gitText(checkout, "rev-parse", "HEAD");
        let decisionRemoteMain = "";
        try {
            decisionRemoteMain = await gitText(checkout, "rev-parse", "--verify", "refs/remotes/origin/main");
        } catch {
            // Missing/moved tracking state invalidates the old consent below.
        }
        const decisionFingerprint = await checkoutFingerprint(checkout);

        if (decisionHead !== pending.currentHead
            || decisionRemoteMain !== pending.remoteMain
            || decisionFingerprint !== pending.fingerprint) {
            trace.push("Revalidation: HEAD, upstream, or content fingerprint changed; destructive action cancelled");
            return {
                ok: false,
                status: "decision-stale",
                phase: "decision",
                method: "discard-reset",
                trace,
                message: "OrionQuests changed while the discard choice was pending. Local work was kept; run Update now again to review the new state.",
                fromVersion: runningVersion,
                toVersion: targetVersion,
                fromCommit: decisionHead,
                toCommit: pending.targetCommit
            };
        }

        trace.push("Revalidation: HEAD, fetched upstream and content fingerprint still match the approved snapshot");

        let tagRef: string | null = null;
        try {
            const suffix = config.randomSuffix?.() ?? Math.random().toString(16).slice(2);
            tagRef = "refs/orion-update/tag-decision-" + now() + "-" + suffix;
            trace.push("Fetch: git fetch --atomic --force --no-tags origin refs/tags/" + targetVersion + ":<temporary-ref> +refs/heads/main:refs/remotes/origin/main");
            await git(
                checkout,
                "fetch", "--atomic", "--force", "--no-tags", "origin",
                "refs/tags/" + targetVersion + ":" + tagRef,
                "+refs/heads/main:refs/remotes/origin/main"
            );

            const validated = await validateFetchedTarget(
                checkout,
                targetVersion,
                tagRef,
                pending.currentHead,
                runningVersion
            );
            if (validated.blocked) {
                trace.push("Target validation: failed after refresh; nothing was reset");
                return { ...validated.blocked, method: "discard-reset", trace };
            }

            trace.push("Target validation: " + targetVersion + " -> " + shortCommit(validated.targetCommit) + " on current official main");

            if (validated.targetCommit !== pending.targetCommit || validated.remoteMain !== pending.remoteMain) {
                trace.push("Revalidation: upstream or target changed after confirmation; destructive action cancelled");
                return {
                    ok: false,
                    status: "decision-stale",
                    phase: "decision",
                    method: "discard-reset",
                    trace,
                    message: "OrionQuests upstream changed while the discard choice was pending. Nothing was reset; run Update now again to review the new target.",
                    fromVersion: runningVersion,
                    toVersion: targetVersion,
                    fromCommit: pending.currentHead,
                    toCommit: validated.targetCommit
                };
            }

            if (await currentBranch(checkout) !== "main"
                || await gitText(checkout, "rev-parse", "HEAD") !== pending.currentHead
                || await checkoutFingerprint(checkout) !== pending.fingerprint) {
                trace.push("Final revalidation: local checkout changed; destructive action cancelled");
                return {
                    ok: false,
                    status: "decision-stale",
                    phase: "decision",
                    method: "discard-reset",
                    trace,
                    message: "OrionQuests changed during final discard validation. Nothing was reset.",
                    fromVersion: runningVersion,
                    toVersion: targetVersion,
                    fromCommit: pending.currentHead,
                    toCommit: pending.targetCommit
                };
            }

            trace.push("Checkout: git reset --hard " + shortCommit(pending.targetCommit));
            await git(checkout, "reset", "--hard", pending.targetCommit);
            trace.push("Cleanup: git clean -fd");
            await git(checkout, "clean", "-fd");

            if (!await checkoutStillMatches(checkout, pending.targetCommit, "main")) {
                trace.push("Checkout validation: target was not reached cleanly after discard");
                return {
                    ok: false,
                    status: "failed",
                    phase: "checkout",
                    method: "discard-reset",
                    trace,
                    message: "Discard was confirmed, but OrionQuests could not make the checkout clean at the selected release.",
                    fromVersion: runningVersion,
                    toVersion: targetVersion,
                    fromCommit: pending.currentHead,
                    toCommit: pending.targetCommit
                };
            }

            trace.push("Checkout validation: main is clean at " + shortCommit(pending.targetCommit));
            return await targetBuildWithRollback(
                checkout,
                runningVersion,
                targetVersion,
                pending.currentHead,
                pending.targetCommit,
                true,
                "discard-reset",
                trace
            );
        } finally {
            if (tagRef) await deleteRef(checkout, tagRef);
        }
    }

    async function updateRelease(
        runningVersionInput: string,
        targetVersionInput: string,
        decision?: OrionUpdateDecisionRequest
    ): Promise<OrionUpdateResult> {
        if (updateInFlight) {
            return {
                ok: false,
                status: "busy",
                phase: "preflight",
                method: "none",
                trace: ["Preflight: another OrionQuests managed update is already running"],
                message: "An OrionQuests update is already running."
            };
        }

        const runningVersion = normalizeOrionReleaseTag(runningVersionInput);
        const targetVersion = normalizeOrionReleaseTag(targetVersionInput);
        if (!runningVersion
            || !targetVersion
            || (compareSemver(targetVersion, runningVersion) ?? 0) <= 0) {
            return {
                ok: false,
                status: "invalid-version",
                phase: "preflight",
                method: "none",
                trace: ["Preflight: rejected invalid or non-upgrade release request"],
                message: "OrionQuests refused an invalid or non-upgrade release target."
            };
        }

        updateInFlight = true;
        let checkout: string | null = null;
        let tagRef: string | null = null;
        let phase: OrionUpdatePhase = decision ? "decision" : "preflight";
        const trace: string[] = [];

        try {
            if (decision) return await resolvePendingDecision(runningVersion, targetVersion, decision);

            pruneDecisions();
            trace.push("Preflight: requested " + runningVersion + " -> " + targetVersion);

            if (!await exists(join(config.vencordSrcDir, "package.json"))
                || !await exists(join(config.vencordSrcDir, "scripts", "build", "build.mjs"))) {
                trace.push("Preflight: Vencord source/build entry point is unavailable");
                return {
                    ok: false,
                    status: "unsupported-install",
                    phase,
                    method: "none",
                    trace,
                    message: "OrionQuests could not locate the Vencord source tree required for a managed rebuild."
                };
            }
            trace.push("Preflight: Vencord source tree and build entry point found");

            const located = await locateManagedCheckout();
            if (located.blocked) {
                trace.push("Preflight: " + located.blocked.message);
                return { ...located.blocked, method: "none", trace };
            }
            checkout = located.checkout;
            trace.push("Preflight: found exactly one managed OrionQuests Git checkout with the official origin");

            const branch = await currentBranch(checkout);
            if (branch !== "main") {
                trace.push("Preflight: checkout is not on main");
                return {
                    ok: false,
                    status: "custom-checkout",
                    phase,
                    method: "none",
                    trace,
                    message: "Automatic OrionQuests updates require the official main branch. Detached or custom branches are left untouched."
                };
            }
            trace.push("Preflight: branch main confirmed");

            const checkoutSource = await readFile(join(checkout, "index.tsx"), "utf8");
            const checkoutVersion = sourceVersion(checkoutSource);
            if (checkoutVersion !== runningVersion) {
                trace.push("Preflight: loaded/source version mismatch (" + runningVersion + " vs " + (checkoutVersion ?? "unknown") + ")");
                return {
                    ok: false,
                    status: "source-mismatch",
                    phase,
                    method: "none",
                    trace,
                    message: "The loaded OrionQuests version is " + runningVersion
                        + ", but its source checkout reports " + (checkoutVersion ?? "an unknown version")
                        + ". Restart or repair Orion before updating.",
                    fromVersion: runningVersion,
                    toVersion: targetVersion
                };
            }
            trace.push("Preflight: source version matches loaded version " + runningVersion);

            const currentHead = await gitText(checkout, "rev-parse", "HEAD");
            const changesBeforeFetch = await statusRows(checkout);
            trace.push("Preflight: current HEAD " + shortCommit(currentHead)
                + (changesBeforeFetch.length > 0 ? "; local work present" : "; worktree clean"));

            let previousRemoteMain: string | null = null;
            try {
                previousRemoteMain = await gitText(checkout, "rev-parse", "--verify", "refs/remotes/origin/main");
                trace.push("Preflight: cached origin/main " + shortCommit(previousRemoteMain));
            } catch {
                trace.push("Preflight: cached origin/main is missing; fetched ancestry will be authoritative");
            }

            phase = "fetch";
            const suffix = config.randomSuffix?.() ?? Math.random().toString(16).slice(2);
            tagRef = "refs/orion-update/tag-" + now() + "-" + suffix;
            trace.push("Fetch: git fetch --atomic --force --no-tags origin refs/tags/" + targetVersion + ":<temporary-ref> +refs/heads/main:refs/remotes/origin/main");

            await git(
                checkout,
                "fetch", "--atomic", "--force", "--no-tags", "origin",
                "refs/tags/" + targetVersion + ":" + tagRef,
                "+refs/heads/main:refs/remotes/origin/main"
            );
            trace.push("Fetch: release tag and origin/main refreshed atomically");

            phase = "validate-target";
            if (await currentBranch(checkout) !== "main"
                || await gitText(checkout, "rev-parse", "HEAD") !== currentHead) {
                trace.push("Validate target: local checkout changed during fetch; update cancelled");
                return {
                    ok: false,
                    status: "failed",
                    phase,
                    method: "none",
                    trace,
                    message: "OrionQuests checkout changed while release metadata was being fetched. Nothing was reset.",
                    fromVersion: runningVersion,
                    toVersion: targetVersion
                };
            }

            const validated = await validateFetchedTarget(
                checkout,
                targetVersion,
                tagRef,
                currentHead,
                runningVersion
            );
            if (validated.blocked) {
                trace.push("Validate target: " + validated.blocked.message);
                return { ...validated.blocked, method: "none", trace };
            }

            const targetCommit = validated.targetCommit;
            const remoteMain = validated.remoteMain;
            trace.push("Validate target: " + targetVersion + " -> " + shortCommit(targetCommit));
            trace.push("Validate target: selected release is on current official main " + shortCommit(remoteMain));

            const changes = await statusRows(checkout);
            const currentReachesTarget = await isAncestor(checkout, currentHead, targetCommit);

            if (changes.length === 0 && currentReachesTarget) {
                trace.push("Strategy: clean linear history -> fast-forward");
                if (!await checkoutStillMatches(checkout, currentHead, "main")) {
                    trace.push("Checkout guard: checkout changed before fast-forward");
                    return {
                        ok: false,
                        status: "dirty",
                        phase,
                        method: "fast-forward",
                        trace,
                        message: "OrionQuests checkout changed during update preflight. Nothing was overwritten.",
                        fromVersion: runningVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetCommit
                    };
                }

                phase = "checkout";
                trace.push("Checkout: git merge --ff-only --quiet " + shortCommit(targetCommit));
                try {
                    await git(checkout, "merge", "--ff-only", "--quiet", targetCommit);
                } catch (mergeError) {
                    trace.push("Checkout: fast-forward failed; no force-reset attempted");
                    return {
                        ok: false,
                        status: "failed",
                        phase,
                        method: "fast-forward",
                        trace,
                        message: "OrionQuests could not fast-forward the clean checkout to " + targetVersion + ". Nothing was force-reset.",
                        fromVersion: runningVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetCommit,
                        diagnostic: diagnosticText(mergeError)
                    };
                }

                const mergeHead = await gitText(checkout, "rev-parse", "HEAD");
                if (mergeHead !== targetCommit || (await statusRows(checkout)).length !== 0) {
                    trace.push("Checkout validation: fast-forward ended in an unexpected state");
                    return {
                        ok: false,
                        status: "failed",
                        phase,
                        method: "fast-forward",
                        trace,
                        message: "The OrionQuests fast-forward ended in an unexpected checkout state. No further reset was attempted.",
                        fromVersion: runningVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetCommit
                    };
                }

                trace.push("Checkout validation: fast-forward reached " + shortCommit(targetCommit) + " cleanly");
                return await targetBuildWithRollback(
                    checkout,
                    runningVersion,
                    targetVersion,
                    currentHead,
                    targetCommit,
                    false,
                    "fast-forward",
                    trace
                );
            }

            const rewriteSafe = previousRemoteMain != null
                && currentHead === previousRemoteMain
                && changesBeforeFetch.length === 0
                && changes.length === 0
                && remoteMain !== previousRemoteMain;

            if (rewriteSafe) {
                trace.push("Strategy: clean upstream history rewrite detected; evaluating guarded reset recovery");
                const preResetBranch = await currentBranch(checkout);
                const preResetHead = await gitText(checkout, "rev-parse", "HEAD");
                const preResetChanges = await statusRows(checkout);
                let preResetRemoteMain = "";
                try {
                    preResetRemoteMain = await gitText(checkout, "rev-parse", "--verify", "refs/remotes/origin/main");
                } catch {
                    // Missing tracking state invalidates the rewrite-recovery proof below.
                }

                if (preResetBranch === "main"
                    && preResetHead === currentHead
                    && preResetChanges.length === 0
                    && preResetRemoteMain === remoteMain) {
                    phase = "checkout";
                    trace.push("Rewrite recovery proof: branch, HEAD, cleanliness and fetched upstream revalidated");
                    trace.push("Checkout: git reset --hard " + shortCommit(targetCommit));
                    await git(checkout, "reset", "--hard", targetCommit);

                    if (!await checkoutStillMatches(checkout, targetCommit, "main")) {
                        trace.push("Checkout validation: rewrite recovery did not reach the target cleanly");
                        return {
                            ok: false,
                            status: "failed",
                            phase,
                            method: "rewrite-reset",
                            trace,
                            message: "OrionQuests attempted clean upstream-rewrite recovery but did not reach the selected release cleanly.",
                            fromVersion: runningVersion,
                            toVersion: targetVersion,
                            fromCommit: currentHead,
                            toCommit: targetCommit
                        };
                    }

                    trace.push("Checkout validation: rewrite recovery reached " + shortCommit(targetCommit) + " cleanly");
                    return await targetBuildWithRollback(
                        checkout,
                        runningVersion,
                        targetVersion,
                        currentHead,
                        targetCommit,
                        false,
                        "rewrite-reset",
                        trace
                    );
                }

                trace.push("Rewrite recovery proof changed before reset; falling back to an explicit local-work decision");
            }

            let localCommitCount = 0;
            if (previousRemoteMain) {
                try {
                    localCommitCount = Number(await gitText(
                        checkout,
                        "rev-list",
                        "--count",
                        previousRemoteMain + ".." + currentHead
                    )) || 0;
                } catch {
                    localCommitCount = 0;
                }
            }

            const summaryParts: string[] = [];
            if (changes.length > 0) {
                const shown = changes.slice(0, 5).map(row => row.trim());
                summaryParts.push("changes: " + shown.join(", ")
                    + (changes.length > shown.length ? ", +" + (changes.length - shown.length) + " more" : ""));
            }
            if (localCommitCount > 0) summaryParts.push(localCommitCount + " local commit(s)");
            if (summaryParts.length === 0) summaryParts.push("history differs from the selected official release");
            const summary = summaryParts.join("; ");
            const fingerprint = await checkoutFingerprint(checkout);
            const token = nextDecisionToken();

            trace.push("Decision required: " + summary);
            trace.push("Decision snapshot: HEAD/upstream/target plus content-aware tracked/index/untracked fingerprint captured");

            pendingDecisions.set(token, {
                checkout,
                runningVersion,
                targetVersion,
                currentHead,
                targetCommit,
                remoteMain,
                fingerprint,
                summary,
                changes,
                localCommitCount,
                trace: [...trace],
                createdAt: now()
            });

            return {
                ok: false,
                status: "decision-required",
                phase: "decision",
                method: "decision-required",
                trace,
                message: "OrionQuests has local work that cannot be updated non-destructively. Choose Keep or Discard & update.",
                fromVersion: runningVersion,
                toVersion: targetVersion,
                fromCommit: currentHead,
                toCommit: targetCommit,
                decision: {
                    token,
                    summary,
                    changes,
                    localCommitCount
                }
            };
        } catch (error) {
            trace.push("Failure: update stopped during phase " + phase);
            return {
                ok: false,
                status: "failed",
                phase,
                method: "unresolved",
                trace,
                message: "OrionQuests update failed during " + phase + ".",
                fromVersion: runningVersion,
                toVersion: targetVersion,
                diagnostic: diagnosticText(error)
            };
        } finally {
            if (checkout && tagRef) await deleteRef(checkout, tagRef);
            updateInFlight = false;
        }
    }

    return {
        updateRelease
    };
}
