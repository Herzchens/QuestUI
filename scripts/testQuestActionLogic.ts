import assert from "node:assert/strict";

import { assessClaimResponse, isQuestVerificationError, selectClaimTarget } from "../questActionLogic";

assert.deepEqual(selectClaimTarget(undefined), { platform: 0, location: 25 });
assert.deepEqual(selectClaimTarget({ rewards: [], platforms: [] }), { platform: 0, location: 25 });
assert.deepEqual(selectClaimTarget({ rewards: [{ type: 4 }], platforms: [1, 2] }), { platform: 0, location: 11 });
assert.deepEqual(selectClaimTarget({ rewards: [{ type: 2 }], platforms: [3] }), { platform: 3, location: 11 });
assert.equal(selectClaimTarget({ rewards: [{ type: 2 }], platforms: [3, 4] }), null);
assert.equal(selectClaimTarget({ rewards: [{ type: 2 }], platforms: [] }), null);
assert.deepEqual(selectClaimTarget({ rewards: [{ type: 2 }, { type: 3 }], platforms: [4] }), { platform: 0, location: 11 });
assert.deepEqual(selectClaimTarget({ rewards: [{ type: 2 }, { type: 5 }], platforms: [4] }), { platform: 0, location: 11 });
assert.equal(selectClaimTarget({ rewards: [{ type: 99 }], platforms: [0] }), null);
assert.equal(selectClaimTarget({ rewards: [{ type: 4 }], platforms: [5] }), null);
assert.equal(selectClaimTarget({ rewards: "unexpected", platforms: [] }), null);
assert.equal(selectClaimTarget({ rewards: [{ type: 4 }], platforms: "desktop" }), null);

assert.equal(assessClaimResponse({ status: 200, body: { claimed_at: "2026-08-17T12:00:00Z", errors: [] } }), "success");
assert.equal(assessClaimResponse({ body: { user_status: { claimed_at: "2026-08-17T12:00:00Z" }, errors: [] } }), "success");
assert.equal(assessClaimResponse({ status: "202", body: { errors: [] } }), "pending");
assert.equal(assessClaimResponse({ body: { errors: [{ message: "nope" }] } }), "reward-errors");
assert.equal(assessClaimResponse({ status: 409, body: { claimed_at: "2026-08-17T12:00:00Z", errors: [] } }), "invalid");
assert.equal(assessClaimResponse({ response: { statusCode: 500, body: { errors: [] } } }), "invalid");
assert.equal(assessClaimResponse({ body: {} }), "invalid");
assert.equal(assessClaimResponse(null), "invalid");

const captchaCancel = new Error("cancelled");
captchaCancel.name = "CaptchaCancelError";
assert.equal(isQuestVerificationError(captchaCancel), true);
assert.equal(isQuestVerificationError({ body: { captcha_key: ["required"] } }), true);
assert.equal(isQuestVerificationError({ captchaFields: { captcha_sitekey: "site" } }), true);
assert.equal(isQuestVerificationError(new Error("ordinary")), false);

console.log("QuestUI quest-action logic tests — PASS");
