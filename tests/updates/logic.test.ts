import assert from "node:assert/strict";

import {
    compareSemver,
    nextUpdateHealthTimestamps,
    normalizeUpdateCheckHours,
    normalizeUpdateHealthTimestamps,
    normalizeUpdateCheckStep,
    parseSemver,
    selectLatestEligibleRelease,
    shouldRunScheduledUpdateCheck,
    updateCheckHoursFromStep,
    updateScheduleBaseline,
    updateCheckIntervalLabel,
    updateCheckMarkerLabel
} from "../../src/updates/logic";

function main() {
    assert.deepEqual(parseSemver("v1.4.1"), {
        raw: "v1.4.1",
        major: 1,
        minor: 4,
        patch: 1,
        prerelease: []
    });
    assert.deepEqual(parseSemver("1.5.0-beta.2"), {
        raw: "1.5.0-beta.2",
        major: 1,
        minor: 5,
        patch: 0,
        prerelease: ["beta", 2]
    });

    for (const invalid of ["v1.4", "v1.4.1-", "v1.4.1 beta", "release-1.4.1", "", null, undefined]) {
        assert.equal(parseSemver(invalid), null);
    }

    assert.equal(compareSemver("v1.4.1", "v1.4.0"), 1);
    assert.equal(compareSemver("v1.4.0", "v1.4.1"), -1);
    assert.equal(compareSemver("v1.4.1", "v1.4.1"), 0);
    assert.equal(compareSemver("v1.5.0-beta.2", "v1.5.0-beta.11"), -1);
    assert.equal(compareSemver("v1.5.0-beta.2", "v1.5.0-beta.alpha"), -1);
    assert.equal(compareSemver("v1.5.0", "v1.5.0-rc.9"), 1);

    const releases = [
        { tagName: "v1.4.2", draft: true, prerelease: false },
        { tagName: "v1.4.1", draft: false, prerelease: false },
        { tagName: "v1.5.0-beta.1", draft: false, prerelease: true },
        { tagName: "not-semver", draft: false, prerelease: false }
    ];

    assert.equal(
        selectLatestEligibleRelease(releases, "v1.4.0", false)?.tagName,
        "v1.4.1"
    );
    assert.equal(
        selectLatestEligibleRelease(releases, "v1.4.0", true)?.tagName,
        "v1.5.0-beta.1"
    );

    // Never "upgrade" from a newer prerelease to an older stable release.
    assert.equal(
        selectLatestEligibleRelease(
            [{ tagName: "v1.4.9", draft: false, prerelease: false }],
            "v1.5.0-beta.1",
            false
        ),
        null
    );

    // A same-version stable release is newer than its prerelease.
    assert.equal(
        selectLatestEligibleRelease(
            [{ tagName: "v1.5.0", draft: false, prerelease: false }],
            "v1.5.0-rc.1",
            false
        )?.tagName,
        "v1.5.0"
    );

    assert.equal(normalizeUpdateCheckStep(2), 2);
    assert.equal(normalizeUpdateCheckStep(999), 2);
    assert.equal(updateCheckHoursFromStep(0), 0);
    assert.equal(updateCheckHoursFromStep(2), 6);
    assert.equal(updateCheckHoursFromStep(5), 72);
    assert.equal(updateCheckHoursFromStep(6), 168);
    assert.equal(updateCheckMarkerLabel(5), "3d");
    assert.equal(updateCheckMarkerLabel(6), "7d");

    assert.equal(normalizeUpdateCheckHours(12), 12);
    assert.equal(normalizeUpdateCheckHours(999), 6);
    assert.equal(updateCheckIntervalLabel(0), "Manual only");
    assert.equal(updateCheckIntervalLabel(72), "3 days");
    assert.equal(updateCheckIntervalLabel(168), "7 days");

    const hour = 60 * 60 * 1000;
    assert.equal(shouldRunScheduledUpdateCheck(null, 1000, 6), true);
    assert.equal(shouldRunScheduledUpdateCheck(1000, 1000 + 5 * hour, 6), false);
    assert.equal(shouldRunScheduledUpdateCheck(1000, 1000 + 6 * hour, 6), true);
    assert.equal(shouldRunScheduledUpdateCheck(1000, 1000 + 999 * hour, 0), false);
    assert.equal(shouldRunScheduledUpdateCheck(1000, Number.NaN, 6), false);

    assert.deepEqual(
        normalizeUpdateHealthTimestamps({ lastSuccessfulCheckAt: 1234 }),
        { questUI: 1234, orion: 1234 }
    );
    assert.deepEqual(
        normalizeUpdateHealthTimestamps({
            lastSuccessfulCheckAt: 1234,
            questUILastSuccessfulCheckAt: null,
            orionLastSuccessfulCheckAt: 5678
        }),
        { questUI: null, orion: 5678 }
    );
    assert.deepEqual(
        normalizeUpdateHealthTimestamps({ lastSuccessfulCheckAt: null }),
        { questUI: null, orion: null }
    );

    const previousHealth = { questUI: 1000, orion: 2000 };
    assert.deepEqual(
        nextUpdateHealthTimestamps(previousHealth, 3000, true, true, true),
        { questUI: 3000, orion: 3000 }
    );
    assert.deepEqual(
        nextUpdateHealthTimestamps(previousHealth, 3000, true, true, false),
        { questUI: 3000, orion: 2000 }
    );
    assert.deepEqual(
        nextUpdateHealthTimestamps(previousHealth, 3000, false, true, true),
        { questUI: 1000, orion: 3000 }
    );
    assert.deepEqual(
        nextUpdateHealthTimestamps(previousHealth, 3000, false, true, false),
        previousHealth
    );
    assert.deepEqual(
        nextUpdateHealthTimestamps(previousHealth, 3000, true, false, false),
        { questUI: 3000, orion: 2000 }
    );

    assert.equal(updateScheduleBaseline({ questUI: 3000, orion: 1000 }, true), 1000);
    assert.equal(updateScheduleBaseline({ questUI: 3000, orion: null }, true), null);
    assert.equal(updateScheduleBaseline({ questUI: 3000, orion: null }, false), 3000);

    console.log("QuestUI Update Center release logic tests - PASS");
}

main();
