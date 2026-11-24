import assert from "node:assert/strict";
import { canLaunchQuestQuickOpen, questQuickOpenKind, questQuickOpenTarget } from "../../src/quests/quickOpen";

const id = "1516561474498203728";
for (const [key, kind] of [
    ["WATCH_VIDEO", "video"],
    ["PLAY_ACTIVITY", "activity"],
    ["ACHIEVEMENT_IN_ACTIVITY", "activity"]
] as const) {
    assert.equal(questQuickOpenKind(key), kind);
    assert.equal(questQuickOpenTarget(id, key), kind);
}

for (const key of [
    "ACHIEVEMENT_IN_GAME", "WATCH_VIDEO_ON_MOBILE", "PLAY_ON_DESKTOP",
    "PLAY_ON_DESKTOP_V2", "PLAY_ON_PLAYSTATION", "PLAY_ON_XBOX",
    "STREAM_ON_DESKTOP", "WATCH_VIDEO_FUTURE", "ACHIEVEMENT_OTHER",
    "ACTIVITY_OTHER", "play_activity", " WATCH_VIDEO ", "", null, undefined
]) {
    assert.equal(questQuickOpenKind(key), null);
    assert.equal(questQuickOpenTarget(id, key), null);
}

for (const invalid of [null, "", "unknown", "../shop", "https://example.com", id + "?token=x", 123]) {
    assert.equal(questQuickOpenTarget(invalid, "WATCH_VIDEO"), null);
}

assert.equal(canLaunchQuestQuickOpen("in-progress", "2026-11-24T00:00:00Z", false), true);
for (const status of ["available", "expired", "claimed", "claimable", null]) {
    assert.equal(canLaunchQuestQuickOpen(status, "2026-11-24T00:00:00Z", false), false);
}
assert.equal(canLaunchQuestQuickOpen("in-progress", null, false), false);
assert.equal(canLaunchQuestQuickOpen("in-progress", "2026-11-24T00:00:00Z", true), false);
assert.equal(canLaunchQuestQuickOpen("in-progress", "2026-11-24T00:00:00Z", undefined), false);

console.log("QuestUI Quick Open logic tests - PASS");
