import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Vencord merges checks into definitions at import time with Object.assign.
// Extra check keys can therefore crash the entire renderer despite a successful build.
function validateSettings(source) {
    const ast = ts.createSourceFile("settings.ts", source, ts.ScriptTarget.Latest, true);
    const calls = [];
    function visit(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "definePluginSettings") {
            calls.push(node);
        }
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(calls.length, 1, "Expected exactly one definePluginSettings call");
    function keys(object) {
        assert.ok(object && ts.isObjectLiteralExpression(object), "Settings definitions/checks must be inspectable object literals");
        const result = new Set();
        for (const property of object.properties) {
            const name = property.name;
            assert.ok(name && (ts.isIdentifier(name) || ts.isStringLiteral(name)), "Unsupported settings key; update contract test");
            assert.ok(!result.has(name.text), "Duplicate settings key: " + name.text);
            result.add(name.text);
        }
        return result;
    }
    const [definitions, checks] = calls[0].arguments;
    const defined = keys(definitions);
    for (const key of checks ? keys(checks) : []) {
        assert.ok(defined.has(key), "Orphan settings check: " + key);
    }
}

assert.doesNotThrow(() => validateSettings("definePluginSettings({ live: {} }, { live: {} })"));
assert.throws(() => validateSettings("definePluginSettings({ live: {} }, { removed: {} })"), /Orphan settings check: removed/);
validateSettings(readFileSync(new URL("../../src/plugin/settings.ts", import.meta.url), "utf8"));
console.log("QuestUI settings bootstrap contract - PASS");
