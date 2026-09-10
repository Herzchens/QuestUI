import assert from "node:assert/strict";

import {
    deriveGlobalOrionControl,
    deriveQuestOrionControl,
    farmableQuestIds,
    orionQuestProgressSource,
    storedQuestTaskProgress
} from "../orionControlLogic";
import type { OrionControlSnapshot } from "../orionCommandLogic";

const snapshot = (
    running: boolean,
    quests: OrionControlSnapshot["quests"] = {}
): OrionControlSnapshot => ({ running, quests });

const quest = (id: string, status: "available" | "in-progress" | "claimable" | "claimed" | "expired") => ({ id, status });

assert.deepEqual(
    farmableQuestIds([quest("a", "available"), quest("b", "in-progress"), quest("c", "claimable")]),
    ["a", "b"]
);

assert.deepEqual(
    deriveGlobalOrionControl(snapshot(false), []),
    { action: "start", smartDisabled: true, stopDisabled: true }
);
assert.deepEqual(
    deriveGlobalOrionControl(snapshot(false), ["a"]),
    { action: "start", smartDisabled: false, stopDisabled: true }
);
assert.deepEqual(
    deriveGlobalOrionControl(snapshot(false, { a: "paused" }), ["a"]),
    { action: "resume", smartDisabled: false, stopDisabled: true }
);
assert.deepEqual(
    deriveGlobalOrionControl(snapshot(true, { a: "running" }), ["a"]),
    { action: "pause", smartDisabled: false, stopDisabled: false }
);
assert.deepEqual(
    deriveGlobalOrionControl(snapshot(true, { a: "queued", b: "paused" }), ["a", "b"]),
    { action: "pause", smartDisabled: false, stopDisabled: false }
);
assert.deepEqual(
    deriveGlobalOrionControl(snapshot(true, { a: "paused", b: "paused" }), ["a", "b"]),
    { action: "resume", smartDisabled: false, stopDisabled: false }
);
assert.deepEqual(
    deriveGlobalOrionControl(snapshot(true), ["a"]),
    { action: "pause", smartDisabled: true, stopDisabled: false }
);
assert.deepEqual(
    deriveGlobalOrionControl(snapshot(true, { a: "running" }), []),
    { action: "start", smartDisabled: true, stopDisabled: true }
);

assert.deepEqual(deriveQuestOrionControl(snapshot(false), "a"), { action: "start", disabled: false });
assert.deepEqual(deriveQuestOrionControl(snapshot(false, { a: "paused" }), "a"), { action: "resume", disabled: false });
assert.deepEqual(deriveQuestOrionControl(snapshot(true, { a: "running" }), "a"), { action: "pause", disabled: false });
assert.deepEqual(deriveQuestOrionControl(snapshot(true, { a: "queued" }), "a"), { action: "pause", disabled: false });
assert.deepEqual(deriveQuestOrionControl(snapshot(true, { a: "paused" }), "a"), { action: "resume", disabled: false });
assert.deepEqual(deriveQuestOrionControl(snapshot(true), "a"), { action: "pause", disabled: true });

assert.equal(orionQuestProgressSource(null, "a"), "native");
assert.equal(orionQuestProgressSource(snapshot(true), "a"), "native");
assert.equal(orionQuestProgressSource(snapshot(false), "a"), "native");
assert.equal(orionQuestProgressSource(snapshot(true, { a: "running" }), "a"), "native");
assert.equal(orionQuestProgressSource(snapshot(true, { a: "queued" }), "a"), "stored");
assert.equal(orionQuestProgressSource(snapshot(true, { a: "paused" }), "a"), "stored");
assert.equal(orionQuestProgressSource(snapshot(false, { a: "stopped" }), "a"), "stored");
assert.equal(orionQuestProgressSource(snapshot(false, { a: "running" }), "a"), "stored");

const timedTask = { key: "PLAY_ON_DESKTOP", type: "play" as const, target: 900 };
assert.equal(storedQuestTaskProgress({ userStatus: { progress: { PLAY_ON_DESKTOP: { value: 321 } } } }, timedTask), 321);
assert.equal(storedQuestTaskProgress({
    config: { taskConfigV2: { tasks: { selected: { type: "PLAY_ON_DESKTOP" } } } },
    userStatus: { progress: { PLAY_ON_DESKTOP: { value: 444 } } }
}, { ...timedTask, key: "selected" }), 444);
assert.equal(storedQuestTaskProgress({ userStatus: { progress: new Map([["PLAY_ON_DESKTOP", { value: 222 }]]) } }, timedTask), 222);
assert.equal(storedQuestTaskProgress({ userStatus: { streamProgressSeconds: 77 } }, { key: "STREAM_ON_DESKTOP", type: "stream", target: 900 }), 77);
assert.equal(storedQuestTaskProgress({ userStatus: { completedAt: "now" } }, timedTask), 900);

console.log("QuestUI Orion control state tests — PASS");
