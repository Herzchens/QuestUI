import assert from "node:assert/strict";

import {
    attachChangeListenerSafely,
    classifyOptionalTimestamp,
    questAccessSuspensionState,
    storeWaitTimeoutResult
} from "../questActionRuntimeLogic";

assert.deepEqual(classifyOptionalTimestamp(undefined), { kind: "missing" });
assert.deepEqual(classifyOptionalTimestamp(null), { kind: "missing" });
assert.deepEqual(classifyOptionalTimestamp(""), { kind: "invalid" });
assert.deepEqual(classifyOptionalTimestamp("not-a-date"), { kind: "invalid" });
assert.deepEqual(classifyOptionalTimestamp({}), { kind: "invalid" });
assert.deepEqual(classifyOptionalTimestamp(Number.NaN), { kind: "invalid" });

const iso = "2026-08-18T00:00:00.000Z";
assert.deepEqual(classifyOptionalTimestamp(iso), { kind: "valid", time: Date.parse(iso) });
assert.deepEqual(classifyOptionalTimestamp(new Date(iso)), { kind: "valid", time: Date.parse(iso) });
assert.deepEqual(classifyOptionalTimestamp(Date.parse(iso)), { kind: "valid", time: Date.parse(iso) });

const now = Date.parse("2026-08-18T00:00:00.000Z");
assert.equal(questAccessSuspensionState(undefined, undefined, now), "clear");
assert.equal(questAccessSuspensionState(false, undefined, now), "clear");
assert.equal(questAccessSuspensionState(false, "2026-08-17T23:00:00.000Z", now), "clear");
assert.equal(questAccessSuspensionState(false, "2026-08-18T01:00:00.000Z", now), "blocked");
assert.equal(questAccessSuspensionState(true, undefined, now), "blocked");
assert.equal(questAccessSuspensionState(true, "2026-08-17T23:00:00.000Z", now), "blocked");
assert.equal(questAccessSuspensionState(false, "invalid", now), "invalid");
assert.equal(questAccessSuspensionState("yes", undefined, now), "invalid");

assert.equal(storeWaitTimeoutResult("user-a", "user-a"), "timeout");
assert.equal(storeWaitTimeoutResult("user-a", "user-b"), "account-changed");
assert.equal(storeWaitTimeoutResult("user-a", null), "account-changed");

{
    const listeners = new Set<() => void>();
    let finished = false;
    const store = {
        addChangeListener(listener: () => void) { listeners.add(listener); },
        removeChangeListener(listener: () => void) { listeners.delete(listener); }
    };
    const listener = () => { finished = true; };
    const detach = attachChangeListenerSafely(store, listener, () => finished);
    assert.equal(listeners.has(listener), true);
    detach();
    assert.equal(listeners.has(listener), false);
}

// Regression: if registration itself synchronously invokes the callback and completes the
// waiter, the helper must remove the newly registered listener after addChangeListener returns.
{
    const listeners = new Set<() => void>();
    let finished = false;
    const store = {
        addChangeListener(listener: () => void) {
            listeners.add(listener);
            listener();
        },
        removeChangeListener(listener: () => void) { listeners.delete(listener); }
    };
    const listener = () => { finished = true; };
    attachChangeListenerSafely(store, listener, () => finished);
    assert.equal(finished, true);
    assert.equal(listeners.has(listener), false);
}

// If registration throws after partially registering, compensating cleanup still runs.
{
    const listeners = new Set<() => void>();
    const store = {
        addChangeListener(listener: () => void) {
            listeners.add(listener);
            throw new Error("registration failed");
        },
        removeChangeListener(listener: () => void) { listeners.delete(listener); }
    };
    const listener = () => { };
    assert.throws(() => attachChangeListenerSafely(store, listener, () => false), /registration failed/);
    assert.equal(listeners.has(listener), false);
}

console.log("QuestUI quest-action runtime logic tests — PASS");
