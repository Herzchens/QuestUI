import assert from "node:assert/strict";

import {
    getDashboardNotice,
    pushDashboardNotice,
    resetDashboardNotices,
    subscribeDashboardNotice
} from "../../src/dashboard/notifications";

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

let scheduled: (() => void) | null = null;
let clearedTimer: unknown = null;
let notifications = 0;

(globalThis as any).setTimeout = (callback: () => void) => {
    scheduled = callback;
    return 12345;
};
(globalThis as any).clearTimeout = (timer: unknown) => {
    clearedTimer = timer;
    scheduled = null;
};

const unsubscribe = subscribeDashboardNotice(() => {
    notifications++;
});

try {
    pushDashboardNotice({ tone: "info", text: "Update available", duration: 2400 });
    assert.deepEqual(getDashboardNotice(), {
        id: 1,
        tone: "info",
        text: "Update available"
    });
    assert.equal(notifications, 1);
    assert.equal(typeof scheduled, "function");

    resetDashboardNotices();
    assert.equal(getDashboardNotice(), null);
    assert.equal(clearedTimer, 12345);
    assert.equal(scheduled, null);
    assert.equal(notifications, 2);

    resetDashboardNotices();
    assert.equal(notifications, 2);

    pushDashboardNotice({ tone: "success", text: "Done", duration: 0 });
    assert.equal(getDashboardNotice()?.text, "Done");
    assert.equal(notifications, 3);
    assert.equal(scheduled, null);

    resetDashboardNotices();
    assert.equal(getDashboardNotice(), null);
    assert.equal(notifications, 4);
} finally {
    unsubscribe();
    resetDashboardNotices();
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
}

console.log("QuestUI Dashboard notice lifecycle tests - PASS");
