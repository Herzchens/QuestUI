import assert from "node:assert/strict";

import {
    compareSemver,
    normalizeUpdateCheckHours,
    parseSemver,
    selectLatestEligibleRelease,
    shouldRunScheduledUpdateCheck,
    updateCheckIntervalLabel
} from "../updateLogic";
import { classifyVersionChannel } from "../versionChannel";

assert.equal(classifyVersionChannel("v1.1.2"), "stable");
assert.equal(classifyVersionChannel("4.11.2"), "stable");
assert.equal(classifyVersionChannel("v1.2.0-beta.2"), "prerelease");
assert.equal(classifyVersionChannel("v2.0.0-dev"), "prerelease");
assert.equal(classifyVersionChannel("v5.0.0-rc.1"), "prerelease");
assert.equal(classifyVersionChannel("dev-main"), "unknown");
assert.equal(classifyVersionChannel(undefined), "unknown");
assert.equal(classifyVersionChannel("abc123"), "unknown");

assert.deepEqual(parseSemver("v1.4.1"), {
    raw: "v1.4.1",
    major: 1,
    minor: 4,
    patch: 1,
    prerelease: []
});
assert.equal(parseSemver("main"), null);
assert.equal(compareSemver("v1.4.1", "v1.4.0"), 1);
assert.equal(compareSemver("v1.5.0-beta.1", "v1.5.0-beta.2"), -1);
assert.equal(compareSemver("v1.5.0-beta.2", "v1.5.0"), -1);
assert.equal(compareSemver("v1.5.0-rc.1", "v1.5.0-beta.9"), 1);
assert.equal(compareSemver("custom", "v1.0.0"), null);

assert.equal(normalizeUpdateCheckHours(6), 6);
assert.equal(normalizeUpdateCheckHours(168), 168);
assert.equal(normalizeUpdateCheckHours(2), 6);
assert.equal(updateCheckIntervalLabel(0), "Manual only");
assert.equal(updateCheckIntervalLabel(1), "1 hour");
assert.equal(updateCheckIntervalLabel(168), "7 days");
assert.equal(shouldRunScheduledUpdateCheck(null, 1_000, 6), true);
assert.equal(shouldRunScheduledUpdateCheck(1_000, 1_000 + 6 * 60 * 60 * 1000 - 1, 6), false);
assert.equal(shouldRunScheduledUpdateCheck(1_000, 1_000 + 6 * 60 * 60 * 1000, 6), true);
assert.equal(shouldRunScheduledUpdateCheck(null, 1_000, 0), false);

const releases = [
    { tagName: "v1.4.2", prerelease: false, draft: false },
    { tagName: "v1.5.0-beta.1", prerelease: true, draft: false },
    { tagName: "v1.5.0-beta.2", prerelease: true, draft: false },
    { tagName: "v1.6.0", prerelease: false, draft: true }
] as const;

assert.equal(selectLatestEligibleRelease(releases, "v1.4.1", false)?.tagName, "v1.4.2");
assert.equal(selectLatestEligibleRelease(releases, "v1.4.1", true)?.tagName, "v1.5.0-beta.2");
assert.equal(selectLatestEligibleRelease(releases, "v1.5.0-beta.3", false), null);
assert.equal(selectLatestEligibleRelease(
    [...releases, { tagName: "v1.5.0", prerelease: false, draft: false }],
    "v1.5.0-beta.3",
    false
)?.tagName, "v1.5.0");
assert.equal(selectLatestEligibleRelease(releases, "custom-main", true), null);

console.log("Version/update logic tests passed.");
