import assert from "node:assert/strict";

import {
    deriveOrbBalanceDisplayState,
    normalizeOrbBalance,
    shouldFetchOrbBalance
} from "../orbBalanceLogic";

assert.equal(normalizeOrbBalance(null), null);
assert.equal(normalizeOrbBalance(undefined), null);
assert.equal(normalizeOrbBalance(-1), null);
assert.equal(normalizeOrbBalance(1.5), null);
assert.equal(normalizeOrbBalance(Number.NaN), null);
assert.equal(normalizeOrbBalance(0), 0);
assert.equal(normalizeOrbBalance(2450), 2450);

assert.equal(shouldFetchOrbBalance(null, false, false), true);
assert.equal(shouldFetchOrbBalance(null, true, false), false);
assert.equal(shouldFetchOrbBalance(null, false, true), false);
assert.equal(shouldFetchOrbBalance(null, false, false, true), false);
assert.equal(shouldFetchOrbBalance(0, false, false), false);
assert.equal(shouldFetchOrbBalance(2450, false, false), false);

assert.deepEqual(deriveOrbBalanceDisplayState(null, false, false), { kind: "loading" });
assert.deepEqual(deriveOrbBalanceDisplayState(null, true, false), { kind: "loading" });
assert.deepEqual(deriveOrbBalanceDisplayState(null, false, true), { kind: "unavailable" });
assert.deepEqual(deriveOrbBalanceDisplayState(null, false, false, true), { kind: "unavailable" });
assert.deepEqual(deriveOrbBalanceDisplayState(0, false, false), { kind: "ready", balance: 0 });
assert.deepEqual(deriveOrbBalanceDisplayState(2450, false, true), { kind: "ready", balance: 2450 });

console.log("QuestUI Orb balance logic tests — PASS");
