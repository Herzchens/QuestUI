import type { IpcMainInvokeEvent } from "electron";
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
}

interface VerifiedTag {
    tag: string;
    ref: string;
    object: string;
    commit: string;
}

const execFile = promisify(execFileCallback);
const VENCORD_SRC_DIR = join(__dirname, "..");
const QUESTUI_DIR = join(VENCORD_SRC_DIR, "src", "userplugins", "QuestUI");
const OFFICIAL_REPO = "https://github.com/herzchens/questui";
const SIGNER_PRINCIPAL = "166841132+Herzchens@users.noreply.github.com";
const SIGNER_PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMwKdHjkKqlWReNnF5Hz6GmWWCkZqx9sNklZuAeMPiRD";
const MAX_BUFFER = 16 * 1024 * 1024;
let updateInFlight = false;

function normalizedRepoUrl(value: string): string {
    return value.trim()
        .replace(/^git@github\.com:/i, "https://github.com/")
        .replace(/^ssh:\/\/git@github\.com\//i, "https://github.com/")
        .replace(/\.git$/i, "")
        .replace(/\/$/, "")
        .toLowerCase();
}

function validReleaseTag(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const tag = value.trim();
    if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(tag)) return null;
    return parseSemver(tag) ? tag : null;
}

async function exists(path: string): Promise<boolean> {
    try { await stat(path); return true; }
    catch { return false; }
}

async function run(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; }> {
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

async function git(...args: string[]): Promise<{ stdout: string; stderr: string; }> {
    return run("git", args, QUESTUI_DIR);
}

async function gitText(...args: string[]): Promise<string> {
    return (await git(...args)).stdout.trim();
}

async function deleteRef(ref: string): Promise<void> {
    try { await git("update-ref", "-d", ref); } catch { }
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
        await writeFile(file, `${SIGNER_PRINCIPAL} ${SIGNER_PUBLIC_KEY}\n`, "utf8");
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
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`QUESTUI_VERSION\\s*=\\s*[\"']${escapedTag}[\"']`).test(versionSource)) {
        throw new Error("Release tag and version.ts disagree.");
    }

    return { tag, ref, object, commit };
}

async function fetchVerifiedTag(tag: string, purpose: string, allowedSignersPath: string): Promise<VerifiedTag> {
    const ref = `refs/questui-update/${purpose}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    try { existing = await gitText("rev-parse", "--verify", localRef); } catch { }
    if (existing && existing !== tag.object) throw new Error(`Local ${tag.tag} points to a different tag object.`);
    if (!existing) await git("update-ref", localRef, tag.object);
}

async function buildVencord(): Promise<void> {
    const args = ["scripts/build/build.mjs"];
    if (IS_DEV) args.push("--dev");

    const isFlatpak = process.platform === "linux" && Boolean(process.env.FLATPAK_ID);
    if (isFlatpak) await run("flatpak-spawn", ["--host", "node", ...args], VENCORD_SRC_DIR);
    else await run("node", args, VENCORD_SRC_DIR);
}

async function restoreCheckout(head: string, branch: string | null): Promise<void> {
    await git("switch", "--detach", head);
    if (branch) await git("switch", branch);
}

async function localPreflight(): Promise<QuestUIUpdateResult | null> {
    if (!await exists(join(VENCORD_SRC_DIR, "package.json"))
        || !await exists(join(VENCORD_SRC_DIR, "scripts", "build", "build.mjs"))
        || !await exists(join(QUESTUI_DIR, ".git"))
        || !await exists(join(QUESTUI_DIR, "version.ts"))) {
        return {
            ok: false,
            status: "unsupported-install",
            message: "QuestUI could not locate a managed source checkout inside this Vencord build."
        };
    }

    let origin: string;
    try { origin = await gitText("remote", "get-url", "origin"); }
    catch {
        return { ok: false, status: "wrong-origin", message: "QuestUI checkout has no readable origin remote." };
    }
    if (normalizedRepoUrl(origin) !== OFFICIAL_REPO) {
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

export async function inspectQuestUICheckout(_: IpcMainInvokeEvent): Promise<QuestUIUpdateResult> {
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

export async function updateQuestUIRelease(
    _: IpcMainInvokeEvent,
    installedVersionInput: string,
    targetVersionInput: string
): Promise<QuestUIUpdateResult> {
    if (updateInFlight) {
        return { ok: false, status: "busy", message: "A QuestUI update is already running." };
    }

    const installedVersion = validReleaseTag(installedVersionInput);
    const targetVersion = validReleaseTag(targetVersionInput);
    if (!installedVersion || !targetVersion || (compareSemver(targetVersion, installedVersion) ?? 0) <= 0) {
        return {
            ok: false,
            status: "invalid-version",
            message: "QuestUI refused an invalid or non-upgrade release target."
        };
    }

    updateInFlight = true;
    let installedTag: VerifiedTag | null = null;
    let targetTag: VerifiedTag | null = null;
    try {
        const blocked = await localPreflight();
        if (blocked) return blocked;

        const currentHead = await gitText("rev-parse", "HEAD");
        const branch = await currentBranch();

        return await withAllowedSigners(async allowedSignersPath => {
            try {
                installedTag = await fetchVerifiedTag(installedVersion, "installed", allowedSignersPath);
                targetTag = await fetchVerifiedTag(targetVersion, "target", allowedSignersPath);
            } catch (error) {
                return {
                    ok: false,
                    status: "invalid-signature",
                    message: error instanceof Error ? error.message : "QuestUI could not verify the signed release tags."
                };
            }

            if (installedTag.commit !== currentHead) {
                return {
                    ok: false,
                    status: "custom-checkout",
                    message: `Current QuestUI HEAD is not the signed ${installedVersion} release. Local or development history was left untouched.`,
                    fromVersion: installedVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead,
                    toCommit: targetTag.commit
                };
            }

            const statusBeforeSwitch = await gitText("status", "--porcelain", "--untracked-files=all");
            const headBeforeSwitch = await gitText("rev-parse", "HEAD");
            if (statusBeforeSwitch || headBeforeSwitch !== currentHead) {
                return {
                    ok: false,
                    status: "dirty",
                    message: "QuestUI checkout changed during update preflight. Nothing was overwritten."
                };
            }

            try {
                await installVerifiedLocalTag(targetTag);
            } catch (error) {
                return {
                    ok: false,
                    status: "tag-mismatch",
                    message: error instanceof Error ? error.message : "QuestUI found a conflicting local release tag."
                };
            }

            await git("switch", "--detach", targetTag.commit);
            try {
                await buildVencord();
            } catch (buildError) {
                try {
                    await restoreCheckout(currentHead, branch);
                    await buildVencord();
                } catch (rollbackError) {
                    return {
                        ok: false,
                        status: "rollback-failed",
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
                    message: `The ${targetVersion} build failed. QuestUI restored the previous ${installedVersion} checkout and rebuilt it successfully.`,
                    fromVersion: installedVersion,
                    toVersion: targetVersion,
                    fromCommit: currentHead,
                    toCommit: targetTag.commit
                };
            }

            return {
                ok: true,
                status: "updated",
                message: `QuestUI updated from ${installedVersion} to ${targetVersion}. Restart Discord to load the new build.`,
                fromVersion: installedVersion,
                toVersion: targetVersion,
                fromCommit: currentHead,
                toCommit: targetTag.commit,
                restartRequired: true
            };
        });
    } catch (error) {
        return {
            ok: false,
            status: "failed",
            message: error instanceof Error ? error.message : "QuestUI update failed before the checkout was changed."
        };
    } finally {
        if (installedTag) await deleteRef(installedTag.ref);
        if (targetTag) await deleteRef(targetTag.ref);
        updateInFlight = false;
    }
}
