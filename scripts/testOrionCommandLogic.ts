import assert from "node:assert/strict";

import { isCompatibleOrionCommand, isCompatibleOrionCompanion } from "../orionCommandLogic";

const STRING = 3;

function command(overrides: Record<string, unknown> = {}) {
    return {
        name: "orion",
        plugin: "OrionQuests",
        isVencordCommand: true,
        execute() { },
        options: [{
            name: "action",
            description: "Action to perform",
            type: STRING,
            required: true,
            choices: [
                { name: "start", value: "start", label: "Start" },
                { name: "stop", value: "stop", label: "Stop" },
                { name: "status", value: "status", label: "Status" }
            ]
        }],
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
    { name: "action", type: STRING, required: true, choices: [{ value: "start" }] }
] }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ options: [
    { name: "action", type: STRING, required: true, choices: [{ value: "start" }, { value: "stop" }] },
    { name: "action", type: STRING, required: true, choices: [{ value: "start" }, { value: "stop" }] }
] }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ options: [
    { name: "action", type: 5, required: true, choices: [{ value: "start" }, { value: "stop" }] }
] }), STRING), false);
assert.equal(isCompatibleOrionCommand(command({ options: [
    { name: "action", type: STRING, required: false, choices: [{ value: "start" }, { value: "stop" }] }
] }), STRING), false);
assert.equal(isCompatibleOrionCommand(null, STRING), false);

const companion = {
    getEngineRunning: () => false,
    subscribeEngineRunning: () => () => { },
    controlEngine: async () => "Started."
};
assert.equal(isCompatibleOrionCompanion(companion), true);
assert.equal(isCompatibleOrionCompanion({ ...companion, getEngineRunning: false }), false);
assert.equal(isCompatibleOrionCompanion({ ...companion, subscribeEngineRunning: null }), false);
assert.equal(isCompatibleOrionCompanion({ ...companion, controlEngine: undefined }), false);
assert.equal(isCompatibleOrionCompanion(null), false);

console.log("QuestUI Orion command/companion logic tests — PASS");
