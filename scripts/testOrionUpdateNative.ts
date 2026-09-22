import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { createOrionUpdateEngine } from "../orionUpdateNativeEngine";

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
    const result = await exec("git", args, { cwd, encoding: "utf8" });
    return String(result.stdout ?? "").trim();
}

async function writeOrionSource(dir: string, version: string, suffix = ""): Promise<void> {
    await writeFile(
        join(dir, "index.tsx"),
        [
            'export const PLUGIN_VERSION = "' + version + '";',
            'export default { name: "OrionQuests", description: "fixture" };',
            suffix
        ].join("\n") + "\n",
        "utf8"
    );
}

async function commitAll(repo: string, message: string): Promise<string> {
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", message);
    return git(repo, "rev-parse", "HEAD");
}

async function assertNoTemporaryRefs(checkout: string): Promise<void> {
    const refs = await git(checkout, "for-each-ref", "--format=%(refname)", "refs/orion-update");
    assert.equal(refs, "");
}

interface Fixture {
    root: string;
    upstream: string;
    v4112: string;
    v4114: string;
    cloneInstalled(name: string): Promise<{
        vencord: string;
        userplugins: string;
        checkout: string;
    }>;
    engine(
        vencord: string,
        userplugins: string,
        buildVencord: () => Promise<void>
    ): ReturnType<typeof createOrionUpdateEngine>;
    cleanup(): Promise<void>;
}

async function setupFixture(): Promise<Fixture> {
    const root = await mkdtemp(join(tmpdir(), "questui-orion-updater-"));
    const upstream = join(root, "upstream");
    await mkdir(upstream, { recursive: true });
    await git(upstream, "init", "--initial-branch=main");
    await git(upstream, "config", "user.email", "questui-test@example.invalid");
    await git(upstream, "config", "user.name", "QuestUI updater test");

    await writeOrionSource(upstream, "v4.11.2", "export const marker = \"old\";");
    const v4112 = await commitAll(upstream, "v4.11.2");
    await git(upstream, "tag", "v4.11.2");

    await writeOrionSource(upstream, "v4.11.4", "export const marker = \"new\";");
    const v4114 = await commitAll(upstream, "v4.11.4");
    await git(upstream, "tag", "v4.11.4");

    const sideBranch = "bad-release";
    await git(upstream, "switch", "-c", sideBranch, v4112);
    await writeOrionSource(upstream, "v4.11.5", "export const marker = \"off-main\";");
    await commitAll(upstream, "off-main v4.11.5");
    await git(upstream, "tag", "v4.11.5");
    await git(upstream, "switch", "main");

    async function cloneInstalled(name: string) {
        const vencord = join(root, "cases", name, "vencord");
        const userplugins = join(vencord, "src", "userplugins");
        const checkout = join(userplugins, "OrionQuests");
        await mkdir(join(vencord, "scripts", "build"), { recursive: true });
        await mkdir(userplugins, { recursive: true });
        await writeFile(join(vencord, "package.json"), "{}\n", "utf8");
        await writeFile(join(vencord, "scripts", "build", "build.mjs"), "// fixture\n", "utf8");

        await git(userplugins, "clone", upstream, checkout);
        await git(checkout, "switch", "-C", "main", v4112);
        await git(checkout, "update-ref", "refs/remotes/origin/main", v4112);
        return { vencord, userplugins, checkout };
    }

    function engine(vencord: string, userplugins: string, buildVencord: () => Promise<void>) {
        return createOrionUpdateEngine({
            userpluginsDir: userplugins,
            vencordSrcDir: vencord,
            officialRepo: upstream,
            buildVencord,
            buildCommand: "node scripts/build/build.mjs",
            now: () => 1234,
            randomSuffix: () => "fixture"
        });
    }

    return {
        root,
        upstream,
        v4112,
        v4114,
        cloneInstalled,
        engine,
        cleanup: () => rm(root, { recursive: true, force: true })
    };
}

async function testRewriteRecovery(): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), "questui-orion-rewrite-"));
    try {
        const upstream = join(root, "upstream");
        await mkdir(upstream, { recursive: true });
        await git(upstream, "init", "--initial-branch=main");
        await git(upstream, "config", "user.email", "questui-test@example.invalid");
        await git(upstream, "config", "user.name", "QuestUI updater test");

        await writeOrionSource(upstream, "v4.11.1", "export const marker = \"base\";");
        const base = await commitAll(upstream, "base");

        await writeOrionSource(upstream, "v4.11.2", "export const marker = \"old-history\";");
        const oldMain = await commitAll(upstream, "old v4.11.2");
        await git(upstream, "tag", "v4.11.2");

        const vencord = join(root, "vencord");
        const userplugins = join(vencord, "src", "userplugins");
        const checkout = join(userplugins, "OrionQuests");
        await mkdir(join(vencord, "scripts", "build"), { recursive: true });
        await mkdir(userplugins, { recursive: true });
        await writeFile(join(vencord, "package.json"), "{}\n", "utf8");
        await writeFile(join(vencord, "scripts", "build", "build.mjs"), "// fixture\n", "utf8");
        await git(userplugins, "clone", upstream, checkout);

        await git(upstream, "reset", "--hard", base);
        await writeOrionSource(upstream, "v4.11.4", "export const marker = \"rewritten-history\";");
        const rewrittenMain = await commitAll(upstream, "rewritten v4.11.4");
        await git(upstream, "tag", "v4.11.4");

        assert.equal(await git(checkout, "rev-parse", "HEAD"), oldMain);
        assert.equal(await git(checkout, "rev-parse", "refs/remotes/origin/main"), oldMain);

        const updater = createOrionUpdateEngine({
            userpluginsDir: userplugins,
            vencordSrcDir: vencord,
            officialRepo: upstream,
            buildVencord: async () => undefined,
            buildCommand: "node scripts/build/build.mjs",
            now: () => 5678,
            randomSuffix: () => "rewrite"
        });

        const result = await updater.updateRelease("v4.11.2", "v4.11.4");
        assert.equal(result.status, "updated");
        assert.equal(result.ok, true);
        assert.equal(result.method, "rewrite-reset");
        assert.match((result.trace ?? []).join("\n"), /history rewrite/i);
        assert.match((result.trace ?? []).join("\n"), /git reset --hard/);
        assert.equal(await git(checkout, "rev-parse", "HEAD"), rewrittenMain);
        assert.equal(await git(checkout, "rev-parse", "refs/remotes/origin/main"), rewrittenMain);
        await assertNoTemporaryRefs(checkout);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

async function main(): Promise<void> {
    const fixture = await setupFixture();
    try {
        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("success");
            let builds = 0;
            const updater = fixture.engine(vencord, userplugins, async () => { builds++; });
            const result = await updater.updateRelease("v4.11.2", "v4.11.4");

            assert.equal(result.status, "updated");
            assert.equal(result.ok, true);
            assert.equal(result.restartRequired, true);
            assert.equal(result.fromCommit, fixture.v4112);
            assert.equal(result.toCommit, fixture.v4114);
            assert.equal(result.method, "fast-forward");
            assert.match((result.trace ?? []).join("\n"), /git merge --ff-only/);
            assert.match((result.trace ?? []).join("\n"), /node scripts\/build\/build\.mjs/);
            assert.equal(builds, 1);
            assert.equal(await git(checkout, "branch", "--show-current"), "main");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4114);
            assert.match(await readFile(join(checkout, "index.tsx"), "utf8"), /v4\.11\.4/);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("detached");
            await git(checkout, "switch", "--detach", fixture.v4112);
            const updater = fixture.engine(vencord, userplugins, async () => undefined);
            const result = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(result.status, "custom-checkout");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4112);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("dirty-keep");
            await appendFile(join(checkout, "index.tsx"), "// local edit\n", "utf8");
            const updater = fixture.engine(vencord, userplugins, async () => undefined);

            const pending = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(pending.status, "decision-required");
            assert.match(pending.decision?.summary ?? "", /changes:/);
            assert.ok(pending.decision?.token);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4112);
            assert.match(await readFile(join(checkout, "index.tsx"), "utf8"), /local edit/);

            const kept = await updater.updateRelease(
                "v4.11.2",
                "v4.11.4",
                { action: "keep", token: pending.decision!.token }
            );
            assert.equal(kept.status, "kept");
            assert.equal(kept.method, "keep");
            assert.match((kept.trace ?? []).join("\n"), /Decision: Keep/);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4112);
            assert.match(await readFile(join(checkout, "index.tsx"), "utf8"), /local edit/);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("dirty-discard");
            const extra = join(checkout, "LOCAL_NOTE.txt");
            await appendFile(join(checkout, "index.tsx"), "// discard me\n", "utf8");
            await writeFile(extra, "discard me too\n", "utf8");

            let builds = 0;
            const updater = fixture.engine(vencord, userplugins, async () => { builds++; });
            const pending = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(pending.status, "decision-required");
            assert.match(pending.decision?.summary ?? "", /LOCAL_NOTE\.txt/);

            const updated = await updater.updateRelease(
                "v4.11.2",
                "v4.11.4",
                { action: "discard", token: pending.decision!.token }
            );
            assert.equal(updated.status, "updated");
            assert.equal(updated.ok, true);
            assert.equal(updated.method, "discard-reset");
            assert.match((updated.trace ?? []).join("\n"), /git reset --hard/);
            assert.match((updated.trace ?? []).join("\n"), /git clean -fd/);
            assert.equal(builds, 1);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4114);
            assert.equal((await git(checkout, "status", "--porcelain", "--untracked-files=all")), "");
            await assert.rejects(readFile(extra, "utf8"));
            await assertNoTemporaryRefs(checkout);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("dirty-stale-decision");
            await appendFile(join(checkout, "index.tsx"), "// first local edit\n", "utf8");
            const updater = fixture.engine(vencord, userplugins, async () => undefined);

            const pending = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(pending.status, "decision-required");

            // Keep the same porcelain status while changing bytes. Consent must be bound to content,
            // not just the fact that index.tsx still reports as modified.
            await appendFile(join(checkout, "index.tsx"), "// changed after prompt\n", "utf8");

            const stale = await updater.updateRelease(
                "v4.11.2",
                "v4.11.4",
                { action: "discard", token: pending.decision!.token }
            );
            assert.equal(stale.status, "decision-stale");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4112);
            assert.match(await readFile(join(checkout, "index.tsx"), "utf8"), /changed after prompt/);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("wrong-origin");
            const otherOrigin = join(fixture.root, "other-origin");
            await mkdir(otherOrigin, { recursive: true });
            await git(otherOrigin, "init", "--initial-branch=main");
            await git(checkout, "remote", "set-url", "origin", otherOrigin);
            const updater = fixture.engine(vencord, userplugins, async () => undefined);
            const result = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(result.status, "wrong-origin");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4112);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("source-mismatch");
            await writeOrionSource(checkout, "v4.11.1", "export const marker = \"local-version\";");
            await git(checkout, "config", "user.email", "questui-test@example.invalid");
            await git(checkout, "config", "user.name", "QuestUI updater test");
            await commitAll(checkout, "local version mismatch");
            const localHead = await git(checkout, "rev-parse", "HEAD");

            const updater = fixture.engine(vencord, userplugins, async () => undefined);
            const result = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(result.status, "source-mismatch");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), localHead);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("diverged");
            await appendFile(join(checkout, "index.tsx"), "export const localOnly = true;\n", "utf8");
            await git(checkout, "config", "user.email", "questui-test@example.invalid");
            await git(checkout, "config", "user.name", "QuestUI updater test");
            await commitAll(checkout, "local commit");
            const localHead = await git(checkout, "rev-parse", "HEAD");

            let builds = 0;
            const updater = fixture.engine(vencord, userplugins, async () => { builds++; });
            const pending = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(pending.status, "decision-required");
            assert.equal(pending.decision?.localCommitCount, 1);
            assert.match(pending.decision?.summary ?? "", /1 local commit/);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), localHead);

            const updated = await updater.updateRelease(
                "v4.11.2",
                "v4.11.4",
                { action: "discard", token: pending.decision!.token }
            );
            assert.equal(updated.status, "updated");
            assert.equal(updated.ok, true);
            assert.equal(builds, 1);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4114);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("off-main-target");
            const updater = fixture.engine(vencord, userplugins, async () => undefined);
            const result = await updater.updateRelease("v4.11.2", "v4.11.5");
            assert.equal(result.status, "target-mismatch");
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4112);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("rollback-success");
            let builds = 0;
            const updater = fixture.engine(vencord, userplugins, async () => {
                builds++;
                if (builds === 1) throw new Error("target build failed");
            });

            const result = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(result.status, "build-failed");
            assert.equal(result.ok, false);
            assert.equal(builds, 2);
            assert.match(result.diagnostic ?? "", /target build failed/);
            assert.match((result.trace ?? []).join("\n"), /Build: failed/);
            assert.match((result.trace ?? []).join("\n"), /Rollback build: completed successfully/);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4112);
            assert.equal(await git(checkout, "branch", "--show-current"), "main");
            await assertNoTemporaryRefs(checkout);
        }

        {
            const { vencord, userplugins, checkout } = await fixture.cloneInstalled("rollback-failure");
            let builds = 0;
            const updater = fixture.engine(vencord, userplugins, async () => {
                builds++;
                throw new Error(builds === 1 ? "target build failed" : "rollback build failed");
            });

            const result = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(result.status, "rollback-failed");
            assert.equal(result.ok, false);
            assert.match(result.diagnostic ?? "", /target build failed/);
            assert.match(result.diagnostic ?? "", /rollback build failed/);
            assert.equal(await git(checkout, "rev-parse", "HEAD"), fixture.v4112);
            await assertNoTemporaryRefs(checkout);
        }

        {
            const { vencord, userplugins } = await fixture.cloneInstalled("busy");
            let entered!: () => void;
            let unblock!: () => void;
            const buildEntered = new Promise<void>(resolveEntered => { entered = resolveEntered; });
            const gate = new Promise<void>(resolveGate => { unblock = resolveGate; });
            const updater = fixture.engine(vencord, userplugins, async () => {
                entered();
                await gate;
            });

            const first = updater.updateRelease("v4.11.2", "v4.11.4");
            await buildEntered;
            const second = await updater.updateRelease("v4.11.2", "v4.11.4");
            assert.equal(second.status, "busy");
            unblock();
            assert.equal((await first).status, "updated");
        }

        {
            const { vencord, userplugins } = await fixture.cloneInstalled("invalid-version");
            const updater = fixture.engine(vencord, userplugins, async () => undefined);
            assert.equal((await updater.updateRelease("v4.11.4", "v4.11.2")).status, "invalid-version");
        }

        await testRewriteRecovery();

        console.log("QuestUI Orion managed updater integration tests — PASS");
    } finally {
        await fixture.cleanup();
    }
}

void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
