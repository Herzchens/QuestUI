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

console.log("QuestUI ignored Quest logic tests — PASS");
