import assert from "node:assert/strict";

import { normalizeOrionSchedulerSnapshot } from "../../src/orion/schedulerState";

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
assert.deepEqual(snapshot.lanes.game, { limit: 2, running: 1, waiting: 2 });
assert.deepEqual(snapshot.lanes.video, { limit: 1, running: 1, waiting: 0 });
assert.deepEqual(snapshot.quests["q-run"], { lane: "game", state: "running" });
assert.deepEqual(snapshot.quests["q-wait-1"], { lane: "game", state: "waiting" });
assert.deepEqual(snapshot.quests["q-video"], { lane: "video", state: "running" });

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
