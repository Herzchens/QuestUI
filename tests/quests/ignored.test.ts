import assert from "node:assert/strict";

import {
    IgnoredQuestCapacityError,
    ignoredQuestIdsForAccount,
    normalizeIgnoredQuestState,
    pruneIgnoredQuestState,
    updateIgnoredQuestState
} from "../../src/quests/ignored/logic";

assert.deepEqual(normalizeIgnoredQuestState(null), { version: 1, accounts: {} });
assert.deepEqual(normalizeIgnoredQuestState({ accounts: { a: ["q1", "q1", "", 7, "q2"] } }), {
    version: 1,
    accounts: { a: ["q1", "q2"] }
});
assert.deepEqual(ignoredQuestIdsForAccount({ accounts: { a: ["q1", "q2"] } }, "a"), ["q1", "q2"]);
assert.deepEqual(ignoredQuestIdsForAccount({ accounts: { a: ["q1"] } }, null), []);

let state = updateIgnoredQuestState(null, "account-a", "quest-1", true);
state = updateIgnoredQuestState(state, "account-a", "quest-2", true);
state = updateIgnoredQuestState(state, "account-b", "quest-3", true);
assert.deepEqual(state, {
    version: 1,
    accounts: {
        "account-a": ["quest-1", "quest-2"],
        "account-b": ["quest-3"]
    }
});

state = updateIgnoredQuestState(state, "account-a", "quest-1", false);
assert.deepEqual(ignoredQuestIdsForAccount(state, "account-a"), ["quest-2"]);
assert.deepEqual(ignoredQuestIdsForAccount(state, "account-b"), ["quest-3"]);

state = updateIgnoredQuestState(state, "account-a", "quest-2", false);
assert.equal(Object.hasOwn(state.accounts, "account-a"), false);

// Reject a new exclusion at capacity rather than silently removing an old one.
let boundedQuestState = normalizeIgnoredQuestState(null);
for (let index = 0; index < 512; index++) {
    boundedQuestState = updateIgnoredQuestState(boundedQuestState, "bounded-account", `quest-${index}`, true);
}
assert.throws(() => updateIgnoredQuestState(boundedQuestState, "bounded-account", "quest-512", true), IgnoredQuestCapacityError);
const boundedQuestIds = ignoredQuestIdsForAccount(boundedQuestState, "bounded-account");
assert.equal(boundedQuestIds.length, 512);
assert.equal(boundedQuestIds[0], "quest-0");
assert.equal(boundedQuestIds.at(-1), "quest-511");

// Re-ignoring an already retained Quest at the bound must not evict an unrelated
// Quest or create a duplicate entry.
const beforeReignore = new Set(boundedQuestIds);
boundedQuestState = updateIgnoredQuestState(boundedQuestState, "bounded-account", "quest-256", true);
const afterReignore = ignoredQuestIdsForAccount(boundedQuestState, "bounded-account");
assert.equal(afterReignore.length, 512);
assert.equal(new Set(afterReignore).size, 512);
assert.deepEqual(new Set(afterReignore), beforeReignore);
assert.equal(afterReignore.at(-1), "quest-256");

// At the account limit, preserve all existing preferences.
let boundedAccountState = normalizeIgnoredQuestState(null);
for (let index = 0; index < 32; index++) {
    boundedAccountState = updateIgnoredQuestState(boundedAccountState, `account-${index}`, `quest-${index}`, true);
}
assert.throws(() => updateIgnoredQuestState(boundedAccountState, "account-32", "quest-32", true), IgnoredQuestCapacityError);
assert.equal(Object.keys(boundedAccountState.accounts).length, 32);
assert.deepEqual(ignoredQuestIdsForAccount(boundedAccountState, "account-0"), ["quest-0"]);
assert.deepEqual(ignoredQuestIdsForAccount(boundedAccountState, "account-1"), ["quest-1"]);
boundedAccountState = updateIgnoredQuestState(boundedAccountState, "account-0", "quest-0", false);
boundedAccountState = updateIgnoredQuestState(boundedAccountState, "account-32", "quest-32", true);
assert.deepEqual(ignoredQuestIdsForAccount(boundedAccountState, "account-32"), ["quest-32"]);

const expiryState = {
    version: 1,
    accounts: {
        "account-a": ["active", "expired-a", "expired-b"],
        "account-b": ["expired-a"]
    }
} as const;

const prunedExpiryState = pruneIgnoredQuestState(
    expiryState,
    "account-a",
    ["expired-a", "expired-b"]
);
assert.deepEqual(ignoredQuestIdsForAccount(prunedExpiryState, "account-a"), ["active"]);
assert.deepEqual(ignoredQuestIdsForAccount(prunedExpiryState, "account-b"), ["expired-a"]);
assert.deepEqual(
    pruneIgnoredQuestState(prunedExpiryState, "account-a", ["missing"]),
    prunedExpiryState
);

console.log("QuestUI ignored Quest logic tests - PASS");

import { terminalIgnoredQuestIds } from "../../src/quests/ignored/logic";
assert.deepEqual([...terminalIgnoredQuestIds([
    {id:"claimed",userStatus:{claimedAt:"2026-01-01"}},
    {id:"expired",config:{expiresAt:"2025-01-01"}},
    {id:"ready",userStatus:{completedAt:"2026-01-01"}},
    {id:"available",config:{}},
    {id:"invalid",userStatus:{claimedAt:"bad"}},
    {id:"future",config:{expiresAt:"2030-01-01"}}
],Date.parse("2026-02-01"))],["claimed","expired"]);
