import assert from "node:assert/strict";

import {
    ignoredQuestIdsForAccount,
    normalizeIgnoredQuestState,
    updateIgnoredQuestState
} from "../ignoredQuestLogic";

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

// The defensive per-account bound must never turn a newly requested Ignore into a
// false success. Once the account already retains 512 Quests, adding one more evicts
// the oldest retained Quest and keeps the newly ignored Quest.
let boundedQuestState = normalizeIgnoredQuestState(null);
for (let index = 0; index < 512; index++) {
    boundedQuestState = updateIgnoredQuestState(boundedQuestState, "bounded-account", `quest-${index}`, true);
}
assert.equal(ignoredQuestIdsForAccount(boundedQuestState, "bounded-account").length, 512);

boundedQuestState = updateIgnoredQuestState(boundedQuestState, "bounded-account", "quest-512", true);
const boundedQuestIds = ignoredQuestIdsForAccount(boundedQuestState, "bounded-account");
assert.equal(boundedQuestIds.length, 512);
assert.equal(boundedQuestIds.includes("quest-0"), false);
assert.equal(boundedQuestIds.includes("quest-512"), true);
assert.equal(boundedQuestIds[0], "quest-1");
assert.equal(boundedQuestIds.at(-1), "quest-512");

// Re-ignoring an already retained Quest at the bound must not evict an unrelated
// Quest or create a duplicate entry.
const beforeReignore = new Set(boundedQuestIds);
boundedQuestState = updateIgnoredQuestState(boundedQuestState, "bounded-account", "quest-256", true);
const afterReignore = ignoredQuestIdsForAccount(boundedQuestState, "bounded-account");
assert.equal(afterReignore.length, 512);
assert.equal(new Set(afterReignore).size, 512);
assert.deepEqual(new Set(afterReignore), beforeReignore);
assert.equal(afterReignore.at(-1), "quest-256");

// The defensive account bound follows the same rule: an Ignore for a 33rd account
// must retain the new account and evict the oldest retained account instead of
// reporting success while silently dropping the new preference.
let boundedAccountState = normalizeIgnoredQuestState(null);
for (let index = 0; index < 32; index++) {
    boundedAccountState = updateIgnoredQuestState(boundedAccountState, `account-${index}`, `quest-${index}`, true);
}
assert.equal(Object.keys(boundedAccountState.accounts).length, 32);

boundedAccountState = updateIgnoredQuestState(boundedAccountState, "account-32", "quest-32", true);
assert.equal(Object.keys(boundedAccountState.accounts).length, 32);
assert.equal(Object.hasOwn(boundedAccountState.accounts, "account-0"), false);
assert.deepEqual(ignoredQuestIdsForAccount(boundedAccountState, "account-32"), ["quest-32"]);
assert.deepEqual(ignoredQuestIdsForAccount(boundedAccountState, "account-1"), ["quest-1"]);

console.log("QuestUI ignored Quest logic tests — PASS");
