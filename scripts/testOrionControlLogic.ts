import assert from "node:assert/strict";

import {
    deriveGlobalOrionControl,
    deriveQuestOrionControl,
    farmableQuestIds
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

console.log("QuestUI Orion control state tests — PASS");
