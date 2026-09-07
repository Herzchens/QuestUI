import assert from "node:assert/strict";

import { classifyVersionChannel } from "../versionChannel";

assert.equal(classifyVersionChannel("v1.1.2"), "stable");
assert.equal(classifyVersionChannel("4.11.2"), "stable");
assert.equal(classifyVersionChannel("v1.2.0-beta.2"), "prerelease");
assert.equal(classifyVersionChannel("v2.0.0-dev"), "prerelease");
assert.equal(classifyVersionChannel("v5.0.0-rc.1"), "prerelease");
assert.equal(classifyVersionChannel("dev-main"), "unknown");
assert.equal(classifyVersionChannel(undefined), "unknown");
assert.equal(classifyVersionChannel("abc123"), "unknown");

console.log("Version channel tests passed.");
