import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { createQuestUIUpdateEngine } from "../updateNativeEngine";

const execFile = promisify(execFileCallback);
const TEST_PRINCIPAL = "questui-updater-test@example.com";
const TEST_RUNTIME_FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"] as const;

async function writeKnownGoodDist(vencord: string, marker = "known-good"): Promise<Map<string, string>> {
    const dist = join(vencord, "dist");
    await mkdir(dist, { recursive: true });
    const files = new Map<string, string>();
    for (const name of TEST_RUNTIME_FILES) {
        const content = marker + ":" + name + "\n";
        files.set(name, content);
        await writeFile(join(dist, name), content, "utf8");
    }
    return files;
}

async function assertRuntimeDist(vencord: string, expected: Map<string, string>): Promise<void> {
    for (const [name, content] of expected) {
        assert.equal(await readFile(join(vencord, "dist", name), "utf8"), content);
    }
}

async function run(command: string, args: string[], cwd: string): Promise<string> {
    const result = await execFile(command, args, {
        cwd,
        windowsHide: true,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024
    });
    return String(result.stdout ?? "").trim();
}

async function git(cwd: string, ...args: string[]): Promise<string> {
    return run("git", args, cwd);
}

async function configureIdentity(cwd: string): Promise<void> {
    await git(cwd, "config", "user.name", "QuestUI Updater Test");
    await git(cwd, "config", "user.email", TEST_PRINCIPAL);
}

async function createKey(root: string, name: string): Promise<{ privateKey: string; publicKey: string; }> {
    const privateKey = join(root, name);
    await run("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", privateKey], root);
    const publicLine = (await readFile(`${privateKey}.pub`, "utf8")).trim();
    const parts = publicLine.split(/\s+/);
    assert.ok(parts.length >= 2, "ssh-keygen did not produce a usable public key");
    return {
        privateKey,
        publicKey: `${parts[0]} ${parts[1]}`
    };
}

async function writeVersion(repo: string, version: string): Promise<void> {
    await writeFile(
        join(repo, "version.ts"),
        `export const QUESTUI_VERSION = "${version}";\n`,
        "utf8"
    );
}

async function commitRelease(repo: string, version: string, signingKey: string, signed = true): Promise<string> {
    await writeVersion(repo, version);
    await git(repo, "add", "version.ts");
    await git(repo, "commit", "-m", `release ${version}`);
    await git(repo, "config", "gpg.format", "ssh");
    await git(repo, "config", "user.signingkey", signingKey);

    if (signed) {
        await git(repo, "tag", "-s", version, "-m", version);
    } else {
        await git(repo, "tag", "-a", version, "-m", version);
    }

    return git(repo, "rev-parse", `${version}^{}`);
}

async function setupFixture() {
    const root = await mkdtemp(join(tmpdir(), "questui-updater-test-"));
    const source = resolve(join(root, "source"));
    const vencord = resolve(join(root, "vencord"));

    await mkdir(source, { recursive: true });
    await git(source, "init");
    await git(source, "symbolic-ref", "HEAD", "refs/heads/main");
    await configureIdentity(source);

    const trustedKey = await createKey(root, "trusted_ed25519");
    const untrustedKey = await createKey(root, "untrusted_ed25519");

    const v140 = await commitRelease(source, "v1.4.0", trustedKey.privateKey);
    await writeFile(join(source, "MAIN_SNAPSHOT"), "official main snapshot\n", "utf8");
    await git(source, "add", "MAIN_SNAPSHOT");
    await git(source, "commit", "-m", "main snapshot between releases");
    const mainSnapshot = await git(source, "rev-parse", "HEAD");
    const v141 = await commitRelease(source, "v1.4.1", trustedKey.privateKey);
    const v142 = await commitRelease(source, "v1.4.2", untrustedKey.privateKey);

    await mkdir(join(vencord, "scripts", "build"), { recursive: true });
    await writeFile(join(vencord, "package.json"), "{}\n", "utf8");
    await writeFile(join(vencord, "scripts", "build", "build.mjs"), "export {};\n", "utf8");
    await writeKnownGoodDist(vencord);

    let suffix = 0;

    async function cloneInstalled(
        name: string,
        revision = v140,
        parent = root
    ): Promise<string> {
        await mkdir(parent, { recursive: true });
        const checkout = resolve(join(parent, name));
        await run("git", ["clone", "--quiet", source, checkout], parent);
        await configureIdentity(checkout);
        await git(checkout, "switch", "-C", "installed", revision);
        return checkout;
    }

    function engine(checkout: string, buildVencord: () => Promise<void>) {
        return createQuestUIUpdateEngine({
            questUIDir: checkout,
            vencordSrcDir: vencord,
            officialRepo: source,
            signerPrincipal: TEST_PRINCIPAL,
            signerPublicKey: trustedKey.publicKey,
            buildVencord,
            buildCommand: "node scripts/build/build.mjs",
            now: () => 1_800_000_000_000,
            randomSuffix: () => `case-${++suffix}`
        });
    }

    return {
        root,
        source,
        vencord,
        v140,
        mainSnapshot,
        v141,
        v142,
        cloneInstalled,
        engine,
        cleanup: () => rm(root, { recursive: true, force: true })
    };
}

async function assertNoTemporaryRefs(checkout: string): Promise<void> {
    const refs = await git(checkout, "for-each-ref", "--format=%(refname)", "refs/questui-update");
    assert.equal(refs, "");
}

async function main() {
    const fixture = await setupFixture();

    try {
        {
            const checkout = await fixture.cloneInstalled("happy");
            const builds: string[] = [];
            const updater = fixture.engine(checkout, async () => {
                builds.push((await readFile(join(checkout, "version.ts"), "utf8")).trim());
            });

            const inspected = await updater.inspectCheckout();
            assert.equal(inspected.ok, true);
            assert.equal(inspected.fromCommit, fixture.v140);
            assert.equal(inspected.sourceIdentity, "official-main-history");
            assert.equal(inspected.officialMainCommit, fixture.v142);

            const result = await updater.updateRelease("v1.4.0", "v1.4.1");
            assert.equal(result.ok, true);
            assert.equal(result.status, "updated");
            assert.equal(result.fromCommit, fixture.v140);
            assert.equal(result.toCommit, fixture.v141);
            assert.equal(result.restartRequired, true);
            assert.equal(result.method, "signed-detached-checkout");
            assert.match((result.trace ?? []).join("\n"), /Verify target release/);
            assert.match((result.trace ?? []).join("\n"), /git switch --detach/);
            assert.match((result.trace ?? []).join("\n"), /node scripts\/build\/build\.mjs/);
            assert.match(
                (result.trace ?? []).join("\n"),
                /Checkout guard: revalidated origin, HEAD, worktree, source ref and signed target ref/
            );
            assert.match((result.trace ?? []).join("\n"), /Snapshot: current Vencord dist preserved successfully/);
            assert.equal(result.sourceIdentity, "official-main-history");
            assert.equal(result.officialMainCommit, fixture.v142);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v141);
            assert.equal(builds.length, 1);
            assert.match(builds[0], /v1\.4\.1/);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const checkout = await fixture.cloneInstalled("invalid-version");
            const updater = fixture.engine(checkout, async () => undefined);
            assert.equal((await updater.updateRelease("v1.4.0", "v1.4.0")).status, "invalid-version");
            assert.equal((await updater.updateRelease("v1.4.0", "dev")).status, "invalid-version");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v140);
        }

        {
            const checkout = await fixture.cloneInstalled("wrong-origin");
            await git(checkout, "remote", "set-url", "origin", resolve(join(fixture.root, "other-origin")));
            const updater = fixture.engine(checkout, async () => undefined);
            const result = await updater.updateRelease("v1.4.0", "v1.4.1");
            assert.equal(result.status, "wrong-origin");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v140);
        }

        {
            const checkout = await fixture.cloneInstalled("dirty");
            await appendFile(join(checkout, "version.ts"), "// dirty\n", "utf8");
            const updater = fixture.engine(checkout, async () => undefined);
            const result = await updater.updateRelease("v1.4.0", "v1.4.1");
            assert.equal(result.status, "dirty");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v140);
        }

        {
            const checkout = await fixture.cloneInstalled("custom-checkout");
            await writeFile(join(checkout, "LOCAL_ONLY"), "local\n", "utf8");
            await git(checkout, "add", "LOCAL_ONLY");
            await git(checkout, "commit", "-m", "local commit");
            const localHead = await git(checkout, "rev-parse", "HEAD");

            const updater = fixture.engine(checkout, async () => undefined);
            const result = await updater.updateRelease("v1.4.0", "v1.4.1");
            assert.equal(result.status, "diverged");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), localHead);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const checkout = await fixture.cloneInstalled("official-main-history", fixture.mainSnapshot);
            const updater = fixture.engine(checkout, async () => undefined);
            const result = await updater.updateRelease("v0.0.0", "v1.4.1");
            assert.equal(result.status, "updated");
            assert.equal(result.ok, true);
            assert.equal(result.fromCommit, fixture.mainSnapshot);
            assert.equal(result.toCommit, fixture.v141);
            assert.match((result.trace ?? []).join("\n"), /official main history/);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const devbuildParent = join(fixture.vencord, "src", "userplugins");
            const checkout = await fixture.cloneInstalled("QuestUI", fixture.v140, devbuildParent);
            const updater = fixture.engine(checkout, async () => undefined);
            const inspected = await updater.inspectCheckout();
            assert.equal(inspected.ok, true);
            assert.equal(inspected.fromCommit, fixture.v140);
            assert.equal(inspected.sourceIdentity, "official-main-history");
            assert.equal(inspected.officialMainCommit, fixture.v142);
            assert.match(inspected.message, /official main history/);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const checkout = await fixture.cloneInstalled("invalid-signature");
            const updater = fixture.engine(checkout, async () => undefined);
            const result = await updater.updateRelease("v1.4.0", "v1.4.2");
            assert.equal(result.status, "invalid-signature");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v140);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const checkout = await fixture.cloneInstalled("tag-mismatch");
            await git(checkout, "tag", "-d", "v1.4.1");
            await git(checkout, "tag", "-a", "v1.4.1", fixture.v140, "-m", "conflicting local tag");

            const updater = fixture.engine(checkout, async () => undefined);
            const result = await updater.updateRelease("v1.4.0", "v1.4.1");
            assert.equal(result.status, "tag-mismatch");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v140);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const checkout = await fixture.cloneInstalled("rollback-success");
            const originalDist = await writeKnownGoodDist(fixture.vencord, "before-update");
            let builds = 0;
            const updater = fixture.engine(checkout, async () => {
                builds++;
                await writeFile(
                    join(fixture.vencord, "dist", "renderer.js"),
                    "partial broken target\n",
                    "utf8"
                );
                throw new Error("target build filesystem failure");
            });

            const result = await updater.updateRelease("v1.4.0", "v1.4.1");
            assert.equal(result.status, "build-failed");
            assert.equal(result.ok, false);
            assert.match(result.diagnostic ?? "", /target build filesystem failure/);
            assert.match((result.trace ?? []).join("\n"), /Build: failed/);
            assert.match(
                (result.trace ?? []).join("\n"),
                /Rollback dist: previous runtime restored successfully; no rebuild required/
            );
            assert.doesNotMatch((result.trace ?? []).join("\n"), /Rollback build:/);
            assert.equal(builds, 1);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v140);
            assert.equal(await git(checkout, "branch", "--show-current"), "installed");
            assert.match(await readFile(join(checkout, "version.ts"), "utf8"), /v1\.4\.0/);
            await assertRuntimeDist(fixture.vencord, originalDist);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const checkout = await fixture.cloneInstalled("snapshot-required");
            const rendererCss = join(fixture.vencord, "dist", "renderer.css");
            const originalCss = await readFile(rendererCss, "utf8");
            await rm(rendererCss, { force: true });
            let builds = 0;
            const updater = fixture.engine(checkout, async () => { builds++; });

            const result = await updater.updateRelease("v1.4.0", "v1.4.1");
            assert.equal(result.status, "failed");
            assert.equal(result.phase, "snapshot");
            assert.equal(result.ok, false);
            assert.equal(builds, 0);
            assert.match((result.trace ?? []).join("\n"), /Snapshot: failed; update cancelled before checkout mutation/);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v140);
            await writeFile(rendererCss, originalCss, "utf8");
            await assertNoTemporaryRefs(checkout);
        }

        {
            const checkout = await fixture.cloneInstalled("busy");
            let entered!: () => void;
            let unblock!: () => void;
            const buildEntered = new Promise<void>(resolveEntered => { entered = resolveEntered; });
            const buildGate = new Promise<void>(resolveGate => { unblock = resolveGate; });
            let firstBuild = true;

            const updater = fixture.engine(checkout, async () => {
                if (!firstBuild) return;
                firstBuild = false;
                entered();
                await buildGate;
            });

            const first = updater.updateRelease("v1.4.0", "v1.4.1");
            await buildEntered;

            const second = await updater.updateRelease("v1.4.0", "v1.4.1");
            assert.equal(second.status, "busy");
            assert.equal(second.ok, false);

            unblock();
            const firstResult = await first;
            assert.equal(firstResult.status, "updated");
            assert.equal(firstResult.ok, true);
            await assertNoTemporaryRefs(checkout);
        }

        console.log("QuestUI managed updater integration tests — PASS");
    } finally {
        await fixture.cleanup();
    }
}

void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
