// Test actual registry styles on selector markup at each detent.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { inflateSync } from "node:zlib";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const registry = read("../../src/themes/registry.ts");
const graphicsSource = read("../../src/dashboard/DashboardGraphicsControl.tsx");
const paletteSource = read("../../src/dashboard/DashboardThemeControl.tsx");
const paletteSvg = paletteSource.match(/<svg className="quest-ui-dashboard-palette-icon"[\s\S]*?<\/svg>/)?.[0].replace("className=", "class=");
const gaugeTemplate = graphicsSource.match(/<svg className="quest-ui-graphics-gauge"[\s\S]*?<\/svg>/)?.[0];
assert.ok(paletteSvg && gaugeTemplate, "Production icon markup missing");
function gaugeSvg(id) {
    return gaugeTemplate
        .replaceAll("className=", "class=")
        .replaceAll("strokeWidth=", "stroke-width=")
        .replaceAll("vectorEffect=", "vector-effect=")
        .replace("id={gradientId}", 'id="' + id + '"')
        .replaceAll("{paint}", '"url(#' + id + ')"');
}
const stops = [["#73e8a0","#21af69"],["#ffe17a","#e3a72d"],["#79baff","#3976ed"],["#ff8980","#e53b4b"],["#d4a5ff","#9855ed"],["#ffffff","#d5dce8"]];
assert.match(graphicsSource, /quest-ui-dashboard-palette-button quest-ui-graphics-trigger/, "Graphics must reuse the Palette shell");
assert.match(graphicsSource, /className="quest-ui-graphics-gauge"/, "Gauge glyph missing");
assert.match(graphicsSource, /viewBox="0 0 24 24"/, "Gauge must use Lucide native grid");
assert.match(graphicsSource, /M3\.34 19a10 10 0 1 1 17\.32 0/, "Lucide Gauge arc geometry missing");
assert.match(graphicsSource, /x1="2" y1="12" x2="22" y2="12"/, "Gauge gradient must remain horizontally symmetric");
assert.doesNotMatch(graphicsSource, /particle|lastBurst|function burst/i, "Particle implementation must be removed");
assert.match(graphicsSource, /preview && <LockIcon \/>/, "Ultra lock missing");
for (const theme of ["default","terminal","origami"]) {
    assert.match(read("../../src/themes/" + theme + "/graphics.css"), /quest-ui-graphics-gauge\s*\{[^}]*position:\s*relative;\s*left:\s*\.5px;/, theme + " runtime-measured +0.5px optical correction missing");
}
for (const theme of ["default","liquid-glass","obsidian","sakura","terminal","origami"]) {
    const css = read("../../src/themes/" + theme + "/graphics.css");
    assert.doesNotMatch(css, /scale[XY]\(/, theme + " must not distort the gauge");
    assert.doesNotMatch(css, /quest-ui-graphics-gauge\s*\{[^}]*transform:/, theme + " must not scale/transform the gauge SVG");
    if (!["default","terminal","origami"].includes(theme)) assert.doesNotMatch(css, /quest-ui-graphics-gauge\s*\{[^}]*\bleft:/, theme + " must not carry runtime optical correction");
}
assert.doesNotMatch(read("../../src/themes/origami/graphics.css"), /quest-ui-graphics-gauge[^\n]*filter:/, "Origami gauge must not use raster-expanding drop shadow");
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
    check(Math.abs(glyphBox.width - 20) < .02 && Math.abs(glyphBox.height - 20) < .02, "gauge icon size mismatch");
    const themeName = ["default","terminal","origami"].find(name => pair.closest(".quest-ui-theme-" + name));
    const expectedSvgX = themeName ? .5 : 0;
    check(Math.abs((glyphBox.left + glyphBox.width/2 - (a.left+a.width/2)) - expectedSvgX) < .08 && Math.abs(glyphBox.top + glyphBox.height/2 - (a.top+a.height/2)) < .08, "gauge optical position mismatch");
    for (const path of glyph.querySelectorAll("path")) {
        check(getComputedStyle(path).strokeWidth === "2px", "gauge stroke mismatch");
        check(getComputedStyle(path).vectorEffect === "non-scaling-stroke", "gauge stroke must be phase-stable");
    }
    check(getComputedStyle(glyph).shapeRendering !== "crispEdges", "gauge antialiasing disabled");
    const arcShape = glyph.querySelector("path");
    const box = arcShape.getBBox();
    const center = new DOMPoint(box.x + box.width/2, box.y + box.height/2).matrixTransform(arcShape.getScreenCTM());
    const themeRoot = pair.closest(".quest-ui-theme");
    check(!getComputedStyle(glyph).transform || getComputedStyle(glyph).transform === "none", "theme must not scale gauge SVG");
    if (themeName) check(getComputedStyle(glyph).left === "0.5px", themeName + " +0.5px runtime optical correction missing");
    check(Math.abs((glyphBox.left + glyphBox.width/2 - (a.left+a.width/2)) - expectedSvgX) < .08, "gauge SVG X optical offset drifted");
    check(Math.abs(glyphBox.top + glyphBox.height/2 - (a.top+a.height/2)) < .02, "gauge SVG Y center drifted");
    const hub = glyph.querySelector("circle");
    const hubPoint = new DOMPoint(Number(hub.getAttribute("cx")), Number(hub.getAttribute("cy"))).matrixTransform(hub.getCTM());
    const needlePivot = new DOMPoint(12,14).matrixTransform(glyph.querySelector(".quest-ui-graphics-needle").getCTM());
    check(Math.hypot(hubPoint.x-needlePivot.x,hubPoint.y-needlePivot.y) < .01, "gauge pivot off center");
    const gradient = glyph.querySelector("linearGradient");
    check(gradient.getAttribute("gradientUnits") === "userSpaceOnUse", "degenerate needle gradient");
    check(gradient.children.length === 3, "gauge gradient must use symmetric three-stop lighting");
    check(getComputedStyle(gradient.children[0]).stopColor === rgb(stops[n][1]), "gauge left edge mismatch " + n);
    check(getComputedStyle(gradient.children[1]).stopColor === rgb(stops[n][0]), "gauge center highlight mismatch " + n);
    check(getComputedStyle(gradient.children[2]).stopColor === rgb(stops[n][1]), "gauge right edge mismatch " + n);
    for (const path of glyph.querySelectorAll("path")) check(getComputedStyle(path).stroke.includes("#" + gradient.id), "gauge paint reference mismatch");
    check(getComputedStyle(hub).fill.includes("#" + gradient.id), "gauge hub paint mismatch");
    const paletteGlyph = palette.querySelector("svg");
    check(box.width > 19.9 && box.width < 20.1, "Lucide gauge arc width drifted");
    const needle = getComputedStyle(glyph.querySelector(".quest-ui-graphics-needle"));
    const matrix = new DOMMatrixReadOnly(needle.transform);
    const angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    check(Math.abs(angle - (n === 5 ? -120 : -120 + 60*n)) < .1, "gauge angle mismatch " + n);
    if (n === 0 || n === 4 || n === 5) {
        const end = glyph.querySelector(".quest-ui-graphics-needle");
        const arc = glyph.querySelector("path");
        const tip = new DOMPoint(12,4).matrixTransform(end.getCTM());
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
        check(angle > -119 && angle < 119, "gauge did not interpolate");
        transition.finish();
    }
} else check(animations.length === 0, "system reduced motion animated the needle");
animated.dataset.graphicsReduced = "true";
animated.dataset.graphicsIndex = "0";
const reset = new DOMMatrixReadOnly(getComputedStyle(animatedNeedle).transform);
check(Math.abs(Math.atan2(reset.b, reset.a) * 180 / Math.PI + 120) < .1, "reduced motion did not snap");
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
for (const fixture of document.querySelectorAll(".graphics-policy-fixture")) {
    const q = fixture.dataset.quality;
    const theme = fixture.dataset.theme;
    const reduced = fixture.classList.contains("quest-ui-reduced-motion");
    const title = fixture.querySelector(".quest-ui-dashboard-display-title > strong");
    const spinner = fixture.querySelector(".quest-ui-update-check-spinner");
    const reload = fixture.querySelector(".quest-ui-reload-icon-button svg");
    const chip = fixture.querySelector(".quest-ui-summary-chip");
    check(getComputedStyle(spinner).animationName !== "none", theme+" "+q+" checking banner spinner disabled");
    if (reduced) {
        check(getComputedStyle(title).animationName === "none", theme+" decorative title still animates");
        check(getComputedStyle(chip).transitionProperty === "none", theme+" transition still active");
        check(getComputedStyle(spinner).animationName !== "none", theme+" functional update spinner disabled");
        check(getComputedStyle(reload).animationName !== "none", theme+" functional reload spinner disabled");
        check(getComputedStyle(spinner).animationDuration === "1.6s", theme+" spinner motion policy");
    }
    if (theme === "default" || theme === "liquid-glass") {
        const backdrop = fixture.querySelector(".quest-ui-card-backdrop");
        const expected = theme === "default" ? {max:22,high:16,medium:8} : {max:24,high:18,medium:8};
        if (q === "low") check(getComputedStyle(backdrop).display === "none", theme+" low ambient artwork visible");
        else check(getComputedStyle(backdrop.querySelector("img")).filter.includes("blur("+expected[q]+"px)"),theme+" "+q+" artwork filter mismatch");
    }
    if (theme === "liquid-glass") {
        const expected = {max:20,high:12,medium:6};
        check(q === "low" ? getComputedStyle(fixture).backdropFilter === "none" : getComputedStyle(fixture).backdropFilter.includes("blur("+expected[q]+"px)"),q+" shell blur mismatch");
    }
    if (theme === "obsidian") {
        const count = {max:3,high:2,medium:1,low:1}[q];
        const mask = getComputedStyle(fixture.querySelector("[data-obsidian-fracture]"),"::after").maskImage;
        check((mask.match(/url\\(/g)||[]).length === count,"Obsidian "+q+" fracture masks "+mask.slice(0,60));
    }
    if (theme === "sakura" && q === "low") check(getComputedStyle(fixture.querySelector(".quest-ui-sakura-card-art")).display === "none","Sakura low ornament visible");
    if (theme === "terminal" && (q === "medium" || q === "low")) check(getComputedStyle(fixture.querySelector(".quest-ui-terminal-panorama")).display === "none","Terminal panorama visible");
    if (theme === "origami" && (q === "medium" || q === "low")) check(getComputedStyle(fixture.querySelector(".quest-ui-origami-card-animal")).filter === "none","Origami animal filter not reduced");
}
// Independent portal roots do not inherit the dashboard shell. Exercise the
// actual ordered styles on each portal separately, including Graphics itself.
if (document.querySelector(".graphics-policy-fixture").dataset.theme === "liquid-glass") {
    const surfaces = {
        "quest-ui-filter-list": 16, "quest-ui-dashboard-choice-list": 16,
        "quest-ui-event-log-panel": 18, "quest-ui-event-detail": 18,
        "quest-ui-event-sort-menu": 16, "quest-ui-event-filter-menu": 16,
        "quest-ui-update-panel quest-ui-update-panel-v16": 18,
        "quest-ui-notification-center-panel": 18, "quest-ui-graphics-menu": 18
    };
    for (const [surface,max] of Object.entries(surfaces)) {
        const portal = document.createElement("div");
        portal.className = "quest-ui-theme quest-ui-theme-liquid-glass " + surface;
        document.body.append(portal);
        for (const quality of ["max","high","medium","low"]) {
            portal.className = "quest-ui-theme quest-ui-theme-liquid-glass " + surface + " quest-ui-quality-" + quality;
            const style = getComputedStyle(portal);
            const expected = {max,high:12,medium:6}[quality];
            check(quality === "low" ? style.backdropFilter === "none" : style.backdropFilter.includes("blur("+expected+"px)"),surface+" "+quality+" portal blur mismatch: "+style.backdropFilter);
            if (quality === "low") check(style.backgroundColor === "rgb(24, 32, 57)",surface+" opaque fallback missing");
        }
        portal.remove();
    }
}
document.body.dataset.result = errors.length ? "fail" : "pass";
document.querySelector("#result").textContent = JSON.stringify(errors);
`;
const dir = mkdtempSync(join(tmpdir(), "questui-graphics-"));
const rasterSamples = [];
// Chromium emits non-interlaced 8-bit RGB/RGBA PNGs. Decode synchronously;
// --dump-dom can exit before an asynchronous Image.decode() completes.
function decodeScreenshot(png) {
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    let width, height, channels;
    const chunks = [];
    for (let offset=8; offset+12<=png.length;) {
        const size=png.readUInt32BE(offset), type=png.toString("ascii",offset+4,offset+8);
        const bytes=png.subarray(offset+8,offset+8+size);
        if (type==="IHDR") {
            width=bytes.readUInt32BE(0); height=bytes.readUInt32BE(4);
            assert.equal(bytes[8],8,"PNG depth"); assert.equal(bytes[12],0,"PNG interlace");
            channels=bytes[9]===2?3:bytes[9]===6?4:0;
            assert.ok(channels,"unsupported PNG color type "+bytes[9]);
        } else if(type==="IDAT") chunks.push(bytes);
        else if(type==="IEND") break;
        offset+=size+12;
    }
    assert.ok(width && height && channels && width*height<4_000_000);
    const raw=inflateSync(Buffer.concat(chunks)), stride=width*channels, data=Buffer.alloc(stride*height);
    assert.equal(raw.length,(stride+1)*height);
    function paeth(a,b,c) {
        const p=a+b-c, pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
        return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
    }
    for(let y=0;y<height;y++) {
        const filter=raw[y*(stride+1)];
        assert.ok(filter<=4);
        for(let x=0;x<stride;x++){
            const i=y*stride+x, a=x>=channels?data[i-channels]:0, b=y?data[i-stride]:0, c=y&&x>=channels?data[i-stride-channels]:0;
            const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
            data[i]=(raw[y*(stride+1)+1+x]+predictor)&255;
        }
    }
    return {width,height,channels,data};
}
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
        const policyFixtures = ["max","high","medium","low"].flatMap(q => [false,true].map(reduced => '<div class="quest-ui-theme quest-ui-theme-' + theme + ' quest-ui-dashboard-shell graphics-policy-fixture quest-ui-quality-' + q + (reduced ? ' quest-ui-reduced-motion' : '') + '" data-quality="' + q + '" data-theme="' + theme + '"><div class="quest-ui-dashboard-topbar"><div class="quest-ui-dashboard-display-title"><strong>Quest Dashboard</strong></div><button class="quest-ui-summary-chip">All</button><button class="quest-ui-reload-icon-button is-spinning"><svg viewBox="0 0 24 24"></svg></button><div class="quest-ui-update-banner is-checking"><span class="quest-ui-update-banner-mark"><svg class="quest-ui-update-check-spinner" viewBox="0 0 16 16"></svg></span></div></div><article class="quest-ui-card" data-obsidian-fracture="0" data-origami-scene="crane" data-sakura-ornament="0"><span class="quest-ui-card-backdrop"><img alt=""></span><span class="quest-ui-sakura-card-art"></span><span class="quest-ui-terminal-panorama"></span><span class="quest-ui-origami-card-paper"></span><span class="quest-ui-origami-card-animal"></span></article></div>')).join("");
        writeFileSync(join(dir, "fixture.html"), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><style>body{font-family:Arial;margin:8px}button{font-family:inherit}</style><body data-result="pending">' + headerPairs + '<div class="quest-ui-theme quest-ui-theme-' + theme + ' quest-ui-dashboard-choice-list quest-ui-dashboard-menu-surface graphics-reference-menu">Theme</div>' + cases + policyFixtures + '<pre id="result"></pre><script>' + script + '</script>');
        for (const [systemReduced, dpr] of [[false, 1], [true, 1], [false, 1.25], [false, 2]]) {
        const proc = spawnSync(chrome, [...(systemReduced ? ["--force-prefers-reduced-motion"] : []), "--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--allow-file-access-from-files", "--force-device-scale-factor=" + dpr, "--virtual-time-budget=3000", "--dump-dom", pathToFileURL(join(dir, "fixture.html")).href], { encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
        assert.equal(proc.status, 0, proc.error?.message || proc.stderr);
        assert.ok(proc.stdout.includes('data-result="pass"'), theme + ": " + proc.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1]);
        }
        // Capture production glyphs and actual theme frames. A second identical
        // row with glyphs hidden provides a background-only control, including
        // theme-specific masks and shadows. This measures ink, not SVG boxes.
        const rasterRow = (hidden, top, phase) => '<div class="quest-ui-dashboard-header-tools graphics-raster-row' + (hidden ? ' hide-glyph' : '') + '" style="top:' + top + 'px;left:' + phase + 'px"><button class="quest-ui-dashboard-palette-button quest-ui-graphics-trigger" data-graphics-index="2" data-graphics-reduced="true">' + gaugeSvg('raster-' + top + '-' + phase) + '</button><button class="quest-ui-dashboard-palette-button">' + paletteSvg + '</button></div>';
        const rasterStyle = '<style>html,body{margin:0;background:#555}#raster-stage{position:absolute;left:0;top:0;width:128px;height:128px;background:#555}#raster-stage .graphics-raster-row{position:absolute;left:0;display:grid!important;grid-template-columns:64px 64px;justify-items:center;align-items:center;gap:0;margin:0;width:128px;height:64px}#raster-stage *,#raster-stage *::before,#raster-stage *::after{animation:none!important;transition:none!important}#raster-stage .hide-glyph svg{visibility:hidden!important}</style>';
        for (const phase of [0, .5]) {
        writeFileSync(join(dir, "raster.html"), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="theme.css">' + rasterStyle + '<div id="raster-stage" class="quest-ui-theme quest-ui-theme-' + theme + '">' + rasterRow(false,0,phase) + rasterRow(true,64,phase) + '</div>');
        for (const dpr of [1, 1.25, 2]) {
            const png = join(dir, "raster.png");
            const shot = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--hide-scrollbars", "--window-size=256,256", "--force-device-scale-factor=" + dpr, "--virtual-time-budget=1000", "--screenshot=" + png, pathToFileURL(join(dir, "raster.html")).href], { encoding: "utf8", timeout: 45000 });
            assert.equal(shot.status, 0, shot.error?.message || shot.stderr);
            rasterSamples.push({ theme, dpr, phase, png: readFileSync(png) });
            rmSync(png);
        }
        }
        console.log(theme + ": 6 graphics states, slider geometry, colors and motion contract PASS (normal + system reduced motion; DPR 1/1.25/2; phase 0/.5)");
    }
    const errors=[], results=[];
    for(const sample of rasterSamples) {
        const {width,height,channels,data}=decodeScreenshot(sample.png);
        const cell=Math.round(64*sample.dpr), bounds=[];
        assert.ok(width>=2*cell&&height>=2*cell,"screenshot viewport too small");
        for(let k=0;k<2;k++) {
            let x0=cell,y0=cell,x1=-1,y1=-1,count=0,sumX=0,sumY=0,lumaWeight=0,lumaX=0;
            for(let y=0;y<cell;y++) for(let x=0;x<cell;x++) {
                const a=channels*(y*width+k*cell+x), b=a+channels*cell*width;
                if(Math.max(Math.abs(data[a]-data[b]),Math.abs(data[a+1]-data[b+1]),Math.abs(data[a+2]-data[b+2]))<28) continue;
                x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);sumX+=x;sumY+=y;count++;
                const fg=.2126*data[a]+.7152*data[a+1]+.0722*data[a+2], bg=.2126*data[b]+.7152*data[b+1]+.0722*data[b+2];
                const lw=Math.abs(fg-bg); lumaWeight+=lw; lumaX+=(x+.5)*lw;
            }
            const d=sample.dpr,cx=(x0+x1+1)/(2*d),cy=(y0+y1+1)/(2*d),mx=(sumX/count+.5)/d,my=(sumY/count+.5)/d,lx=(lumaX/Math.max(1,lumaWeight))/d,w=(x1-x0+1)/d,h=(y1-y0+1)/d;
            if(count<12*d*d||w<12||w>25||h<10||h>25||Math.abs(cx-32)>1.6||Math.abs(cy-32)>1.6) errors.push(sample.theme+" DPR "+d+" icon "+k+" bounds "+JSON.stringify({cx,cy,w,h,count}));
            bounds.push({cx,cy,mx,my,lx,w,h});
        }
        const [g,p]=bounds;
        const expectedRasterX = 32 + sample.phase + (["default","terminal","origami"].includes(sample.theme) ? .5 : 0);
        if(Math.abs(g.cx-expectedRasterX)>.65) errors.push(sample.theme+" DPR "+sample.dpr+" phase "+sample.phase+" gauge painted X bounds drift "+JSON.stringify(bounds));
        if(Math.abs(g.mx-expectedRasterX)>.6) errors.push(sample.theme+" DPR "+sample.dpr+" phase "+sample.phase+" gauge optical X center "+JSON.stringify(bounds));
        if(Math.abs(g.lx-g.cx)>.35) errors.push(sample.theme+" DPR "+sample.dpr+" phase "+sample.phase+" gauge luminance X center "+JSON.stringify(bounds));
        results.push({theme:sample.theme,dpr:sample.dpr,bounds});
    }
    console.log("Rendered pixel bounds: "+JSON.stringify(results));
    assert.deepEqual(errors,[],"Screenshot regression");
    console.log("Actual Chromium screenshot raster bounds: "+rasterSamples.length+" theme/DPR cases PASS");
} finally { rmSync(dir, { recursive: true, force: true }); }
