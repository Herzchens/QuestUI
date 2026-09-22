import { execFile as execFileCallback } from "child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import { compareSemver, parseSemver } from "./updateLogic";

export type QuestUIUpdateStatus =
    | "updated"
    | "busy"
    | "unsupported-install"
    | "wrong-origin"
    | "dirty"
    | "custom-checkout"
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

const execFile = promisify(execFileCallback);
const MAX_BUFFER = 16 * 1024 * 1024;

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
            || !await exists(join(config.questUIDir, ".git"))
            || !await exists(join(config.questUIDir, "version.ts"))) {
            return {
                ok: false,
                status: "unsupported-install",
                message: "QuestUI could not locate a managed source checkout inside this Vencord build."
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
        try {
            const blocked = await localPreflight();
            if (blocked) return blocked;

            const head = await gitText("rev-parse", "HEAD");
            return {
                ok: true,
                status: "updated",
                message: "QuestUI managed checkout is available for signed release updates.",
                fromCommit: head
            };
        } catch (error) {
            return {
                ok: false,
                status: "failed",
                message: error instanceof Error ? error.message : "QuestUI checkout inspection failed."
            };
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

        const installedVersion = normalizeUpdaterReleaseTag(installedVersionInput);
        const targetVersion = normalizeUpdaterReleaseTag(targetVersionInput);
        if (!installedVersion
            || !targetVersion
            || (compareSemver(targetVersion, installedVersion) ?? 0) <= 0) {
            return {
                ok: false,
                status: "invalid-version",
                phase: "preflight",
                method: "none",
                trace: ["Preflight: rejected invalid or non-upgrade release request"],
                message: "QuestUI refused an invalid or non-upgrade release target."
            };
        }

        updateInFlight = true;
        let installedTag: VerifiedTag | null = null;
        let targetTag: VerifiedTag | null = null;
        let phase = "preflight";
        const method = "signed-detached-checkout";
        const trace: string[] = [];

        try {
            trace.push("Preflight: requested " + installedVersion + " -> " + targetVersion);

            const blocked = await localPreflight();
            if (blocked) {
                trace.push("Preflight: " + blocked.message);
                return { ...blocked, phase, method: "none", trace };
            }
            trace.push("Preflight: managed QuestUI checkout is clean and uses the official origin");

            const currentHead = await gitText("rev-parse", "HEAD");
            const branch = await currentBranch();
            trace.push("Preflight: current HEAD " + shortCommit(currentHead)
                + (branch ? " on branch " + branch : " in detached HEAD"));

            phase = "verify-signature";
            return await withAllowedSigners(async allowedSignersPath => {
                try {
                    trace.push("Verify installed release: fetch signed annotated tag " + installedVersion + " from origin");
                    installedTag = await fetchVerifiedTag(installedVersion, "installed", allowedSignersPath);
                    trace.push("Verify installed release: SSH signature, tag name and version.ts accepted; commit " + shortCommit(installedTag.commit));

                    trace.push("Verify target release: fetch signed annotated tag " + targetVersion + " from origin");
                    targetTag = await fetchVerifiedTag(targetVersion, "target", allowedSignersPath);
                    trace.push("Verify target release: SSH signature, tag name and version.ts accepted; commit " + shortCommit(targetTag.commit));
                } catch (error) {
                    trace.push("Verify signature: failed");
                    return {
                        ok: false,
                        status: "invalid-signature",
                        phase,
                        method,
                        trace: [...trace],
                        diagnostic: diagnosticText(error),
                        message: error instanceof Error
                            ? error.message
                            : "QuestUI could not verify the signed release tags."
                    };
                }

                if (installedTag.commit !== currentHead) {
                    trace.push("Checkout identity: current HEAD does not equal the verified installed release commit; update refused");
                    return {
                        ok: false,
                        status: "custom-checkout",
                        phase,
                        method,
                        trace: [...trace],
                        message: `Current QuestUI HEAD is not the signed ${installedVersion} release. Local or development history was left untouched.`,
                        fromVersion: installedVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetTag.commit
                    };
                }
                trace.push("Checkout identity: current HEAD exactly matches signed " + installedVersion);

                const statusBeforeSwitch = await gitText("status", "--porcelain", "--untracked-files=all");
                const headBeforeSwitch = await gitText("rev-parse", "HEAD");
                if (statusBeforeSwitch || headBeforeSwitch !== currentHead) {
                    trace.push("Checkout guard: worktree or HEAD changed after verification; update cancelled");
                    return {
                        ok: false,
                        status: "dirty",
                        phase,
                        method,
                        trace: [...trace],
                        message: "QuestUI checkout changed during update preflight. Nothing was overwritten."
                    };
                }

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
                            : "QuestUI found a conflicting local release tag."
                    };
                }

                phase = "checkout";
                trace.push("Checkout: git switch --detach " + shortCommit(targetTag.commit));
                await git("switch", "--detach", targetTag.commit);
                trace.push("Checkout validation: detached target release commit is active");

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
                            diagnostic: [buildDiagnostic, diagnosticText(rollbackError)].filter(Boolean).join(" | "),
                            message: `The update build failed and QuestUI could not fully rebuild the previous checkout: ${rollbackError instanceof Error ? rollbackError.message : "unknown rollback error"}`,
                            fromVersion: installedVersion,
                            toVersion: targetVersion,
                            fromCommit: currentHead,
                            toCommit: targetTag.commit
                        };
                    }

                    return {
                        ok: false,
                        status: "build-failed",
                        phase: "build",
                        method,
                        trace: [...trace],
                        diagnostic: buildDiagnostic,
                        message: `The ${targetVersion} build failed. QuestUI restored the previous ${installedVersion} checkout and rebuilt it successfully.`,
                        fromVersion: installedVersion,
                        toVersion: targetVersion,
                        fromCommit: currentHead,
                        toCommit: targetTag.commit
                    };
                }

                trace.push("Result: signed target checkout built successfully; restart required");
                return {
                    ok: true,
                    status: "updated",
                    phase,
                    method,
                    trace: [...trace],
                    message: `QuestUI updated from ${installedVersion} to ${targetVersion}. Restart Discord to load the new build.`,
                    fromVersion: installedVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead,
                    toCommit: targetTag.commit,
                    restartRequired: true
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
            await cleanupFetchedTag(installedTag);
            await cleanupFetchedTag(targetTag);
            updateInFlight = false;
        }
    }

    return {
        inspectCheckout,
        updateRelease
    };
}
