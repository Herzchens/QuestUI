import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const REQUIRED_SECTIONS = ["Bad Patches", "Bad Webpack Finds", "Bad Starts"];
const PATCH_PLUGINS = ["QuestUI", "GameActivityToggle"];
// One entry per Discord webpack lookup QuestUI makes. Vencord PluginManager/Commands API
// lookups are normal imports and do not belong in this reporter list.
const WEBPACK_FIND_SIGNATURES = [
    'proxyLazyWebpack("QuestStore", "QuestsStore")',
    'findByCode("\\"M7.5 21.7a8.95")',
    'findComponentByCode(".HEADER_BAR_BADGE_BOTTOM,", "position:\\"bottom\\"")',
    'findComponentByCode("renderBadgeCount", "disableColor")',
    'findByCode("heartbeat?.lastBeatAt", "updatedAt", "eventName", "includeTaskTypes")',
    'findByCode("completedRatioDisplay", "roundingMode:\\"floor\\"", "completedRatio")',
    'findByCode("\\"game_tile\\"", "\\"quest_bar_hero\\"", "\\"video_player_thumbnail\\"")',
    'findComponentByCode("shouldUseThemeColor", "customSize", "loading")',
    'findByCode("QUESTS_ENROLL_BEGIN", "QUESTS_ENROLL_SUCCESS", "QUESTS_ENROLL_FAILURE", "previous_in_flight_request")',
    'findByCode("QUESTS_CLAIM_REWARD_BEGIN", "QUESTS_CLAIM_REWARD_SUCCESS", "QUESTS_CLAIM_REWARD_FAILURE", "traffic_metadata_sealed")',
    'findByCode("QUESTS_FETCH_CURRENT_QUESTS_BEGIN")'
];

function extractSection(report, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = report.match(new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
    return match?.[1] ?? null;
}

function analyzeReport(report, stderr = "", reporterExitCode = 0) {
    const problems = [];
    const warnings = [];

    if (!report.trim()) problems.push("report is empty");
    if (!/^# Vencord Report(?: \(Canary\))?\s*$/m.test(report)) problems.push("report header is missing");

    const sections = new Map();
    for (const name of REQUIRED_SECTIONS) {
        const section = extractSection(report, name);
        if (section == null) problems.push(`required section is missing: ${name}`);
        else sections.set(name, section);
    }

    const badPatches = sections.get("Bad Patches") ?? "";
    const badStarts = sections.get("Bad Starts") ?? "";
    const badWebpackFinds = sections.get("Bad Webpack Finds") ?? "";

    for (const plugin of PATCH_PLUGINS) {
        if (new RegExp(`^- ${plugin}(?: \\(|\\s*$)`, "m").test(badPatches)) {
            problems.push(`${plugin} appears in Bad Patches`);
        }
        if (new RegExp(`^- ${plugin}(?:\\s*$|\\s)`, "m").test(badStarts)) {
            problems.push(`${plugin} appears in Bad Starts`);
        }
    }

    for (const signature of WEBPACK_FIND_SIGNATURES) {
        if (badWebpackFinds.includes(signature)) {
            problems.push(`QuestUI webpack lookup failed: ${signature}`);
        }
    }

    const fatalPatterns = [
        /A fatal error occurred:/i,
        /Missing environment variable CHROMIUM_BIN/i,
        /No Chromium binary found/i,
        /TimeoutError/i,
        /TargetCloseError/i,
        /net::ERR_/i
    ];
    for (const pattern of fatalPatterns) {
        if (pattern.test(stderr)) problems.push(`reporter infrastructure failure matched ${pattern}`);
    }

    if (reporterExitCode !== 0 && problems.length === 0) {
        warnings.push(`reporter exited with ${reporterExitCode}, but only unrelated Vencord failures were found`);
    }

    return { problems, warnings };
}

function completeReport({ badPatches = "", badWebpackFinds = "", badStarts = "", canary = false } = {}) {
    return `# Vencord Report${canary ? " (Canary)" : ""}\n\n## Bad Patches\n${badPatches}\n## Bad Webpack Finds\n${badWebpackFinds}\n## Bad Starts\n${badStarts}\n## Discord Errors\n\n## Ignored Discord Errors\n`;
}

function runSelfTest() {
    assert.deepEqual(analyzeReport(completeReport()), { problems: [], warnings: [] });
    assert.match(analyzeReport(completeReport({ badPatches: "- QuestUI (had no effect)\n" }), "", 1).problems.join("\n"), /QuestUI appears in Bad Patches/);
    assert.match(analyzeReport(completeReport({ badPatches: "- GameActivityToggle (had no effect)\n" }), "", 1).problems.join("\n"), /GameActivityToggle appears in Bad Patches/);
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nproxyLazyWebpack("QuestStore", "QuestsStore")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nfindComponentByCode(".HEADER_BAR_BADGE_BOTTOM,", "position:\\"bottom\\"")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nfindByCode("heartbeat?.lastBeatAt", "updatedAt", "eventName", "includeTaskTypes")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nfindByCode("completedRatioDisplay", "roundingMode:\\"floor\\"", "completedRatio")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nfindByCode("\\"game_tile\\"", "\\"quest_bar_hero\\"", "\\"video_player_thumbnail\\"")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nfindComponentByCode("shouldUseThemeColor", "customSize", "loading")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nfindByCode("QUESTS_ENROLL_BEGIN", "QUESTS_ENROLL_SUCCESS", "QUESTS_ENROLL_FAILURE", "previous_in_flight_request")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nfindByCode("QUESTS_CLAIM_REWARD_BEGIN", "QUESTS_CLAIM_REWARD_SUCCESS", "QUESTS_CLAIM_REWARD_FAILURE", "traffic_metadata_sealed")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nfindByCode("QUESTS_FETCH_CURRENT_QUESTS_BEGIN")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
    assert.deepEqual(analyzeReport(completeReport({ badPatches: "- SomeOtherPlugin (had no effect)\n" }), "", 1), {
        problems: [],
        warnings: ["reporter exited with 1, but only unrelated Vencord failures were found"]
    });
    assert.ok(analyzeReport("not a report").problems.length > 0);
    assert.ok(analyzeReport(completeReport(), "TimeoutError: timed out", 1).problems.length > 0);
    console.log("checkQuestUIReporter self-test — PASS");
}

if (process.argv[2] === "--self-test") {
    runSelfTest();
    process.exit(0);
}

const [reportPath, stderrPath, exitCodeText] = process.argv.slice(2);
if (!reportPath || !stderrPath || exitCodeText == null) {
    console.error("Usage: node checkQuestUIReporter.mjs <report.md> <stderr.log> <reporter-exit-code>");
    process.exit(2);
}

let report;
let stderr;
try {
    report = readFileSync(reportPath, "utf8");
    stderr = readFileSync(stderrPath, "utf8");
} catch (error) {
    console.error(`Unable to read reporter output: ${error.message}`);
    process.exit(2);
}

const reporterExitCode = Number.parseInt(exitCodeText, 10);
if (!Number.isInteger(reporterExitCode)) {
    console.error(`Invalid reporter exit code: ${exitCodeText}`);
    process.exit(2);
}

const { problems, warnings } = analyzeReport(report, stderr, reporterExitCode);
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (problems.length) {
    for (const problem of problems) console.error(`ERROR: ${problem}`);
    process.exit(1);
}

console.log("QuestUI Patch Reporter checks — PASS");
