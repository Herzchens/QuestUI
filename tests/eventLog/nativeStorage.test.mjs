import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, symlink, truncate, appendFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { registerHooks, createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const root = await mkdtemp(join(tmpdir(), "questui-native-storage-"));
const stub = join(root, "electron-stub.cjs");
const previous = process.env.VENCORD_USER_DATA_DIR;
await writeFile(stub, "exports.app = {}; exports.shell = {};");
const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "electron") return { url: pathToFileURL(stub).href, format: "commonjs", shortCircuit: true };
        return nextResolve(specifier, context);
    }
});
const require = createRequire(import.meta.url);
const secret = "SYNTHETIC_CREDENTIAL_FOR_NATIVE_TEST";
const now = 1700000000000;
function row(id, accountId = "A", detail = {}) {
    return JSON.stringify({ schemaVersion: 1, id, accountId, timestamp: now, source: "questui", severity: "info",
        category: "diagnostic", captureSource: "questui", eventCode: "TEST", summary: "synthetic " + id, quest: null, detail });
}
try {
    process.env.VENCORD_USER_DATA_DIR = root;
    const lockPath = require.resolve("../../src/updates/transactionLock.ts");
    const firstLock = require(lockPath);
    const release = await firstLock.tryAcquireVencordUpdate(root);
    assert.equal(typeof release, "function");
    delete require.cache[lockPath];
    const secondLock = require(lockPath);
    assert.equal(await secondLock.tryAcquireVencordUpdate(root), null);
    release();
    const nextRelease = await secondLock.tryAcquireVencordUpdate(root);
    assert.equal(typeof nextRelease, "function");
    nextRelease();

    const native = require("../../src/eventLog/native.ts");
    const file = join(root, "QuestUI", "events.jsonl");
    await native.appendEvent(null, row("a", "A", { headers: [["authorization", secret]], password: secret }));
    await native.appendEvent(null, row("b", "B"));
    const disk = await readFile(file, "utf8");
    assert.ok(!disk.includes(secret));
    assert.equal(disk.trim().split("\n").length, 2);
    await assert.rejects(native.appendEvent(null, "invalid json"));
    await assert.rejects(native.appendEvent(null, row("c") + "\n" + row("d")));
    await assert.rejects(native.appendEvent(null, JSON.stringify({ ...JSON.parse(row("e")), schemaVersion: 2 })));
    assert.equal(await readFile(file, "utf8"), disk);
    assert.equal((await native.queryEvents(null, { accountId: "B" })).total, 1);
    await assert.rejects(native.queryEvents(null, { accountId: "x".repeat(129) }), /account filter/);

    // Mutations and reads must preserve submission order even when appends batch.
    const before = native.appendEvent(null, row("before"));
    const query = native.queryEvents(null, { accountId: "A" });
    const clear = native.clearEvents(null, "A");
    const after = native.appendEvent(null, row("after"));
    const result = await query;
    assert.ok(result.events.some(event => event.id === "before"));
    assert.ok(!result.events.some(event => event.id === "after"));
    await Promise.all([before, clear, after]);
    const final = await native.queryEvents(null, { limit: 100 });
    assert.deepEqual(new Set(final.events.map(event => event.id)), new Set(["after", "b"]));

    // Identical timestamp/id records remain individually traversable.
    await native.appendEvent(null, row("same", "A", { message: "one" }));
    await native.appendEvent(null, row("same", "A", { message: "two" }));
    const first = await native.queryEventPage(null, { query: "synthetic same", pageSize: 1 });
    assert.equal(first.events.length, 1);
    assert.ok(first.nextCursor);
    const second = await native.queryEventPage(null, { query: "synthetic same", pageSize: 1, sessionId: first.sessionId, cursor: first.nextCursor });
    assert.equal(second.events.length, 1);
    assert.notEqual(first.events[0].detail.message, second.events[0].detail.message);
    await native.releaseEventPageSession(null, first.sessionId);

    // Admission count is checked before the first filesystem write dispatches.
    const burst = await Promise.allSettled(Array.from({ length: 600 }, (_, i) => native.appendEvent(null, row("burst-" + i))));
    assert.equal(burst.filter(item => item.status === "fulfilled").length, 512);
    assert.equal(burst.filter(item => item.status === "rejected").length, 88);
    assert.equal((await native.queryEvents(null, { query: "synthetic burst-", limit: 1000 })).total, 512);
    assert.ok((await native.getLogInfo(null)).rejectedAppends >= 91);

    // Reuse a prepared snapshot across 16 distinct concurrent queries.
    const records = [];
    let bytes = 0;
    while (bytes < 9 * 1024 * 1024) {
        const line = row("benchmark-" + records.length, records.length % 2 ? "A" : "B", { message: "x".repeat(180) }) + "\n";
        if (bytes + Buffer.byteLength(line) > 9 * 1024 * 1024) break;
        records.push(line);
        bytes += Buffer.byteLength(line);
    }
    await writeFile(file, records.join(""));
    const started = performance.now();
    const queries = await Promise.all(Array.from({ length: 16 }, (_, i) => native.queryEvents(null, {
        accountId: "A", query: "benchmark-" + i, sort: i < 10 ? "newest" : "oldest", limit: 100
    })));
    assert.ok(queries.every(query => query.events.every(event => event.accountId === "A")));
    console.log(JSON.stringify({ nativeBenchmark: true, records: records.length, bytes, distinctQueries: 16, elapsedMs: Math.round(performance.now() - started) }));

    // Externally enlarged logs must not trigger an unbounded read/allocation.
    await truncate(file, 32 * 1024 * 1024);
    await appendFile(file, "\n" + row("survivor") + "\n");
    await assert.rejects(native.queryEvents(null), /read capacity/);
    await native.appendEvent(null, row("after-compaction"));
    assert.ok((await stat(file)).size <= 5 * 1024 * 1024);
    const compacted = await native.queryEvents(null);
    assert.deepEqual(new Set(compacted.events.map(event => event.id)), new Set(["survivor", "after-compaction"]));

    // A pre-existing symlink must never cause a write to a different file.
    if (process.platform !== "win32") {
        const target = join(root, "untouched.txt");
        await writeFile(target, "do not change");
        await rm(file);
        await symlink(target, file);
        await assert.rejects(native.appendEvent(null, row("link")));
        assert.equal(await readFile(target, "utf8"), "do not change");
    }
    console.log("Native Event Log storage boundary, redaction, ordering, pagination, admission and symlink: PASS");
} finally {
    hooks.deregister();
    if (previous === undefined) delete process.env.VENCORD_USER_DATA_DIR;
    else process.env.VENCORD_USER_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
}
