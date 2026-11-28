import { createSnapshotSource } from "../../src/quests/snapshotSource";
import { createControlSubscription } from "../../src/orion/controlSubscription";
import assert from "node:assert/strict";

import {
    isCompatibleOrionCommand,
    isCompatibleOrionCompanion,
    readCompatibleOrionSnapshot
} from "../../src/orion/companion";

const STRING = 3;

function command(overrides: Record<string, unknown> = {}) {
    return {
        name: "orion",
        plugin: "OrionQuests",
        isVencordCommand: true,
        execute() { },
        options: [
            {
                name: "action",
                description: "Action to perform",
                type: STRING,
                required: true,
                choices: [
                    { name: "start", value: "start", label: "Start" },
                    { name: "stop", value: "stop", label: "Stop" },
                    { name: "status", value: "status", label: "Status" },
                    { name: "pause", value: "pause", label: "Pause" },
                    { name: "resume", value: "resume", label: "Resume" }
                ]
            },
            {
                name: "quest",
                description: "Quest target",
                type: STRING,
                required: false
            }
        ],
        ...overrides
    };
}

assert.equal(isCompatibleOrionCommand(command(), STRING), true);
assert.equal(isCompatibleOrionCommand(command({ plugin: "AnotherPlugin" }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ isVencordCommand: false }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ name: "not-orion" }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ execute: null }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ options: [] }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ options: [
    { name: "action", type: STRING, required: true, choices: [{ value: "start" }, { value: "stop" }] }
] }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ options: [
    { name: "action", type: STRING, required: true, choices: [{ value: "start" }, { value: "stop" }, { value: "pause" }, { value: "resume" }] },
    { name: "action", type: STRING, required: true, choices: [{ value: "start" }, { value: "stop" }, { value: "pause" }, { value: "resume" }] }
] }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ options: [
    { name: "action", type: 5, required: true, choices: [{ value: "start" }, { value: "stop" }, { value: "pause" }, { value: "resume" }] }
] }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ options: [
    { name: "action", type: STRING, required: false, choices: [{ value: "start" }, { value: "stop" }, { value: "pause" }, { value: "resume" }] }
] }), STRING), false);
assert.equal(isCompatibleOrionCommand(null, STRING), false);

const companion = {
    getEngineRunning: () => false,
    subscribeEngineRunning: () => () => { },
    getControlSnapshot: () => ({ running: false, quests: { a: "paused" as const } }),
    subscribeControlState: () => () => { },
    controlEngine: async () => "Started.",
    controlAll: async () => "Paused 1 quest(s).",
    controlQuest: async () => "Paused \"Quest\"."
};
assert.equal(isCompatibleOrionCompanion(companion), true);
assert.deepEqual(readCompatibleOrionSnapshot(companion), { running: false, quests: { a: "paused" } });
assert.equal(isCompatibleOrionCompanion({ ...companion, getControlSnapshot: false }), false);
assert.equal(isCompatibleOrionCompanion({ ...companion, subscribeControlState: null }), false);
assert.equal(isCompatibleOrionCompanion({ ...companion, controlEngine: undefined }), false);
assert.equal(isCompatibleOrionCompanion({ ...companion, controlAll: undefined }), false);
assert.equal(isCompatibleOrionCompanion({ ...companion, controlQuest: undefined }), false);
assert.equal(isCompatibleOrionCompanion(null), false);
assert.equal(readCompatibleOrionSnapshot({ ...companion, getControlSnapshot: () => ({ running: "yes", quests: {} }) } as any), null);
assert.equal(readCompatibleOrionSnapshot({ ...companion, getControlSnapshot: () => ({ running: false, quests: { a: "mystery" } }) } as any), null);
assert.equal(readCompatibleOrionSnapshot({ ...companion, getControlSnapshot: () => { throw new Error("boom"); } } as any), null);

console.log("QuestUI Orion command/companion logic tests - PASS");

{
    let reads = 0;
    let bound: (() => void) | undefined;
    const store = { addChangeListener(cb: () => void) { bound = cb; }, removeChangeListener(cb: () => void) { if (bound === cb) bound = undefined; } };
    const source = createSnapshotSource(() => ++reads, () => store, 60_000);
    const values: number[] = [];
    const release = source.subscribe(value => values.push(value));
    assert.equal(reads, 0);
    source.start();
    const stale = bound!;
    assert.equal(reads, 1);
    source.stop();
    stale();
    assert.equal(reads, 1);
    source.start();
    stale();
    assert.equal(reads, 2);
    bound!();
    assert.equal(reads, 3);
    release();
    assert.equal(bound, undefined);
    source.stop();
    assert.deepEqual(values, [1, 2, 3]);
}
{
    const a = {}, b = {}, method = () => {};
    let owner = a;
    let callback: (() => void) | undefined;
    let active = 0;
    const hub = createControlSubscription(() => ({
        identity: owner, methods: [method], subscribe(listener) {
            active++;
            callback = listener;
            return () => { active--; };
        }
    }), 60_000);
    let changes = 0;
    const off = hub.subscribe(() => changes++);
    hub.start();
    const stale = callback!;
    const before = changes;
    owner = b;
    stale();
    assert.equal(changes, before);
    hub.reconcile();
    assert.equal(active, 1);
    assert.equal(changes, before + 1);
    stale();
    assert.equal(changes, before + 1);
    callback!();
    assert.equal(changes, before + 2);
    hub.stop();
    assert.equal(active, 0);
    hub.start();
    assert.equal(active, 1);
    off();
    assert.equal(active, 0);
    hub.stop();
}

{
    const identity = {};
    let attempts = 0, active = 0, failRelease = true;
    const hub = createControlSubscription(() => ({
        identity, methods: [], subscribe() {
            if (++attempts === 1) throw new Error("temporary");
            if (attempts === 2) return null;
            active++;
            return () => { if (failRelease) throw new Error("release"); active--; };
        }
    }), 60_000);
    const off = hub.subscribe(() => {});
    hub.start(); hub.reconcile(); hub.reconcile();
    assert.equal(attempts, 3); assert.equal(active, 1);
    assert.throws(hub.stop, /release/);
    failRelease = false; hub.stop(); assert.equal(active, 0);
    off();
}
{
    let active = 0;
    const hub = createControlSubscription(() => ({
        identity: {}, methods: [], subscribe() {
            active++; hub.stop(); return () => { active--; };
        }
    }), 60_000);
    const off = hub.subscribe(() => {});
    hub.start(); assert.equal(active, 0); off();
}
{
    let active = 0, fail = true;
    const store = { addChangeListener() { active++; }, removeChangeListener() { if (fail) throw new Error("detach"); active--; } };
    const source = createSnapshotSource(() => 1, () => store, 60_000);
    const off = source.subscribe(() => {});
    source.start(); assert.throws(source.stop, /detach/);
    fail = false; source.stop(); assert.equal(active, 0); off();
}
