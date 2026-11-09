import { execFile as execFileCallback } from "child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import { compareSemver, parseSemver } from "../logic";

export type QuestUIUpdateStatus =
    | "updated"
    | "busy"
    | "unsupported-install"
    | "wrong-origin"
    | "dirty"
    | "custom-checkout"
    | "diverged"
    | "stale-checkout"
    | "invalid-version"
    | "invalid-signature"
    | "tag-mismatch"
    | "build-failed"
    | "rollback-failed"
    | "failed";

export interface QuestUIUpdateResult {
    ok: boolean;
    status: QuestUIUpdateStatus;
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
    sourceIdentity?: "official-main-history";
    officialMainCommit?: string;
}

export interface QuestUIUpdateEngineConfig {
    questUIDir: string;
    vencordSrcDir: string;
    officialRepo: string;
    signerPrincipal: string;
    signerPublicKey: string;
    buildVencord(): Promise<void>;
    buildCommand?: string;
    now?: () => number;
    randomSuffix?: () => string;
}

interface VerifiedTag {
    tag: string;
    ref: string;
    object: string;
    commit: string;
}

interface FetchedMain {
    ref: string;
    commit: string;
}

interface VencordDistSnapshot {
    root: string;
    dist: string;
}

const execFile = promisify(execFileCallback);
const MAX_BUFFER = 16 * 1024 * 1024;
const VENCORD_RUNTIME_FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"] as const;

export function normalizeUpdaterRepoUrl(value: string): string {
    return value.trim()
        .replace(/^git@github\.com:/i, "https://github.com/")
        .replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/")
        .replace(/\.git$/i, "")
        .replace(/\/$/, "")
        .toLowerCase();
}

export function normalizeUpdaterReleaseTag(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const tag = value.trim();
    if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(tag)) return null;
    return parseSemver(tag) ? tag : null;
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
    if (!(error instanceof Error)) return String(error).slice(0, 8000);

    const processError = error as Error & { stdout?: unknown; stderr?: unknown; };
    const sections = [
        ["message", error.message],
        ["stderr", String(processError.stderr ?? "").trim()],
        ["stdout", String(processError.stdout ?? "").trim()]
    ] as const;

    return sections
        .filter(([, value]) => Boolean(value))
        .map(([label, value]) => label + ":\n" + value)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join("\n\n")
        .replace(/\r\n?/g, "\n")
        .trim()
        .slice(0, 8000);
}

function shortCommit(value: string): string {
    return value.length > 12 ? value.slice(0, 12) : value;
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

export function createQuestUIUpdateEngine(config: QuestUIUpdateEngineConfig) {
    const officialRepo = normalizeUpdaterRepoUrl(config.officialRepo);
    let updateInFlight = false;

    async function git(...args: string[]): Promise<{ stdout: string; stderr: string; }> {
        return run("git", args, config.questUIDir);
    }

    async function gitText(...args: string[]): Promise<string> {
        return (await git(...args)).stdout.trim();
    }

    async function verifyVencordRuntimeDist(distPath: string): Promise<void> {
        for (const name of VENCORD_RUNTIME_FILES) {
            const path = join(distPath, name);
            const info = await stat(path);
            if (!info.isFile() || info.size <= 0) {
                throw new Error("Vencord runtime file " + name + " is missing or empty.");
            }
        }
    }

    async function snapshotVencordDist(): Promise<VencordDistSnapshot> {
        const currentDist = join(config.vencordSrcDir, "dist");
        await verifyVencordRuntimeDist(currentDist);

        const root = await mkdtemp(join(tmpdir(), "questui-dist-rollback-"));
        const snapshotDist = join(root, "dist");
        try {
            await cp(currentDist, snapshotDist, { recursive: true, force: true });
            await verifyVencordRuntimeDist(snapshotDist);
            return { root, dist: snapshotDist };
        } catch (error) {
            await rm(root, { recursive: true, force: true }).catch(() => undefined);
            throw error;
        }
    }

    async function restoreVencordDist(snapshot: VencordDistSnapshot): Promise<void> {
        const currentDist = join(config.vencordSrcDir, "dist");
        await rm(currentDist, { recursive: true, force: true });
        await cp(snapshot.dist, currentDist, { recursive: true, force: true });
        await verifyVencordRuntimeDist(currentDist);
    }

    async function cleanupVencordDistSnapshot(snapshot: VencordDistSnapshot | null): Promise<void> {
        if (!snapshot) return;
        await rm(snapshot.root, { recursive: true, force: true }).catch(() => undefined);
    }

    async function deleteRef(ref: string): Promise<void> {
        try {
            await git("update-ref", "-d", ref);
        } catch {
            // Best effort cleanup only. A failed cleanup must not mask the updater result.
        }
    }

    async function cleanupFetchedTag(tag: VerifiedTag | null): Promise<void> {
        if (tag) await deleteRef(tag.ref);
    }

    async function currentBranch(): Promise<string | null> {
        try {
            const branch = await gitText("symbolic-ref", "--quiet", "--short", "HEAD");
            return branch || null;
        } catch {
            return null;
        }
    }

    async function withAllowedSigners<T>(work: (allowedSignersPath: string) => Promise<T>): Promise<T> {
        const dir = await mkdtemp(join(tmpdir(), "questui-signers-"));
        const file = join(dir, "allowed_signers");
        try {
            await writeFile(file, `${config.signerPrincipal} ${config.signerPublicKey}\n`, "utf8");
            return await work(file);
        } finally {
            await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    async function verifyFetchedTag(tag: string, ref: string, allowedSignersPath: string): Promise<VerifiedTag> {
        const objectType = await gitText("cat-file", "-t", ref);
        if (objectType !== "tag") throw new Error("Release ref is not a signed annotated tag.");

        const declaredTag = await gitText("for-each-ref", "--format=%(tag)", ref);
        if (declaredTag !== tag) throw new Error("Release tag name does not match the requested version.");

        await git(
            "-c", "gpg.format=ssh",
            "-c", `gpg.ssh.allowedSignersFile=${allowedSignersPath}`,
            "verify-tag", ref
        );

        const object = await gitText("rev-parse", ref);
        const commit = await gitText("rev-parse", `${ref}^{}`);
        const commitType = await gitText("cat-file", "-t", commit);
        if (commitType !== "commit") throw new Error("Release tag does not peel to a commit.");

        const versionSource = (await git("show", `${commit}:version.ts`)).stdout;
        const escapedTag = tag.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`QUESTUI_VERSION\\s*=\\s*["']${escapedTag}["']`).test(versionSource)) {
            throw new Error("Release tag and version.ts disagree.");
        }

        return { tag, ref, object, commit };
    }

    async function fetchVerifiedTag(tag: string, purpose: string, allowedSignersPath: string): Promise<VerifiedTag> {
        const now = config.now?.() ?? Date.now();
        const suffix = config.randomSuffix?.() ?? Math.random().toString(16).slice(2);
        const ref = `refs/questui-update/${purpose}-${now}-${suffix}`;
        try {
            await git("fetch", "--force", "--no-tags", "origin", `refs/tags/${tag}:${ref}`);
            return await verifyFetchedTag(tag, ref, allowedSignersPath);
        } catch (error) {
            await deleteRef(ref);
            throw error;
        }
    }

    async function fetchOfficialMain(purpose: string): Promise<FetchedMain> {
        const now = config.now?.() ?? Date.now();
        const suffix = config.randomSuffix?.() ?? Math.random().toString(16).slice(2);
        const ref = `refs/questui-update/${purpose}-${now}-${suffix}`;
        try {
            await git("fetch", "--force", "--no-tags", "origin", `refs/heads/main:${ref}`);
            const commit = await gitText("rev-parse", `${ref}^{commit}`);
            return { ref, commit };
        } catch (error) {
            await deleteRef(ref);
            throw error;
        }
    }

    async function isAncestor(ancestor: string, descendant: string): Promise<boolean> {
        try {
            await git("merge-base", "--is-ancestor", ancestor, descendant);
            return true;
        } catch {
            return false;
        }
    }

    async function versionAtCommit(commit: string): Promise<string | null> {
        try {
            const source = (await git("show", `${commit}:version.ts`)).stdout;
            const match = source.match(/QUESTUI_VERSION\s*=\s*["']([^"']+)["']/);
            return normalizeUpdaterReleaseTag(match?.[1]) ?? null;
        } catch {
            return null;
        }
    }

    async function installVerifiedLocalTag(tag: VerifiedTag): Promise<void> {
        const localRef = `refs/tags/${tag.tag}`;
        let existing: string | null = null;
        try {
            existing = await gitText("rev-parse", "--verify", localRef);
        } catch {
            // Missing local tag is expected on a minimal managed checkout.
        }

        if (existing && existing !== tag.object) {
            throw new Error(`Local ${tag.tag} points to a different tag object.`);
        }
        if (!existing) await git("update-ref", localRef, tag.object);
    }

    async function restoreCheckout(head: string, branch: string | null): Promise<void> {
        await git("switch", "--detach", head);
        if (branch) await git("switch", branch);
    }

    async function localPreflight(): Promise<QuestUIUpdateResult | null> {
        if (!await exists(join(config.vencordSrcDir, "package.json"))
            || !await exists(join(config.vencordSrcDir, "scripts", "build", "build.mjs"))
            || !await exists(join(config.questUIDir, "version.ts"))) {
            return {
                ok: false,
                status: "unsupported-install",
                message: "QuestUI could not locate a managed source checkout inside this Vencord build."
            };
        }

        try {
            if (await gitText("rev-parse", "--is-inside-work-tree") !== "true") {
                return {
                    ok: false,
                    status: "unsupported-install",
                    message: "QuestUI is not installed as a Git worktree that the managed updater can verify."
                };
            }
        } catch {
            return {
                ok: false,
                status: "unsupported-install",
                message: "QuestUI is not installed as a Git worktree that the managed updater can verify."
            };
        }

        let origin: string;
        try {
            origin = await gitText("remote", "get-url", "origin");
        } catch {
            return {
                ok: false,
                status: "wrong-origin",
                message: "QuestUI checkout has no readable origin remote."
            };
        }

        if (normalizeUpdaterRepoUrl(origin) !== officialRepo) {
            return {
                ok: false,
                status: "wrong-origin",
                message: "Automatic updates are disabled because this QuestUI checkout does not use the official Herzchens/QuestUI origin."
            };
        }

        const dirty = await gitText("status", "--porcelain", "--untracked-files=all");
        if (dirty) {
            return {
                ok: false,
                status: "dirty",
                message: "QuestUI has local file changes. Automatic update will not overwrite them."
            };
        }

        return null;
    }

    async function inspectCheckout(): Promise<QuestUIUpdateResult> {
        let officialMain: FetchedMain | null = null;
        try {
            const blocked = await localPreflight();
            if (blocked) return blocked;

            const head = await gitText("rev-parse", "HEAD");
            officialMain = await fetchOfficialMain("inspect-main");
            if (!await isAncestor(head, officialMain.commit)) {
                return {
                    ok: false,
                    status: "diverged",
                    message: "QuestUI HEAD is not part of the freshly fetched official main history. Automatic update was left disabled.",
                    fromCommit: head
                };
            }

            const version = await versionAtCommit(head);
            return {
                ok: true,
                status: "updated",
                message: "QuestUI checkout is clean and belongs to the official main history.",
                fromCommit: head,
                sourceIdentity: "official-main-history",
                officialMainCommit: officialMain.commit,
                ...(version ? { fromVersion: version } : {})
            };
        } catch (error) {
            return {
                ok: false,
                status: "failed",
                message: error instanceof Error ? error.message : "QuestUI checkout inspection failed."
            };
        } finally {
            if (officialMain) await deleteRef(officialMain.ref);
        }
    }

    async function updateRelease(
        installedVersionInput: string,
        targetVersionInput: string
    ): Promise<QuestUIUpdateResult> {
        if (updateInFlight) {
            return {
                ok: false,
                status: "busy",
                phase: "preflight",
                method: "none",
                trace: ["Preflight: another QuestUI managed update is already running"],
                message: "A QuestUI update is already running."
            };
        }

        const requestedInstalledVersion = normalizeUpdaterReleaseTag(installedVersionInput);
        const targetVersion = normalizeUpdaterReleaseTag(targetVersionInput);
        if (!targetVersion) {
            return {
                ok: false,
                status: "invalid-version",
                phase: "preflight",
                method: "none",
                trace: ["Preflight: rejected invalid release target"],
                message: "QuestUI refused an invalid release target."
            };
        }

        updateInFlight = true;
        let officialMain: FetchedMain | null = null;
        let targetTag: VerifiedTag | null = null;
        let distSnapshot: VencordDistSnapshot | null = null;
        let preserveDistSnapshot = false;
        let phase = "preflight";
        const method = "signed-detached-checkout";
        const trace: string[] = [];

        try {
            trace.push("Preflight: requested update to " + targetVersion);

            const blocked = await localPreflight();
            if (blocked) {
                trace.push("Preflight: " + blocked.message);
                return { ...blocked, phase, method: "none", trace };
            }
            trace.push("Preflight: managed QuestUI checkout is clean and uses the official origin");

            const currentHead = await gitText("rev-parse", "HEAD");
            const branch = await currentBranch();
            const currentVersion = await versionAtCommit(currentHead);
            if (!currentVersion) {
                trace.push("Preflight: version.ts at current HEAD is not a valid QuestUI release version");
                return {
                    ok: false,
                    status: "invalid-version",
                    phase,
                    method: "none",
                    trace,
                    message: "QuestUI could not determine a valid installed version from the current checkout.",
                    fromCommit: currentHead,
                    toVersion: targetVersion
                };
            }
            if ((compareSemver(targetVersion, currentVersion) ?? 0) <= 0) {
                trace.push("Preflight: target is not newer than version.ts at current HEAD");
                return {
                    ok: false,
                    status: "invalid-version",
                    phase,
                    method: "none",
                    trace,
                    message: "QuestUI refused a non-upgrade release target.",
                    fromVersion: currentVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead
                };
            }

            trace.push("Preflight: current HEAD " + shortCommit(currentHead)
                + (branch ? " on branch " + branch : " in detached HEAD")
                + " reports " + currentVersion);
            if (requestedInstalledVersion && requestedInstalledVersion !== currentVersion) {
                trace.push("Preflight: renderer reported " + requestedInstalledVersion
                    + ", but native version.ts reports " + currentVersion + "; native checkout identity wins");
            }

            phase = "verify-source";
            officialMain = await fetchOfficialMain("main");
            trace.push("Verify source: fetched official main at " + shortCommit(officialMain.commit));

            if (!await isAncestor(currentHead, officialMain.commit)) {
                trace.push("Verify source: current HEAD is not in official main history");
                return {
                    ok: false,
                    status: "diverged",
                    phase,
                    method,
                    trace,
                    message: "Current QuestUI HEAD is not part of the freshly fetched official main history. Local or development history was left untouched.",
                    fromVersion: currentVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead
                };
            }
            trace.push("Verify source: current HEAD is part of freshly fetched official main history");
            const sourceProvenance = {
                sourceIdentity: "official-main-history" as const,
                officialMainCommit: officialMain.commit
            };

            phase = "verify-signature";
            return await withAllowedSigners(async allowedSignersPath => {
                try {
                    trace.push("Verify target release: fetch signed annotated tag " + targetVersion + " from origin");
                    targetTag = await fetchVerifiedTag(targetVersion, "target", allowedSignersPath);
                    trace.push("Verify target release: SSH signature, tag name and version.ts accepted; commit "
                        + shortCommit(targetTag.commit));
                } catch (error) {
                    trace.push("Verify target release: signature or release identity failed");
                    return {
                        ok: false,
                        status: "invalid-signature",
                        phase,
                        method,
                        trace: [...trace],
                        diagnostic: diagnosticText(error),
                        message: error instanceof Error
                            ? error.message
                            : "QuestUI could not verify the signed target release tag.",
                        fromVersion: currentVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        ...sourceProvenance
                    };
                }

                if (!await isAncestor(targetTag.commit, officialMain!.commit)) {
                    trace.push("Verify target release: signed target is not in official main history");
                    return {
                        ok: false,
                        status: "tag-mismatch",
                        phase,
                        method,
                        trace: [...trace],
                        message: "The signed target release is not part of the freshly fetched official main history.",
                        fromVersion: currentVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetTag.commit,
                        ...sourceProvenance
                    };
                }

                if (!await isAncestor(currentHead, targetTag.commit)) {
                    trace.push("Verify target release: target is not forward from current official checkout");
                    return {
                        ok: false,
                        status: "invalid-version",
                        phase,
                        method,
                        trace: [...trace],
                        message: "The selected release is not newer than this official QuestUI checkout. Nothing was changed.",
                        fromVersion: currentVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetTag.commit,
                        ...sourceProvenance
                    };
                }
                trace.push("Checkout identity: clean current HEAD is trusted through official main history");

                phase = "snapshot";
                trace.push("Snapshot: preserve the current verified Vencord dist before checkout mutation");
                try {
                    distSnapshot = await snapshotVencordDist();
                    trace.push("Snapshot: current Vencord dist preserved successfully");
                } catch (error) {
                    trace.push("Snapshot: failed; update cancelled before checkout mutation");
                    return {
                        ok: false,
                        status: "failed",
                        phase,
                        method,
                        trace: [...trace],
                        diagnostic: diagnosticText(error),
                        message: "QuestUI could not preserve the current Vencord build for safe rollback. Nothing was changed.",
                        fromVersion: currentVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetTag.commit,
                        ...sourceProvenance
                    };
                }

                phase = "checkout-guard";
                const blockedBeforeSwitch = await localPreflight();
                if (blockedBeforeSwitch) {
                    trace.push("Checkout guard: " + blockedBeforeSwitch.message);
                    return {
                        ...blockedBeforeSwitch,
                        phase: "checkout-guard",
                        method,
                        trace: [...trace],
                        fromVersion: currentVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetTag.commit,
                        ...sourceProvenance
                    };
                }

                const headBeforeSwitch = await gitText("rev-parse", "HEAD");
                const mainRefCommit = await gitText("rev-parse", `${officialMain!.ref}^{commit}`);
                const targetRefCommit = await gitText("rev-parse", `${targetTag.ref}^{commit}`);
                const sourceStillOnMain = await isAncestor(currentHead, officialMain!.commit);
                const targetStillOnMain = await isAncestor(targetTag.commit, officialMain!.commit);
                const targetStillForward = await isAncestor(currentHead, targetTag.commit);

                if (headBeforeSwitch !== currentHead
                    || mainRefCommit !== officialMain!.commit
                    || targetRefCommit !== targetTag.commit
                    || !sourceStillOnMain
                    || !targetStillOnMain
                    || !targetStillForward) {
                    trace.push("Checkout guard: verified source or target identity changed before mutation; update cancelled");
                    return {
                        ok: false,
                        status: "stale-checkout",
                        phase: "checkout-guard",
                        method,
                        trace: [...trace],
                        message: "QuestUI checkout identity changed after verification. Nothing was overwritten.",
                        fromVersion: currentVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetTag.commit,
                        ...sourceProvenance
                    };
                }
                trace.push("Checkout guard: revalidated origin, HEAD, worktree, source ref and signed target ref");

                try {
                    trace.push("Tag install: ensure local refs/tags/" + targetVersion + " points to the verified tag object");
                    await installVerifiedLocalTag(targetTag);
                } catch (error) {
                    trace.push("Tag install: conflicting local tag detected; checkout left untouched");
                    return {
                        ok: false,
                        status: "tag-mismatch",
                        phase,
                        method,
                        trace: [...trace],
                        diagnostic: diagnosticText(error),
                        message: error instanceof Error
                            ? error.message
                            : "QuestUI found a conflicting local release tag.",
                        fromVersion: currentVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetTag.commit,
                        ...sourceProvenance
                    };
                }

                phase = "checkout";
                trace.push("Checkout: git switch --detach " + shortCommit(targetTag.commit));
                await git("switch", "--detach", targetTag.commit);
                trace.push("Checkout validation: detached signed target release commit is active");

                phase = "build";
                const buildCommand = config.buildCommand ?? "Vencord build command";
                trace.push("Build: " + buildCommand);

                try {
                    await config.buildVencord();
                    trace.push("Build: completed successfully");
                } catch (buildError) {
                    const buildDiagnostic = diagnosticText(buildError);
                    trace.push("Build: failed");
                    phase = "rollback";

                    try {
                        trace.push("Rollback checkout: restore " + shortCommit(currentHead)
                            + (branch ? " and branch " + branch : ""));
                        await restoreCheckout(currentHead, branch);

                        if (!distSnapshot) {
                            throw new Error("Pre-update Vencord dist snapshot is unavailable.");
                        }

                        trace.push("Rollback dist: restore the pre-update Vencord runtime snapshot");
                        await restoreVencordDist(distSnapshot);
                        trace.push("Rollback dist: previous runtime restored successfully; no rebuild required");
                    } catch (rollbackError) {
                        trace.push("Rollback: failed");
                        preserveDistSnapshot = distSnapshot != null;
                        return {
                            ok: false,
                            status: "rollback-failed",
                            phase,
                            method,
                            trace: [...trace],
                            diagnostic: [
                                buildDiagnostic,
                                diagnosticText(rollbackError),
                                distSnapshot ? "Recovery snapshot retained in system temp: " + distSnapshot.dist : ""
                            ].filter(Boolean).join("\n\n"),
                            message: "The update build failed and QuestUI could not fully restore the previous Vencord runtime. "
                                + (distSnapshot ? "A recovery snapshot was retained in the system temp directory." : ""),
                            fromVersion: currentVersion,
                            toVersion: targetVersion,
                            fromCommit: currentHead,
                            toCommit: targetTag.commit,
                            ...sourceProvenance
                        };
                    }

                    return {
                        ok: false,
                        status: "build-failed",
                        phase: "build",
                        method,
                        trace: [...trace],
                        diagnostic: buildDiagnostic,
                        message: "The " + targetVersion + " build failed. QuestUI restored the previous "
                            + currentVersion + " checkout and the pre-update Vencord runtime.",
                        fromVersion: currentVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetTag.commit,
                        ...sourceProvenance
                    };
                }

                trace.push("Result: signed target checkout built successfully; restart required");
                return {
                    ok: true,
                    status: "updated",
                    phase,
                    method,
                    trace: [...trace],
                    message: "QuestUI updated from " + currentVersion + " to " + targetVersion
                        + ". Restart Discord to load the new build.",
                    fromVersion: currentVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead,
                    toCommit: targetTag.commit,
                    restartRequired: true,
                    ...sourceProvenance
                };
            });
        } catch (error) {
            trace.push("Failure: update stopped during phase " + phase);
            return {
                ok: false,
                status: "failed",
                phase,
                method,
                trace,
                diagnostic: diagnosticText(error),
                message: error instanceof Error
                    ? error.message
                    : "QuestUI update failed before the checkout was changed."
            };
        } finally {
            if (officialMain) await deleteRef(officialMain.ref);
            await cleanupFetchedTag(targetTag);
            if (!preserveDistSnapshot) {
                await cleanupVencordDistSnapshot(distSnapshot);
            }
            updateInFlight = false;
        }
    }

    return {
        inspectCheckout,
        updateRelease
    };
}
