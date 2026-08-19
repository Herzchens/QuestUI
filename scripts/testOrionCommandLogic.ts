import assert from "node:assert/strict";

import {
    isCompatibleOrionCommand,
    isCompatibleOrionCompanion,
    readCompatibleOrionSnapshot
} from "../orionCommandLogic";

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

console.log("QuestUI Orion command/companion logic tests — PASS");
