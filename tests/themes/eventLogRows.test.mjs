// Exercise the actual registry-ordered styles against the EventLogViewer row
// structure and the virtual slot heights used by presentation.tsx.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const registry = read("../../src/themes/registry.ts");
const presentation = read("../../src/eventLog/presentation.tsx");
const height = name => {
    const value = Number(presentation.match(new RegExp("const " + name + " = (\\d+);"))?.[1]);
    assert.ok(value > 0, name + " not found");
    return value;
};
const standard = height("EVENT_LOG_EVENT_ROW_HEIGHT");
const other = height("EVENT_LOG_ACCOUNT_ROW_HEIGHT");
const imports = new Map([...registry.matchAll(/import\s+(\w+)\s+from\s+"\.\/([^"]+)\?managed";/g)].map(m => [m[1], m[2]]));
const chrome = process.env.CHROME_BIN || ["google-chrome", "chromium", "chromium-browser"].find(n => spawnSync(n, ["--version"], { encoding: "utf8" }).status === 0);
assert.ok(chrome, "Chrome/Chromium not found");
const cases = [
    { id: "short", message: "Cycle started" },
    { id: "diagnostic", message: '<span class="quest-ui-event-semantic is-diagnostic">[Bypass]</span> Achievement OAuth bypass is off in settings; skipping "Dune: Part Three". Enable it in OrionQuests settings.', bug: true },
    { id: "unbroken", message: "LongDiagnosticIdentifier".repeat(24), bug: true, legacy: true },
    { id: "other-account", message: "HTTP 503: " + "A long diagnostic message with semantic highlighting. ".repeat(12), bug: true, account: "VeryLongDiscordUsername".repeat(5) }
];
const row = (entry, top) => {
    const h = entry.account ? other : standard;
    return '<div class="quest-ui-event-virtual-item" data-case="' + entry.id + '" style="top:' + top + 'px;height:' + h + 'px"><article class="quest-ui-event-row is-warning is-category-diagnostic"><div class="quest-ui-event-time-cell"><span class="quest-ui-event-time">16:08:28</span>' + (entry.account ? '<span class="quest-ui-event-account-name">' + entry.account + '</span>' : '') + '</div><span class="quest-ui-event-severity is-warning">!</span><div class="quest-ui-event-copy"><div><span class="quest-ui-event-source is-orion">ORION</span><span class="quest-ui-event-category is-diagnostic">DIAGNOSTIC</span>' + (entry.legacy ? '<span class="quest-ui-event-account-legacy">LEGACY</span>' : '') + '<strong>Dune: Part Three - extended quest title</strong></div><span>' + entry.message + '</span></div><div class="quest-ui-event-row-actions"><button class="quest-ui-event-view-detail">View details</button>' + (entry.bug ? '<button class="quest-ui-event-row-bug" aria-label="Copy diagnostic report">!</button>' : '') + '</div></article></div>';
};
const script = "const errors = [];\nconst check = (ok, message) => { if (!ok) errors.push(message); };\nconst rect = el => el.getBoundingClientRect();\nconst inside = (inner, outer) => inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1 && inner.left >= outer.left - 1 && inner.right <= outer.right + 1;\nfor (const item of document.querySelectorAll(\".quest-ui-event-virtual-item\")) {\n    const row = item.querySelector(\".quest-ui-event-row\");\n    const copy = row.querySelector(\".quest-ui-event-copy\");\n    const header = copy.firstElementChild;\n    const preview = copy.lastElementChild;\n    const actions = row.querySelector(\".quest-ui-event-row-actions\");\n    const content = rect(row), style = getComputedStyle(row), message = rect(preview);\n    const safe = { top: content.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop), bottom: content.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom), left: content.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), right: content.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight) };\n    const id = item.dataset.case;\n    check(inside(rect(row), rect(item)), id + \": row escapes virtual slot\");\n    for (const el of [copy, header, preview, actions, row.firstElementChild]) check(inside(rect(el), safe), id + \": \" + el.className + \" outside row content box\");\n    check(rect(copy).right <= rect(actions).left + 1, id + \": preview overlaps action rail\");\n    check(rect(header).bottom <= message.top + 1, id + \": metadata overlaps message\");\n    check(message.width > 20, id + \": preview collapsed\");\n    check(getComputedStyle(actions).gridColumnStart === \"4\", id + \": actions left their reserved column\");\n    const line = parseFloat(getComputedStyle(preview).lineHeight);\n    check(Number.isFinite(line) && message.height <= 2 * line + 1, id + \": preview exceeds two lines\");\n    if (id !== \"short\") check(message.height >= 2 * line - 1, id + \": second preview line clipped\");\n    const account = row.querySelector(\".quest-ui-event-account-name\");\n    if (account) check(inside(rect(account), safe), id + \": account label clipped\");\n}\ndocument.body.dataset.result = errors.length ? \"fail\" : \"pass\";\ndocument.querySelector(\"#result\").textContent = JSON.stringify(errors);\nparent.postMessage({width:innerWidth,errors},\"*\");\n";
const dir = mkdtempSync(join(tmpdir(), "questui-event-rows-"));
try {
    for (const theme of ["default", "liquid-glass", "obsidian", "sakura", "terminal"]) {
        const id = theme === "default" ? "DEFAULT_DASHBOARD_THEME_ID" : '"' + theme + '"';
        const order = registry.match(new RegExp("id:\\s*" + id + "[\\s\\S]*?styles:\\s*\\[([\\s\\S]*?)\\]"))?.[1].split(",").map(s => s.trim()).filter(Boolean);
        assert.ok(order?.length && order.every(n => imports.has(n)), theme + " registry order");
        writeFileSync(join(dir, "theme.css"), order.map(n => read("../../src/themes/" + imports.get(n))).join("\n"));
        let top = 0;
        const rows = cases.map(entry => { const html = row(entry, top); top += entry.account ? other : standard; return html; }).join("");
        const fixture = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><style>html{--font-code:monospace;--font-primary:Arial,sans-serif;--text-muted:#ccc;--text-link:#9ab;--text-normal:#eee;--background-base-lowest:#111;--background-modifier-accent:#333}body{margin:0;font-family:Arial,sans-serif}button{font-family:inherit}</style><body data-result="pending"><div class="quest-ui-theme quest-ui-theme-' + theme + ' quest-ui-event-log-panel quest-ui-event-surface"><div class="quest-ui-event-list quest-ui-event-virtual-list quest-ui-event-windowed-scroller"><div class="quest-ui-event-virtual-spacer" style="height:' + top + 'px">' + rows + '</div></div></div><pre id="result"></pre><script>' + script + '</script>';
        writeFileSync(join(dir, "fixture.html"), fixture);
        // Chromium's outer window has a minimum size. Iframes give the
        // actual CSS viewport dimensions, including 360px and 420px.
        const widths = [360, 420, 620, 960];
        const runnerScript = 'const expected=' + JSON.stringify(widths) + ';const results=[];addEventListener("message",event=>{const data=event.data;if(!data||!Array.isArray(data.errors))return;results.push(data);if(results.length===expected.length){document.body.dataset.result=results.every(x=>!x.errors.length)&&expected.every(w=>results.some(x=>x.width===w))?"pass":"fail";document.querySelector("#result").textContent=JSON.stringify(results)}});';
        const runner = '<!doctype html><body data-result="pending"><pre id="result"></pre><script>' + runnerScript + '</script>' + widths.map(width => '<iframe style="display:block;width:' + width + 'px;height:800px;border:0" src="fixture.html"></iframe>').join("");
        writeFileSync(join(dir, "runner.html"), runner);
        const proc = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--allow-file-access-from-files", "--force-device-scale-factor=1", "--virtual-time-budget=5000", "--dump-dom", pathToFileURL(join(dir, "runner.html")).href], { encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
        assert.equal(proc.status, 0, proc.error?.message || proc.stderr);
        assert.ok(proc.stdout.includes('data-result="pass"'), theme + ": " + proc.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1]);
        console.log(theme + ": Event Log rows fit at all widths.");
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}
