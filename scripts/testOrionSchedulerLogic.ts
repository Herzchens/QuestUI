import assert from "node:assert/strict";

import {
    normalizeOrionSchedulerSnapshot,
    schedulerLaneCopy,
    schedulerQuestEntries
} from "../orionSchedulerLogic";

const snapshot = normalizeOrionSchedulerSnapshot({
    lanes: {
        game: { limit: 2, running: 1, waiting: 2 },
        video: { limit: 1, running: 1, waiting: 0 }
    },
    quests: {
        "q-video": { lane: "video", state: "running" },
        "q-wait-2": { lane: "game", state: "waiting" },
        "q-run": { lane: "game", state: "running" },
        "q-wait-1": { lane: "game", state: "waiting" }
    }
});
assert.ok(snapshot);
assert.equal(schedulerLaneCopy(snapshot.lanes.game), "1/2 running · 2 waiting");
assert.equal(schedulerLaneCopy({ limit: null, running: 0, waiting: 0 }), "Idle");
assert.deepEqual(schedulerQuestEntries(snapshot).map(([id]) => id), ["q-run", "q-wait-1", "q-wait-2", "q-video"]);

assert.equal(normalizeOrionSchedulerSnapshot({
    lanes: { game: { limit: null, running: 1, waiting: 0 }, video: { limit: null, running: 0, waiting: 0 } },
    quests: { q: { lane: "game", state: "running" } }
}), null);
assert.equal(normalizeOrionSchedulerSnapshot({
    lanes: { game: { limit: 1, running: 0, waiting: 0 }, video: { limit: null, running: 0, waiting: 0 } },
    quests: { q: { lane: "game", state: "running" } }
}), null);
assert.equal(normalizeOrionSchedulerSnapshot({
    lanes: { game: { limit: 1, running: 2, waiting: 0 }, video: { limit: null, running: 0, waiting: 0 } },
    quests: {}
}), null);

console.log("Orion scheduler metadata logic tests passed.");
