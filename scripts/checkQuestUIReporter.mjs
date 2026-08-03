import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const REQUIRED_SECTIONS = ["Bad Patches", "Bad Webpack Finds", "Bad Starts"];
const PATCH_PLUGINS = ["QuestUI", "GameActivityToggle"];
const WEBPACK_FIND_SIGNATURES = [
    'findStore("QuestStore")',
    'findByCode("\\"M7.5 21.7a8.95")',
    'findComponentByCode("badgePosition", "icon")',
    'findComponentByCode("keyboardShortcut", "positionKey")',
    'findComponentByCode("renderBadgeCount", "disableColor")'
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
    assert.match(analyzeReport(completeReport({ badWebpackFinds: '- ```\nfindStore("QuestStore")\n```\n' }), "", 1).problems.join("\n"), /QuestUI webpack lookup failed/);
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
