// Test actual registry styles on selector markup at each detent.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const registry = read("../../src/themes/registry.ts");
const graphicsSource = read("../../src/dashboard/DashboardGraphicsControl.tsx");
const paletteSource = read("../../src/dashboard/DashboardThemeControl.tsx");
const paletteSvg = paletteSource.match(/<svg className="quest-ui-dashboard-palette-icon"[\s\S]*?<\/svg>/)?.[0].replace("className=", "class=");
const gaugeTemplate = graphicsSource.match(/<svg className="quest-ui-graphics-gauge"[\s\S]*?<\/svg>/)?.[0];
assert.ok(paletteSvg && gaugeTemplate, "Production icon markup missing");
function gaugeSvg(id) {
    return gaugeTemplate.replaceAll("className=", "class=").replace("id={gradientId}", 'id="' + id + '"').replaceAll("{paint}", '"url(#' + id + ')"');
}
const stops = [["#73e8a0","#21af69"],["#ffe17a","#e3a72d"],["#79baff","#3976ed"],["#ff8980","#e53b4b"],["#d4a5ff","#9855ed"],["#ffffff","#d5dce8"]];
assert.match(graphicsSource, /quest-ui-dashboard-palette-button quest-ui-graphics-trigger/, "Graphics must reuse the Palette shell");
assert.match(graphicsSource, /className="quest-ui-graphics-gauge"/, "Gauge glyph missing");
assert.doesNotMatch(graphicsSource, /particle|lastBurst|function burst/i, "Particle implementation must be removed");
assert.match(graphicsSource, /preview && <LockIcon \/>/, "Ultra lock missing");
const imports = new Map([...registry.matchAll(/import\s+(\w+)\s+from\s+"\.\/([^"]+)\?managed";/g)].map(m => [m[1], m[2]]));
const chrome = process.env.CHROME_BIN || ["google-chrome", "chromium", "chromium-browser"].find(n => spawnSync(n, ["--version"], { encoding: "utf8" }).status === 0);
assert.ok(chrome, "Chrome/Chromium not found");
const modes = ["Low", "Medium", "High", "Max", "Ultra", "Light"];
const colors = ["rgb(57, 199, 123)", "rgb(234, 191, 69)", "rgb(67, 137, 255)", "rgb(239, 83, 80)", "rgb(180, 122, 255)", "rgb(255, 255, 255)"];
const script = `
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg); };
const colors = ${JSON.stringify(colors)};
const stops = ${JSON.stringify(stops)};
const rgb = hex => "rgb(" + [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)).join(", ") + ")";
const referenceMenu = document.querySelector(".graphics-reference-menu");
const actualMenu = document.querySelector(".quest-ui-graphics-menu");
if (["sakura","origami","obsidian"].some(theme => actualMenu.classList.contains("quest-ui-theme-"+theme))) {
    for (const pseudo of [null,"::before","::after"]) {
        const a = getComputedStyle(actualMenu,pseudo), b = getComputedStyle(referenceMenu,pseudo);
        for (const property of ["backgroundColor","backgroundImage","borderImageSource","borderRadius","borderColor","borderStyle","boxShadow","clipPath"]) {
            // Sakura deliberately uses the existing scalloped card stock, not the rounded sort-menu stock.
            if (property === "borderImageSource" && !pseudo && actualMenu.classList.contains("quest-ui-theme-sakura")) {
                check(a.borderImageSource === a.getPropertyValue("--quest-ui-sakura-frame-card").trim(), "Sakura graphics frame is not scalloped card stock");
                check(a.borderImageSource !== b.borderImageSource, "Sakura graphics frame still uses rounded list stock");
            } else check(a[property] === b[property], "popout material mismatch "+pseudo+" "+property);
        }
    }
}
for (const pair of document.querySelectorAll(".graphics-header-fixture")) {
    const [graphics, palette] = pair.querySelectorAll("button");
    const a = graphics.getBoundingClientRect(), b = palette.getBoundingClientRect();
    check(Math.abs(a.width - b.width) < .5 && Math.abs(a.height - b.height) < .5, "header control size mismatch");
    const properties = ["borderRadius","borderColor","borderWidth","borderStyle","borderImageSource","backgroundImage","backgroundColor","boxShadow","clipPath","filter","padding","maskImage"];
    for (const pseudo of [null, "::before", "::after"]) {
        const g = getComputedStyle(graphics, pseudo), p = getComputedStyle(palette, pseudo);
        for (const property of properties) check(g[property] === p[property], "header shell " + pseudo + " " + property + " mismatch");
        check(g.content === p.content, "header ornament mismatch");
    }
    const n = Number(pair.dataset.mode);
    const reduced = pair.dataset.reduced === "true";
    const glyph = graphics.querySelector("svg");
    const glyphBox = glyph.getBoundingClientRect();
    check(glyphBox.width === 20 && glyphBox.height === 20, "gauge icon size mismatch");
    check(Math.abs(glyphBox.left + glyphBox.width/2 - (a.left+a.width/2)) < 1 && Math.abs(glyphBox.top + glyphBox.height/2 - (a.top+a.height/2)) < 1, "gauge not centered in trigger");
    check(getComputedStyle(glyph).strokeWidth === "24px", "gauge stroke mismatch");
    check(getComputedStyle(glyph).shapeRendering !== "crispEdges", "gauge antialiasing disabled");
    const arcShape = glyph.querySelector("path");
    const box = arcShape.getBBox();
    const center = new DOMPoint(box.x + box.width/2, box.y + box.height/2).matrixTransform(arcShape.getScreenCTM());
    check(Math.abs(center.x - (a.left+a.width/2)) < .25, "gauge ink not horizontally centered");
    check(Math.abs(center.y - (a.top+a.height/2)) < .5, "gauge ink not vertically centered");
    const hub = glyph.querySelector("circle");
    const hubPoint = new DOMPoint(Number(hub.getAttribute("cx")), Number(hub.getAttribute("cy"))).matrixTransform(hub.getCTM());
    const needlePivot = new DOMPoint(128,142).matrixTransform(glyph.querySelector(".quest-ui-graphics-needle").getCTM());
    check(Math.hypot(hubPoint.x-needlePivot.x,hubPoint.y-needlePivot.y) < .01, "gauge pivot off center");
    const gradient = glyph.querySelector("linearGradient");
    check(gradient.getAttribute("gradientUnits") === "userSpaceOnUse", "degenerate needle gradient");
    check(getComputedStyle(gradient.children[0]).stopColor === rgb(stops[n][0]), "gauge gradient start mismatch " + n);
    check(getComputedStyle(gradient.children[1]).stopColor === rgb(stops[n][1]), "gauge gradient end mismatch " + n);
    for (const path of glyph.querySelectorAll("path")) check(getComputedStyle(path).stroke.includes("#" + gradient.id), "gauge paint reference mismatch");
    check(getComputedStyle(hub).fill.includes("#" + gradient.id), "gauge hub paint mismatch");
    const paletteGlyph = palette.querySelector("svg"), paletteBox = paletteGlyph.querySelector("path").getBBox();
    const paletteCenter = new DOMPoint(paletteBox.x + paletteBox.width/2, paletteBox.y + paletteBox.height/2).matrixTransform(paletteGlyph.getScreenCTM());
    check(Math.abs(center.y - paletteCenter.y) < .6, "gauge and Palette ink centers differ");
    check(Math.abs((box.width + 24) - paletteBox.width) < 1, "gauge and Palette painted widths differ");
    const needle = getComputedStyle(glyph.querySelector(".quest-ui-graphics-needle"));
    const matrix = new DOMMatrixReadOnly(needle.transform);
    const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    check(Math.abs(angle - (n === 5 ? -135 : -135 + 67.5*n)) < .1, "gauge angle mismatch " + n);
    if (n === 0 || n === 4 || n === 5) {
        const end = glyph.querySelector(".quest-ui-graphics-needle");
        const arc = glyph.querySelector("path");
        const tip = new DOMPoint(128,46).matrixTransform(end.getCTM());
        const endpoint = arc.getPointAtLength(n === 4 ? arc.getTotalLength() : 0).matrixTransform(arc.getCTM());
        check(Math.hypot(tip.x-endpoint.x, tip.y-endpoint.y) < .1, "needle does not meet arc endpoint");
    }
    check(needle.transitionDuration === (reduced || matchMedia("(prefers-reduced-motion: reduce)").matches ? "0s" : "0.14s"), "gauge motion mismatch " + n);
}
// Exercise a real CSS transition, not just the static endpoint styles.
const animated = document.querySelector('.graphics-header-fixture[data-mode="0"][data-reduced="false"] button');
const animatedNeedle = animated.querySelector(".quest-ui-graphics-needle");
getComputedStyle(animatedNeedle).transform;
animated.dataset.graphicsIndex = "4";
getComputedStyle(animatedNeedle).transform;
const animations = animatedNeedle.getAnimations();
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const transition = animations.find(a => a.transitionProperty === "transform");
    check(!!transition, "Low to Ultra did not start a CSS transform transition");
    if (transition) {
        transition.pause();
        transition.currentTime = 70;
        const mid = new DOMMatrixReadOnly(getComputedStyle(animatedNeedle).transform);
        const angle = Math.atan2(mid.b, mid.a) * 180 / Math.PI;
        check(angle > -134 && angle < 134, "gauge did not interpolate");
        transition.finish();
    }
} else check(animations.length === 0, "system reduced motion animated the needle");
animated.dataset.graphicsReduced = "true";
animated.dataset.graphicsIndex = "0";
const reset = new DOMMatrixReadOnly(getComputedStyle(animatedNeedle).transform);
check(Math.abs(Math.atan2(reset.b, reset.a) * 180 / Math.PI + 135) < .1, "reduced motion did not snap");
check(animatedNeedle.getAnimations().length === 0, "reduced motion left an animation active");
for (const menu of document.querySelectorAll(".quest-ui-graphics-menu")) {
    const n = Number(menu.dataset.case);
    const idx = n === 5 ? 0 : n;
    const slider = menu.querySelector(".quest-ui-graphics-slider");
    const thumb = menu.querySelector(".quest-ui-graphics-thumb");
    const track = menu.querySelector(".quest-ui-graphics-track");
    const fill = menu.querySelector(".quest-ui-graphics-fill");
    const bolt = menu.querySelector(".is-bolt");
    const s = slider.getBoundingClientRect(), t = thumb.getBoundingClientRect();
    check(s.width > 100 && s.height >= 28, n + ": slider collapsed");
    check(Math.abs(t.left + t.width/2 - (s.left + 14 + (s.width - 28)*idx/4)) < 1.5, n + ": thumb wrong detent");
    check(t.left >= s.left - 1 && t.right <= s.right + 1, n + ": thumb clipped");
    check(getComputedStyle(fill).backgroundColor === colors[n], n + ": wrong fill color");
    const title = getComputedStyle(menu.querySelector(".quest-ui-graphics-title-text"));
    for (const stop of stops[n]) {
        check(getComputedStyle(fill).backgroundImage.includes(rgb(stop)), n + ": missing fill gradient stop");
        check(title.backgroundImage.includes(rgb(stop)), n + ": missing title gradient stop");
    }
    check(title.backgroundClip === "text", "title gradient not clipped");
    check(getComputedStyle(thumb).backgroundColor === "rgb(250, 250, 250)", n + ": thumb not white");
    if (n === 4) check(Math.abs(fill.getBoundingClientRect().width - track.getBoundingClientRect().width) < 1, "Ultra preview not full");
    if (n === 5) check(getComputedStyle(bolt.querySelector("svg")).fill === colors[n], "Light bolt not filled");
    if (menu.classList.contains("is-reduced") || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        check(getComputedStyle(thumb).transitionDuration === "0s", n + ": thumb transition in reduced motion");
    }
    check(!menu.querySelector(".quest-ui-graphics-particle"), "particle present");
    const lock = menu.querySelector(".quest-ui-graphics-lock");
    check(!!lock === (n === 4), "Ultra lock visibility");
    if (lock) {
        check(lock.getBoundingClientRect().width === 18 && lock.getBoundingClientRect().height === 18, "Ultra lock geometry");
        check(menu.querySelector(".quest-ui-graphics-label").textContent === "UltraComing Soon", "Ultra subtitle mismatch");
    }
}
document.body.dataset.result = errors.length ? "fail" : "pass";
document.querySelector("#result").textContent = JSON.stringify(errors);
`;
const dir = mkdtempSync(join(tmpdir(), "questui-graphics-"));
try {
    for (const theme of ["default", "liquid-glass", "obsidian", "sakura", "terminal", "origami"]) {
        const id = theme === "default" ? "DEFAULT_DASHBOARD_THEME_ID" : '"' + theme + '"';
        const order = registry.match(new RegExp("id:\\s*" + id + "[\\s\\S]*?styles:\\s*\\[([\\s\\S]*?)\\]"))?.[1].split(",").map(s => s.trim()).filter(Boolean);
        assert.ok(order?.length && order.every(n => imports.has(n)), theme + " registry order");
        const css = order.map(n => read("../../src/themes/" + imports.get(n))).join("\n");
        assert.doesNotMatch(css, /quest-ui-graphics-particle/, theme + " stale particle CSS");
        writeFileSync(join(dir, "theme.css"), css);
        const cases = [...modes, "Ultra"].map((name,caseIndex) => {
            const n = caseIndex === 6 ? 4 : caseIndex;
            const reduced = n === 2 || n === 5 || caseIndex === 6;
            return '<div class="quest-ui-theme quest-ui-theme-' + theme + ' quest-ui-graphics-menu quest-ui-dashboard-menu-surface' + (reduced ? ' is-reduced' : '') + (n === 5 ? ' is-light' : '') + '" data-case="' + n + '" data-graphics-index="' + (n === 5 ? 'light' : n) + '" style="--graphics-index:' + (n === 5 ? 0 : n) + '"><div class="quest-ui-graphics-heading"><button class="quest-ui-graphics-icon-button is-bolt" aria-pressed="' + (n === 5) + '"><svg viewBox="0 0 24 24"><path d="M3 4h5v8H3z"/></svg></button><div class="quest-ui-graphics-label"><strong><span class="quest-ui-graphics-title-text">' + name + '</span>' + (n === 4 ? '<svg class="quest-ui-graphics-lock" viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/></svg>' : '') + '</strong><span>' + (n === 4 ? 'Coming Soon' : 'Quality') + '</span></div><button class="quest-ui-graphics-icon-button is-motion" aria-pressed="' + reduced + '">RM</button></div><div class="quest-ui-graphics-slider"><span class="quest-ui-graphics-track"><span class="quest-ui-graphics-fill"></span></span><span class="quest-ui-graphics-dots"><i></i><i></i><i></i><i></i><i></i></span><span class="quest-ui-graphics-thumb"></span></div></div>';
        }).join("");
        const headerPairs = modes.flatMap((_, n) => [false, true].map(reduced => [n, reduced || n === 5])).map(([n, reduced], i) => { const open = i % 2 === 1; return '<div class="quest-ui-theme quest-ui-theme-' + theme + '"><div class="quest-ui-dashboard-header-tools graphics-header-fixture" data-mode="' + n + '" data-reduced="' + reduced + '"><button data-graphics-index="' + (n === 5 ? 'light' : n) + '" data-graphics-reduced="' + reduced + '" class="quest-ui-dashboard-palette-button quest-ui-graphics-trigger' + (open ? ' is-open' : '') + '">' + gaugeSvg('gauge-' + i) + '</button><button class="quest-ui-dashboard-palette-button' + (open ? ' is-open' : '') + '">' + paletteSvg + '</button></div></div>'; }).join("");
        writeFileSync(join(dir, "fixture.html"), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><style>body{font-family:Arial;margin:8px}button{font-family:inherit}</style><body data-result="pending">' + headerPairs + '<div class="quest-ui-theme quest-ui-theme-' + theme + ' quest-ui-dashboard-choice-list quest-ui-dashboard-menu-surface graphics-reference-menu">Theme</div>' + cases + '<pre id="result"></pre><script>' + script + '</script>');
        for (const [systemReduced, dpr] of [[false, 1], [true, 1], [false, 1.25], [false, 2]]) {
        const proc = spawnSync(chrome, [...(systemReduced ? ["--force-prefers-reduced-motion"] : []), "--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--allow-file-access-from-files", "--force-device-scale-factor=" + dpr, "--virtual-time-budget=3000", "--dump-dom", pathToFileURL(join(dir, "fixture.html")).href], { encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
        assert.equal(proc.status, 0, proc.error?.message || proc.stderr);
        assert.ok(proc.stdout.includes('data-result="pass"'), theme + ": " + proc.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1]);
        }
        console.log(theme + ": 6 graphics states, slider geometry, colors and motion contract PASS (normal + system reduced motion)");
    }
} finally { rmSync(dir, { recursive: true, force: true }); }
