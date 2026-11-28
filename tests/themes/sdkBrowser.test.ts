import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

// Load the exact production functions; type-only imports disappear on transpile.
function load(name: string): string {
    const source = readFileSync(new URL("../../src/themes/" + name + ".ts", import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    });
    return "(function(){const exports={};" + outputText + ";return exports;})()";
}
const script = `
const { createDashboardThemeController } = ${load("controller")};
const { createThemeSDK } = ${load("sdk")};
const { prepareScopedThemeCSS } = ${load("scope")};
const check = (condition, message) => { if (!condition) throw Error(message); };
try {
    const root = document.getElementById("styles");
    const inside = document.getElementById("inside");
    const outside = document.getElementById("outside");
    const themeRoot = document.getElementById("theme");
    const styleKey = "questui-custom-css:custom-test";
    const controller = createDashboardThemeController([{ id:"default", label:"Default", styles:["builtin"] }], "default", {
        validate(name) { if (name !== "builtin") sdk.styles.validate(name); },
        enable(name) { if (name !== "builtin") sdk.styles.enable(name, root); },
        disable(name) { if (name !== "builtin") sdk.styles.disable(name); }
    });
    const sdk = createThemeSDK({ register: controller.registerTheme, catalogue: controller.getCatalogue,
        active: controller.getSnapshot, restore() {} },
        (id, css) => prepareScopedThemeCSS(".quest-ui-theme-" + id, css));
    controller.select("default");
    const pkg = { apiVersion:1, id:"custom-test", label:"Test",
        css:":scope { background-color: rgb(10,20,30); } .target { color: rgb(200,30,40); }" };
    for (const css of ["} body { color:red } @scope (.foo) { .target{color:red}", "   /* empty */"]) {
        let rejected = false;
        try { sdk.api.register({...pkg, css}); } catch { rejected = true; }
        check(rejected, "invalid or escaping CSS accepted");
    }
    const unregister = sdk.api.register(pkg);
    check(root.children.length === 0, "registration enabled CSS before selection");
    controller.select(pkg.id);
    check(root.children.length === 1, "missing custom style node");
    check(getComputedStyle(inside).color === "rgb(200, 30, 40)", "scoped child not styled");
    check(getComputedStyle(outside).color !== "rgb(200, 30, 40)", "CSS escaped scope");
    check(getComputedStyle(themeRoot).backgroundColor === "rgb(10, 20, 30)", "scope root not styled");
    controller.stop();
    check(root.children.length === 0, "stop leaked CSS");
    controller.select(pkg.id);
    check(root.children.length === 1, "restart failed");
    unregister();
    check(root.children.length === 0 && controller.getSnapshot() === "default", "active unregister leaked CSS");
    let rejected = false;
    try { sdk.styles.validate(styleKey); } catch { rejected = true; }
    check(rejected, "style ownership not released");
    document.body.dataset.result = "pass";
} catch (error) {
    document.body.dataset.result = "fail";
    document.getElementById("result").textContent = String(error.stack || error);
}
`;
const chrome = process.env.CHROME_BIN || ["google-chrome", "chromium", "chromium-browser"].find(n => spawnSync(n, ["--version"]).status === 0);
assert.ok(chrome, "Chrome/Chromium not found");
const dir = mkdtempSync(join(tmpdir(), "questui-sdk-"));
try {
    const file = join(dir, "fixture.html");
    writeFileSync(file, '<!doctype html><meta charset="utf-8"><body data-result="pending"><div id="styles"></div><div id="theme" class="quest-ui-theme-custom-test"><span id="inside" class="target">inside</span></div><span id="outside" class="target">outside</span><pre id="result"></pre><script>' + script + '</script>');
    const result = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--dump-dom", pathToFileURL(file).href], { encoding: "utf8", timeout: 45000, maxBuffer: 1024 * 1024 });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.ok(result.stdout.includes('data-result="pass"'), result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "SDK browser fixture failed");
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log("QuestUI Theme SDK browser registration, scoping and disposal - PASS");
