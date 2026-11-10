import assert from "node:assert/strict";

import { openQuestDashboard, registerQuestDashboardOpener } from "../../src/dashboard/open";

const calls: string[] = [];

assert.equal(openQuestDashboard(), false);

const removeSettings = registerQuestDashboardOpener("settings-bar", () => calls.push("settings"));
assert.equal(openQuestDashboard(), true);
assert.deepEqual(calls, ["settings"]);

const removeTop = registerQuestDashboardOpener("top-bar", () => calls.push("top"));
assert.equal(openQuestDashboard(), true);
assert.deepEqual(calls, ["settings", "top"]);

removeTop();
assert.equal(openQuestDashboard(), true);
assert.deepEqual(calls, ["settings", "top", "settings"]);

const replacement = () => calls.push("replacement");
const removeReplacement = registerQuestDashboardOpener("settings-bar", replacement);
removeSettings();
assert.equal(openQuestDashboard(), true);
assert.deepEqual(calls, ["settings", "top", "settings", "replacement"]);

removeReplacement();
assert.equal(openQuestDashboard(), false);

console.log("QuestUI Dashboard open routing logic tests - PASS");
