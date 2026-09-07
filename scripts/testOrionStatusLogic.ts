import assert from "node:assert/strict";

import {
    deriveOrionIntegrationHealth,
    isKnownOrionVersionIncompatible,
    ORION_MIN_COMPANION_VERSION,
    parseOrionVersion
} from "../orionStatusLogic";

const compatibleFacts = {
    installed: true,
    enabled: true,
    integrationEnabled: true,
    started: true,
    version: "v4.10.12",
    commandCompatible: true,
    companionCompatible: true,
    snapshotCompatible: true
};

assert.equal(ORION_MIN_COMPANION_VERSION, "4.10.7");
assert.deepEqual(parseOrionVersion("v4.10.7"), [4, 10, 7]);
assert.deepEqual(parseOrionVersion("4.10.12"), [4, 10, 12]);
assert.equal(parseOrionVersion("dev-main"), null);
assert.equal(parseOrionVersion("v4.10.7-beta.1"), null);
assert.equal(parseOrionVersion(undefined), null);

assert.equal(isKnownOrionVersionIncompatible("v4.10.6"), true);
assert.equal(isKnownOrionVersionIncompatible("v4.10.7"), false);
assert.equal(isKnownOrionVersionIncompatible("v4.10.12"), false);
assert.equal(isKnownOrionVersionIncompatible("v5.0.0"), false);
assert.equal(isKnownOrionVersionIncompatible("dev-main"), false);

assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, installed: false }).kind, "not-installed");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, enabled: false }).kind, "disabled");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, integrationEnabled: false }).kind, "integration-off");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, version: "v4.10.6" }).kind, "version-incompatible");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, started: false }).kind, "starting");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, commandCompatible: false }).kind, "integration-unavailable");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, companionCompatible: false }).kind, "integration-unavailable");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, snapshotCompatible: false }).kind, "integration-unavailable");
assert.equal(deriveOrionIntegrationHealth(compatibleFacts).kind, "connected");


// User intent and plugin enablement take precedence over compatibility diagnostics.
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, enabled: false, version: "v4.10.6" }).kind, "disabled");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, integrationEnabled: false, version: "v4.10.6" }).kind, "integration-off");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, started: false, companionCompatible: false }).kind, "starting");

// Unknown/dev versions are not rejected when the actual companion contract validates.
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, version: undefined }).kind, "connected");
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, version: "dev-main" }).kind, "connected");
// Officially old versions stay incompatible even if somebody backports the surface under the old version.
assert.equal(deriveOrionIntegrationHealth({ ...compatibleFacts, version: "v4.10.6" }).kind, "version-incompatible");

console.log("QuestUI Orion status/version logic tests — PASS");
