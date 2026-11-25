import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";

// Source-level regression: selecting an event must not skip a theme hook.
// The actual Discord React runtime is not available in this test process.
const source = ts.createSourceFile(
    "EventLogViewer.tsx",
    readFileSync(new URL("../../src/eventLog/EventLogViewer.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
);
const panel = source.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "EventLogPanel");
assert.ok(panel?.body, "EventLogPanel must have a body");

const themeCalls: ts.CallExpression[] = [];
function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === "useDashboardThemeClassName") themeCalls.push(node);
    ts.forEachChild(node, visit);
}
visit(panel.body);
assert.equal(themeCalls.length, 1, "EventLogPanel must subscribe exactly once");

const call = themeCalls[0];
assert.ok(ts.isVariableDeclaration(call.parent) && call.parent.initializer === call,
    "Theme hook must be an unconditional variable initializer");
const statement = call.parent.parent.parent;
assert.ok(ts.isVariableStatement(statement) && statement.parent === panel.body,
    "Theme hook must be at component scope");
assert.equal(panel.body.statements[0], statement,
    "Theme subscription must precede every list/detail branch");

console.log("QuestUI Event Log theme hook order - PASS");
