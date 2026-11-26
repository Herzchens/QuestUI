// Browser regression for the Terminal runtime feedback: retain the native emblem,
// keep foreground text opaque, and give achievement and standard cards one frame.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const registry = read("../../src/themes/registry.ts");
const shellSource = read("../../src/dashboard/QuestDashboardShell.tsx");
assert.ok(!shellSource.includes("quest-ui-terminal-footer"), "footer must be removed from source");
const shapeSource = read("../../src/themes/terminal/progressShape.ts");
assert.ok(shapeSource.includes("terminalProgressPixels(100)") && shapeSource.includes("h2v2h-2z"), "Terminal ring must use filled raster cells");
const cardSource = read("../../src/dashboard/QuestCard.tsx");
assert.ok(cardSource.includes('shapeRendering="crispEdges"') && cardSource.includes("progress={progress}"), "Terminal render must use the raster path and live ratio");
const imports = new Map([...registry.matchAll(/import\s+(\w+)\s+from\s+"\.\/([^"]+)\?managed";/g)].map(m => [m[1], m[2]]));
const order = registry.match(/id:\s*"terminal"[\s\S]*?styles:\s*\[([\s\S]*?)\]/)?.[1].split(",").map(s => s.trim()).filter(Boolean);
assert.ok(order?.length && order.every(n => imports.get(n)?.startsWith("terminal/")), "Terminal must own its styles");
const chrome = process.env.CHROME_BIN || ["google-chrome", "chromium", "chromium-browser"].find(n => spawnSync(n, ["--version"], { encoding: "utf8" }).status === 0);
assert.ok(chrome, "Chrome/Chromium not found");

const markup = `
<div class="quest-ui-icon-wrap"><span class="quest-ui-detailed-count quest-ui-detail-claimable">3</span></div>
<div class="quest-ui-theme quest-ui-theme-terminal quest-ui-dashboard-shell">
  <div class="quest-ui-dashboard-topbar">
    <div class="quest-ui-dashboard-display-title">
      <span class="quest-ui-dashboard-display-title-icon"><svg viewBox="0 0 24 24"><path d="M2 2H22V22H2Z"/></svg></span>
      <strong>Quest Dashboard</strong>
      <span class="quest-ui-dashboard-boost-source-tag is-xbox"><svg class="quest-ui-dashboard-xbox-icon"><path d="M0 0H12"/></svg><span class="quest-ui-dashboard-boost-source-wordmark">Xbox+</span></span>
    </div>
    <button class="quest-ui-dashboard-palette-button"><svg class="quest-ui-dashboard-palette-icon" viewBox="0 0 256 256"><path d="M0 0H256V256Z"/></svg></button>
  </div>
  <div style="position:absolute;top:0;left:0" class="quest-ui-status-bridge is-connected"><span class="quest-ui-status-bridge-line"></span><span class="quest-ui-status-bridge-node"></span><span class="quest-ui-status-bridge-line"></span></div>
  <button style="position:absolute;top:0;left:0" class="quest-ui-dashboard-filter-control quest-ui-sort-button"><svg></svg>Sort</button>
  <button style="position:absolute;top:0;left:0" class="quest-ui-dashboard-filter-control quest-ui-filter-button is-active"><svg></svg>Filter<span class="quest-ui-filter-count-badge">1</span></button>
  <div class="quest-ui-dashboard-actionbar">
    <div class="quest-ui-dashboard-actionbar-primary">
      <button class="quest-ui-toolbar-button quest-ui-claim-all-button"><span class="quest-ui-claim-all-count">3</span></button>
      <button class="quest-ui-reload-icon-button"><svg viewBox="0 0 24 24"><path d="M0 0H12"/></svg></button>
      <button class="quest-ui-status-settings-button"><svg class="quest-ui-plugin-settings-glyph" viewBox="0 0 24 24"><path d="M0 0H12"/></svg></button>
    </div>
    <button class="quest-ui-dashboard-notification-island is-idle"><span class="quest-ui-dashboard-notification-bell"><svg class="quest-ui-dashboard-notification-surface"><rect class="quest-ui-dashboard-notification-surface-rect"/></svg><svg class="quest-ui-dashboard-notification-icon" viewBox="0 0 24 24"></svg></span><span class="quest-ui-dashboard-notification-measure">Notification Center</span><span class="quest-ui-dashboard-notification-unread-dot"></span></button>
  </div>
  <div class="quest-ui-dashboard">
    <div class="quest-ui-dashboard-summary">
      <button class="quest-ui-summary-chip quest-ui-summary-all is-selected"><span class="quest-ui-summary-chip-label">All</span><span class="quest-ui-summary-chip-count">62</span></button>
      <button class="quest-ui-summary-chip quest-ui-summary-available"><span class="quest-ui-summary-chip-label">Available</span><span class="quest-ui-summary-chip-count">0</span></button>
    </div>
    <div class="quest-ui-dashboard-content">
      <article class="quest-ui-card quest-ui-card-claimable">
        <span class="quest-ui-card-backdrop quest-ui-terminal-panorama" aria-hidden="true"><img alt="" width="896" height="128"></span>
        <div class="quest-ui-artwork"><img class="quest-ui-artwork-image" data-terminal-pixel="true" alt=""></div>
        <div class="quest-ui-card-main"><strong class="quest-ui-card-title">MONOPOLY GO!</strong></div>
        <div class="quest-ui-card-side"><div class="quest-ui-progress-ring"><svg viewBox="0 0 56 56"></svg><span>100%</span></div><span class="quest-ui-card-expiry">Expires in 5d 23h</span></div>
      </article>
      <article class="quest-ui-card quest-ui-card-achievement quest-ui-card-in-progress">
        <span class="quest-ui-card-backdrop quest-ui-terminal-panorama" aria-hidden="true"><img alt="" width="896" height="128"></span>
        <div class="quest-ui-artwork"></div><div class="quest-ui-card-main">Dune: Part Three <span class="quest-ui-card-ignored-state">Ignored</span><button class="quest-ui-card-orion-control is-start">Start</button></div><div class="quest-ui-card-side is-achievement"></div>
      </article>
      ${Array.from({ length: 3 }, () => '<article class="quest-ui-card quest-ui-card-claimable"><div class="quest-ui-artwork"></div><div class="quest-ui-card-main">Quest</div><div class="quest-ui-card-side"><div class="quest-ui-progress-ring"><svg viewBox="0 0 56 56"></svg><span>100%</span></div><span class="quest-ui-card-expiry">Expires in 5d 23h</span></div></article>').join("")}
      <svg class="quest-ui-sort-icon" viewBox="0 0 24 24"><path d="M1 1H23"/></svg>
    </div>
  </div>
</div>
<div class="quest-ui-theme quest-ui-theme-terminal quest-ui-event-log-panel quest-ui-event-surface">
  <div class="quest-ui-event-log-actions"><div><button class="quest-ui-event-flat-control quest-ui-event-sort-trigger"><svg class="quest-ui-event-control-icon"></svg>Sort</button><button class="quest-ui-event-flat-control quest-ui-event-filter-launcher"><svg class="quest-ui-event-control-icon"></svg>Filter<span class="quest-ui-event-filter-count">1</span></button></div><div class="quest-ui-event-action-island"><button class="quest-ui-event-clear-confirm-button is-confirm">OK</button><button class="quest-ui-event-clear-confirm-button is-cancel">Cancel</button></div></div>
  <div class="quest-ui-event-row is-category-runtime is-warning"><span class="quest-ui-event-severity is-warning"><svg class="quest-ui-event-severity-icon"><path d="M0 0H12"/></svg></span><span class="quest-ui-event-severity is-error"><svg class="quest-ui-event-severity-icon"><path d="M0 0H12"/></svg></span><button class="quest-ui-event-view-detail">View details</button><button class="quest-ui-event-row-bug"><svg class="quest-ui-event-log-icon"><path d="M0 0H12"/></svg></button><span class="quest-ui-event-source is-orion">ORION</span><span class="quest-ui-event-category is-runtime">RUNTIME</span></div>
</div>
<div class="quest-ui-theme quest-ui-theme-terminal quest-ui-event-detail quest-ui-event-surface">
  <div class="quest-ui-event-detail-hero"><span class="quest-ui-event-detail-hero-icon is-warning"><svg class="quest-ui-event-severity-icon"></svg></span><h3>Long diagnostic message without truncation</h3><span class="quest-ui-event-detail-category is-diagnostic">Diagnostic</span></div>
  <div class="quest-ui-event-detail-meta-card"><div class="quest-ui-event-detail-meta-row"><span class="quest-ui-event-detail-meta-icon-wrap" data-kind="code"><svg class="quest-ui-event-detail-meta-icon"><path d="M0 0H12"/></svg></span><span>Event code</span><code>TEST</code></div></div>
  <section class="quest-ui-event-detail-diagnostic"><pre>Console output</pre></section>
</div>
<div class="quest-ui-theme quest-ui-theme-terminal quest-ui-event-filter-menu quest-ui-event-menu-surface"><button class="quest-ui-event-filter-list-row tone-warning is-checked"><span class="quest-ui-event-filter-list-box"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg></span></button><button class="quest-ui-event-filter-list-row"><span class="quest-ui-event-filter-list-box"></span></button></div>
<div class="quest-ui-theme quest-ui-theme-terminal quest-ui-dashboard-choice-list"><button class="is-selected"><span class="quest-ui-dashboard-choice-list-radio"><span></span></span></button></div>
<div class="quest-ui-theme quest-ui-theme-terminal quest-ui-filter-list">
    <button class="quest-ui-filter-list-row is-available is-checked"><span class="quest-ui-filter-list-box"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg></span></button>
    <button class="quest-ui-filter-list-row"><span class="quest-ui-filter-list-box"></span></button>
    <button class="quest-ui-filter-list-row is-radio is-checked"><span class="quest-ui-filter-list-box"><span class="quest-ui-filter-list-radio-dot"></span></span></button>
    <div class="quest-ui-history-steps-nodes"><button class="is-reached is-selected"><span class="quest-ui-history-step-node"><span></span></span></button></div>
</div>
<div class="quest-ui-theme quest-ui-theme-terminal"><svg class="quest-ui-event-action-icon quest-ui-event-broom-icon" viewBox="0 0 24 24"><path d="M9.4 3.8a2.6 2.6 0 0 1 5.2 0"/></svg></div>
<div class="quest-ui-theme quest-ui-theme-terminal quest-ui-notification-center-panel">
  <button class="quest-ui-notification-center-action"><svg class="quest-ui-terminal-notice-read-glyph"><path d="M0 0H12"/></svg>Mark read</button>
  <button class="quest-ui-notification-center-action is-danger">Clear</button>
</div>
<div class="quest-ui-theme quest-ui-theme-terminal quest-ui-update-panel quest-ui-update-panel-v16 quest-ui-update-surface">
  <div class="quest-ui-update-banner is-current"><span class="quest-ui-update-banner-mark"><svg class="quest-ui-terminal-update-current-glyph"><path d="M0 0H12"/></svg></span></div>
  <div class="quest-ui-update-product-entry is-error">Error<span class="quest-ui-update-row-version is-old-version">v1</span><span class="quest-ui-update-row-target is-beta">v2</span><div class="quest-ui-update-decision-actions"><button>Keep</button><button class="is-destructive">Discard</button></div></div>
</div>`;
const script = `
const errors = [];
const q = s => document.querySelector(s);
const style = s => getComputedStyle(q(s));
const check = (ok, name) => { if (!ok) errors.push(name); };
const title = style(".quest-ui-dashboard-display-title > strong");
check(title.webkitTextFillColor === title.color && title.color !== "rgba(0, 0, 0, 0)", "title text must have opaque fill");
check(title.animationName === "none", "legacy title sweep must be disabled");
const emblem = q(".quest-ui-dashboard-display-title-icon > svg");
check(getComputedStyle(emblem).display !== "none" && emblem.getBoundingClientRect().width > 0, "native emblem must be visible");
check(getComputedStyle(emblem.parentElement, "::after").content === "none", "do not substitute prompt for emblem");
const standard = style(".quest-ui-card-claimable");
const achievement = style(".quest-ui-card-achievement");
check(standard.borderImageSource !== "none" && standard.borderImageSource === achievement.borderImageSource, "card frame sources must match");
check(standard.borderImageSlice === "8" && achievement.borderImageSlice === "8", "frame slice mismatch");
check(standard.borderTopWidth === achievement.borderTopWidth && standard.borderTopWidth === "1px", "visual border must not consume the eight-pixel image slice in layout");
check(standard.borderImageWidth === "8px", "stepped corners must remain visible");
check(decodeURIComponent(standard.borderImageSource).includes("#b9ffce"), "frame must retain bright corner accents");
check(standard.backgroundColor === "rgb(4, 12, 8)", "card surface must be near-black");
check(style(".quest-ui-card-expiry").whiteSpace === "nowrap", "desktop expiry must remain on one line");
check(getComputedStyle(q(".quest-ui-artwork"), "::after").top === "0px" && getComputedStyle(q(".quest-ui-artwork"), "::after").left === "0px", "thumbnail frame must not leave a gap");
check(getComputedStyle(q(".quest-ui-artwork-image")).clipPath !== "none", "artwork must follow frame corners");
check(standard.backgroundImage === achievement.backgroundImage, "card surfaces must match");
check(style(".quest-ui-terminal-panorama").position === "absolute" && style(".quest-ui-terminal-panorama").pointerEvents === "none", "panorama must not participate in layout or input");
check(style(".quest-ui-terminal-panorama").zIndex === "0" && style(".quest-ui-card-main").zIndex === "1", "panorama must stay behind content");
check(style(".quest-ui-terminal-panorama > img").imageRendering === "pixelated", "panorama dots must stay sharp");
for (const backdrop of document.querySelectorAll(".quest-ui-terminal-panorama")) {
    const card = backdrop.parentElement.getBoundingClientRect();
    const art = backdrop.getBoundingClientRect();
    check(card.width - art.width <= 7 && card.height - art.height <= 7, "panorama must cover both standard and achievement cards");
    check(getComputedStyle(backdrop.querySelector("img")).objectFit === "cover", "panorama must cover without distorting dots");
}
check(style(".quest-ui-artwork-image").imageRendering === "pixelated", "processed thumbnail must retain hard pixels");
const list = q(".quest-ui-dashboard-content");
const cards = [...list.querySelectorAll(".quest-ui-card")];
check(cards.length === 5 && cards.every(card => card.getBoundingClientRect().height <= 118.5), "standard and achievement cards must retain the Default 118px baseline");
check(cards[3].getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1, "four cards must be fully visible in desktop fixture");
check(style(".quest-ui-dashboard-actionbar-primary").borderTopWidth === "1px", "toolbar parent must not use a thick layout border");
const bell = q(".quest-ui-dashboard-notification-bell");
const island = bell.parentElement;
const surface = q(".quest-ui-dashboard-notification-surface-rect");
const bellIcon = q(".quest-ui-dashboard-notification-icon");
island.style.transition = "none";
const geometry = () => {
    const parent = island.getBoundingClientRect();
    const child = surface.getBoundingClientRect();
    const icon = bellIcon.getBoundingClientRect();
    return { parentWidth: parent.width, childWidth: child.width, left: child.left - parent.left,
        right: parent.right - child.right, top: child.top - parent.top, height: child.height,
        iconCenter: icon.left + icon.width / 2 - parent.left };
};
const collapsed = geometry();
const aligned = g => Math.abs(g.left - 5) < 1 && Math.abs(g.right - 5) < 1 && Math.abs(g.top - 5) < 1 && Math.abs(g.height - 34) < 1;
check(aligned(collapsed) && Math.abs(collapsed.parentWidth - 44) < 1, "collapsed island must have one evenly inset child");
check(getComputedStyle(bell, "::after").content === "none", "no fixed bell-only child may cover the stretchable surface");
const painted = () => getComputedStyle(bell, "::before");
check(painted().borderImageSource !== "none" && getComputedStyle(island, "::before").borderImageSource !== "none", "both notification layers must use stepped frames");
check(Math.abs(parseFloat(painted().width) - collapsed.childWidth) < 1, "painted child must match the native child geometry");
for (const phase of ["is-visible", "is-idle is-open", "is-exiting"]) {
    island.className = "quest-ui-dashboard-notification-island " + phase;
    const current = geometry();
    check(aligned(current), phase + ": parent and child must keep the same inset");
    check(Math.abs(parseFloat(painted().width) - current.childWidth) < 1, phase + ": painted child must stretch with parent");
    check(Math.abs(current.iconCenter - collapsed.iconCenter) < 1, phase + ": bell center must stay fixed");
    if (phase === "is-exiting") {
        check(Math.abs(current.parentWidth - collapsed.parentWidth) < 1, "exiting island must collapse");
    } else {
        check(current.parentWidth > collapsed.parentWidth + 30 && Math.abs((current.childWidth - collapsed.childWidth) - (current.parentWidth - collapsed.parentWidth)) < 1, phase + ": child must expand by the same amount as parent");
    }
}
island.className = "quest-ui-dashboard-notification-island is-idle";
island.style.removeProperty("transition");
for (const selector of [".quest-ui-filter-list-box", ".quest-ui-filter-list-row:not(.is-checked) .quest-ui-filter-list-box", ".quest-ui-filter-list-row.is-radio .quest-ui-filter-list-box", ".quest-ui-dashboard-choice-list-radio", ".quest-ui-history-step-node"]) {
    const control = style(selector);
    check(!control.boxShadow.includes("inset") && control.borderTopWidth === "1px" && control.borderRadius === "0px", selector + " must retain a single flush frame without a dark moat");
}
check(decodeURIComponent(style(".quest-ui-reload-icon-button svg").maskImage).includes("A8.5 8.5"), "refresh must use the recognizable clockwise arrow");
check(decodeURIComponent(style(".quest-ui-plugin-settings-glyph").maskImage).includes("<circle"), "settings gear must have a defined central aperture");
check(style(".quest-ui-sort-icon").maskImage !== "none", "pixel glyph must be active");
check(decodeURIComponent(style(".quest-ui-sort-icon").maskImage).includes('viewBox="0 0 24 24"'), "glyph must use the fine 24-unit grid");
check(style(".quest-ui-summary-all").borderImageSource !== "none" && style(".quest-ui-summary-all").borderImageSource !== style(".quest-ui-summary-available").borderImageSource, "summary frames must carry semantic colors");
for (const chip of document.querySelectorAll(".quest-ui-summary-chip")) {
    const parent = chip.getBoundingClientRect();
    const child = chip.querySelector(".quest-ui-summary-chip-count").getBoundingClientRect();
    check(parent.right - child.right >= 5 && child.top - parent.top >= 3 && parent.bottom - child.bottom >= 3, "count must fit within stepped summary frame");
}
const bridge = q(".quest-ui-status-bridge");
check(getComputedStyle(bridge, "::before").content.includes(">> <<") && style(".quest-ui-status-bridge-node").display === "none", "Terminal bridge must be ASCII, not a diamond");
const topbar = style(".quest-ui-dashboard-topbar");
const headerRaster = decodeURIComponent(topbar.backgroundImage);
check(headerRaster.includes('viewBox="0 0 208 48"'), "header must use the higher-detail phosphor artwork");
check(topbar.backgroundPositionY === "100%" || topbar.backgroundPositionY === "bottom" || topbar.backgroundPositionY === "bottom 0px", "header artwork must sit on the separator");
check(headerRaster.includes(" 46h1.6v1.6h-1.6z") && !headerRaster.includes(" 46h2v2h-2z"), "header artwork must reach the bottom without an extra solid baseline");
check(topbar.borderBottomStyle === "dashed" && topbar.borderBottomColor !== "rgba(0, 0, 0, 0)", "restore the original dashed header separator");
check(style(".quest-ui-claim-all-count").color === "rgb(5, 32, 18)" && style(".quest-ui-claim-all-count").fontSize === "11px", "Claim All count must be dark and readable");
check(style(".quest-ui-dashboard-boost-source-tag.is-xbox").borderImageSource !== "none" && style(".quest-ui-dashboard-boost-source-tag.is-xbox").backgroundColor === "rgb(8, 32, 22)", "Xbox badge must use a dark stepped frame");
check(decodeURIComponent(style(".quest-ui-dashboard-xbox-icon").maskImage).includes('viewBox="0 0 48 48"'), "Xbox glyph must use the native raster");
const ringFixture = document.createElement("div");
ringFixture.innerHTML = '<div class="quest-ui-progress-ring quest-ui-progress-claimed"><svg><path class="quest-ui-progress-track"/><path class="quest-ui-progress-state-ring"/></svg><svg class="quest-ui-progress-state-icon is-claimed"><path/></svg></div><div class="quest-ui-progress-ring quest-ui-progress-expired"><svg><path class="quest-ui-progress-state-ring"/></svg><svg class="quest-ui-progress-state-icon is-expired"><path/></svg></div><div class="quest-ui-progress-ring quest-ui-progress-in-progress"><svg><path class="quest-ui-progress-value"/></svg></div>';
ringFixture.style.display = "none";
q(".quest-ui-dashboard-shell").append(ringFixture);
for (const selector of [".quest-ui-progress-track", ".quest-ui-progress-value", ".quest-ui-progress-claimed .quest-ui-progress-state-ring", ".quest-ui-progress-expired .quest-ui-progress-state-ring"]) {
    const ring = style(selector);
    check(ring.stroke === "none" && ring.fill !== "none", selector + " must paint raster fills, not smooth strokes");
}
check(style(".quest-ui-progress-claimed .quest-ui-progress-state-ring").fill !== style(".quest-ui-progress-expired .quest-ui-progress-state-ring").fill, "state ring colors must remain distinct");
check(decodeURIComponent(style(".quest-ui-dashboard-palette-icon").maskImage).includes('viewBox="0 0 48 48"'), "palette must retain a fine-grid native glyph");
const artworkFrame = q(".quest-ui-artwork");
const fallbackFrame = getComputedStyle(artworkFrame, "::after").borderImageSource;
artworkFrame.style.setProperty("--terminal-artwork-frame", "url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E')");
check(getComputedStyle(artworkFrame, "::after").borderImageSource !== fallbackFrame, "artwork-derived frame must override the fallback");
artworkFrame.style.removeProperty("--terminal-artwork-frame");
check(style(".quest-ui-dashboard-shell").backgroundImage !== "none", "CRT surface must not be reset");
check(!q(".quest-ui-terminal-footer"), "Terminal footer must be absent");
check(!style(".quest-ui-dashboard-display-title-icon > svg").maskImage || style(".quest-ui-dashboard-display-title-icon > svg").maskImage === "none", "native emblem must not be replaced");
const dashboardSort = style(".quest-ui-dashboard-filter-control");
const filter = q(".quest-ui-filter-button");
const filterFrame = getComputedStyle(filter).borderImageSource;
filter.classList.add("is-open");
check(getComputedStyle(filter).borderImageSource === filterFrame && filterFrame === dashboardSort.borderImageSource, "Filter frame must remain intact while active/open");
filter.classList.remove("is-open");
check(style(".quest-ui-dashboard-notification-unread-dot").borderRadius === "50%", "unread dot must be round");
check(style(".quest-ui-filter-count-badge").fontSize === "10px", "Filter count must be legible");
document.body.dataset.result = errors.length ? "fail" : "pass";
q("#result").textContent = JSON.stringify(errors);
`;

const dir = mkdtempSync(join(tmpdir(), "questui-terminal-"));
try {
    writeFileSync(join(dir, "theme.css"), order.map(n => read("../../src/themes/" + imports.get(n))).join("\n"));
    writeFileSync(join(dir, "fixture.html"), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><body data-result="pending">' + markup + '<pre id="result"></pre><script>' + script + '</script>');
    const proc = spawnSync(chrome, ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", "--allow-file-access-from-files", "--force-device-scale-factor=1", "--virtual-time-budget=5000", "--window-size=1024,900", "--dump-dom", pathToFileURL(join(dir, "fixture.html")).href], { encoding: "utf8", timeout: 45000, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(proc.status, 0, proc.error?.message || proc.stderr);
    assert.ok(proc.stdout.includes('data-result="pass"'), proc.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1]);
    console.log("Terminal visual contract passed.");
} finally {
    rmSync(dir, { recursive: true, force: true });
}
