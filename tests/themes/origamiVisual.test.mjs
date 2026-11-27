// Browser regression using the actual managed Origami stylesheet order.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { makePaperAssets } from "../../src/themes/origami/generatePaperAssets.mjs";
import { makeCrumpledPaper } from "../../src/themes/origami/renderCrumpledPaper.mjs";
import { makeOrigamiScenes } from "../../src/themes/origami/renderOrigamiScenes.mjs";
import { makeFoldedStock } from "../../src/themes/origami/renderFoldedStock.mjs";
import { foldedSheet } from "../../src/themes/origami/bake/foldGeometry.mjs";
import { roughDiffuse } from "../../src/themes/origami/bake/lighting.mjs";
import { origamiSceneSequence, ORIGAMI_ANIMALS } from "../../src/themes/origami/scene.ts";

// A real fold preserves material area and the distance to both hinge
// endpoints. This also checks the two-sided face orientation.
for(const [w,h,folds,end] of [[80,32,[[12,154],[6,55],[11,159],[5,48]],[16,22]],[30,30,[[11,154],[5,52],[9,159],[5,48]],[13,18]],[34,34,[[17,161],[0,0],[0,0],[0,0]],null]]){
    const sheet=foldedSheet(w,h,folds,end);
    assert.ok(Math.abs(sheet.faces.reduce((sum,t)=>sum+t.area,0)-w*h)<1e-7,"folds preserve sheet area");
    for(const [i,f] of sheet.flaps.entries()){
        for(const a of f.hinge){
            const distance=(p,q)=>Math.hypot(...p.map((v,j)=>v-q[j]));
            assert.ok(Math.abs(distance(f.tip,a)-distance(f.folded,a))<1e-8,"rigid hinge preserves edge length");
        }
        assert.ok(f.folded[2]>0,"fold rises toward camera");
    }
    assert.ok(sheet.flaps.some(f=>f.face.n[2]<0),"reverse paper face visible");
}
assert.ok(Math.abs(roughDiffuse([0,0,1],[0,0,1],0)-1)<1e-10,"zero roughness diffuse limit");
assert.equal(roughDiffuse([0,0,1],[0,0,-1]),0,"backlit opaque face");
const sceneIds=Array.from({length:150},(_,i)=>String(i));
for(const ids of [sceneIds,[...sceneIds].reverse(),sceneIds.filter((_,i)=>i%3===0),Array(30).fill("same-hash")]){
    const sequence=origamiSceneSequence(ids);
    assert.deepEqual(sequence,origamiSceneSequence(ids),"same displayed order is deterministic");
    for(let i=0;i<sequence.length;i++){
        assert.ok(ORIGAMI_ANIMALS.includes(sequence[i]));
        assert.ok(!sequence.slice(Math.max(0,i-9),i).includes(sequence[i]),"no repeat in any ten-card window");
    }
}
assert.deepEqual(origamiSceneSequence([]),[]);
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const registry = read("../../src/themes/registry.ts");
const generated = read("../../src/themes/origami/paper-assets.css");
const footer = decodeURIComponent(generated.match(/--origami-art-footer: url\("data:image\/svg\+xml,([^"]+)"\)/)[1]);
assert.equal(makePaperAssets(footer), generated, "Origami asset generator must reproduce the committed assets");
assert.equal(makeCrumpledPaper(), read("../../src/themes/origami/crumpled-paper.css"), "Crumpled paper bake must reproduce the committed assets");
assert.equal(makeOrigamiScenes(), read("../../src/themes/origami/scene-assets.css"), "Scene bake must reproduce the committed assets");
assert.equal(makeFoldedStock(), read("../../src/themes/origami/polish-stock.css"), "Folded stock bake must reproduce the committed assets");
// Verify the exact neutral-lighting artwork payloads before the browser decodes them.
for (const [file, count] of [["animal-assets.css",10],["card-stock.css",3]]) {
    const content = read("../../src/themes/origami/"+file);
    const entries = [...content.matchAll(/\/\* ([\w-]+): (\d+) bytes, sha256 ([a-f0-9]+) \*\/\s+--origami-(?:animal|card)-\1: url\("data:image\/webp;base64,([A-Za-z0-9+/=]+)"\);/g)];
    assert.equal(entries.length,count,file+" expected artwork count");
    for (const [,name,size,digest,b64] of entries) {
        const bytes = Buffer.from(b64,"base64");
        assert.equal(bytes.length,Number(size),name+" encoded byte count");
        assert.equal(createHash("sha256").update(bytes).digest("hex"),digest,name+" artwork digest");
    }
}
const restoredRing = read("../../src/themes/origami/card-stock.css").match(/--origami-card-ring: url\("data:image\/webp;base64,([A-Za-z0-9+/=]+)"\)/)[1];
assert.equal(createHash("sha256").update(Buffer.from(restoredRing,"base64")).digest("hex"),"91b31218bc55b0726943a6be619c698718e8ae3cf4bcda8e07c31b74fb777ece","preserve the approved original ring");
const imports = new Map([...registry.matchAll(/import\s+(\w+)\s+from\s+"\.\/([^"]+)\?managed";/g)].map(m => [m[1], m[2]]));
const order = registry.match(/id:\s*"origami"[\s\S]*?styles:\s*\[([\s\S]*?)\]/)?.[1].split(",").map(s => s.trim()).filter(Boolean);
assert.ok(order?.length && order.every(name => imports.get(name)?.startsWith("origami/")), "Origami must own its styles");
// Check the runtime consumer graph, not references in fixtures or historical docs.
const managedCss = order.map(name => read("../../src/themes/" + imports.get(name))).join("\n");
for (const filename of ["animal-assets.css","card-stock.css","control-raster.css","crumpled-paper.css","header-raster.css","paper-assets.css","polish-stock.css","scene-assets.css"]) {
    const css = read("../../src/themes/origami/" + filename);
    for (const [, token] of css.matchAll(/(--origami-[\w-]+)\s*:/g)) {
        assert.ok(new RegExp("var\\(\\s*" + token + "(?=[,\\s)])").test(managedCss), "Unused Origami asset token: " + token);
    }
}
const chrome = process.env.CHROME_BIN || ["google-chrome", "chromium", "chromium-browser"].find(n => spawnSync(n, ["--version"], { encoding: "utf8" }).status === 0);
assert.ok(chrome, "Chrome/Chromium not found");
const root = "quest-ui-theme quest-ui-theme-origami";
const animalNames = ["crane","whale","wolf","rabbit","fox","butterfly","elephant","turtle","koi","owl"];
const pigments = ["186 32 48","32 109 183","26 26 30","224 205 190","187 99 26","139 63 177","109 112 115","34 126 83","232 169 39","234 234 234"];
const cards = animalNames.map((name,i) =>
    '<article class="quest-ui-card quest-ui-card-claimable'+(i===9?' quest-ui-card-achievement':'')+'" data-origami-scene="' + name + '" style="--origami-animal-rgb:'+pigments[i]+'"><span class="quest-ui-origami-card-paper" aria-hidden="true"></span><span class="quest-ui-origami-card-animal" aria-hidden="true"></span><div class="quest-ui-artwork"><div class="quest-ui-artwork-fallback"></div></div><div class="quest-ui-card-main"><strong class="quest-ui-card-title">Quest '+i+'</strong><div class="quest-ui-card-status-line"><span class="quest-ui-card-status-dot"></span><span class="quest-ui-card-status">Ready to claim</span></div><div class="quest-ui-card-meta-row"><span class="quest-ui-card-reward">Reward: 840 Orbs</span><button class="quest-ui-card-action quest-ui-card-action-claim">Claim Reward</button></div></div><div class="quest-ui-card-side'+(i===9?' is-achievement':'')+'">'+(i===9?'<div class="quest-ui-achievement-progress"><div class="quest-ui-achievement-progress-copy"><strong>2/5</strong><span>tasks done</span></div><div class="quest-ui-achievement-progress-segments" style="grid-template-columns:repeat(5,minmax(0,1fr))"><span class="is-filled"></span><span class="is-filled"></span><span></span><span></span><span></span></div></div>':'<div class="quest-ui-progress-ring quest-ui-progress-claimable"><div class="quest-ui-origami-ring-art" style="--origami-ring-completion:'+(i===0?'0':i===1?'65':'100')+'%" aria-hidden="true"></div><span>'+(i===0?'0':i===1?'65':'100')+'%</span></div>')+'</div></article>'
).join("");
let markup = '<div class="'+root+' quest-ui-dashboard-shell"><div class="quest-ui-dashboard-topbar"><div class="quest-ui-dashboard-display-title"><span class="quest-ui-dashboard-display-title-icon"><svg viewBox="0 0 24 24"><path d="M12 2L22 12 12 22 2 12Z"/></svg></span><strong>Quest Dashboard</strong><span class="quest-ui-dashboard-boost-source-tag is-nitro"><span class="quest-ui-dashboard-boost-source-wordmark">Nitro</span></span></div><div class="quest-ui-dashboard-header-tools"><button class="quest-ui-dashboard-palette-button">P</button><button class="quest-ui-dashboard-orb-balance"><strong>70270</strong></button></div></div><div class="quest-ui-dashboard-actionbar"><div class="quest-ui-dashboard-actionbar-left"><div class="quest-ui-dashboard-actionbar-primary"><div class="quest-ui-orion-controls"><button class="quest-ui-orion-icon-button is-start">Start</button><button class="quest-ui-orion-icon-button is-stop" disabled>Stop</button></div><button class="quest-ui-toolbar-button quest-ui-claim-all-button"><span class="quest-ui-claim-all-label">Claim All</span><span class="quest-ui-claim-all-count">4</span></button><span class="quest-ui-dashboard-action-divider"></span><button class="quest-ui-reload-icon-button">R</button><button class="quest-ui-toolbar-button">U</button><button class="quest-ui-event-log-button">L</button></div></div><div class="quest-ui-dashboard-notification-region"><button class="quest-ui-dashboard-notification-island is-idle"><span class="quest-ui-dashboard-notification-bell"><svg class="quest-ui-dashboard-notification-surface"><rect class="quest-ui-dashboard-notification-surface-rect" rx="17" ry="17"/></svg><svg class="quest-ui-dashboard-notification-icon" viewBox="0 0 24 24"><path d="M4 4L20 20"/></svg></span><span class="quest-ui-dashboard-notification-measure"><span>Quest list refreshed</span></span><span class="quest-ui-dashboard-notification-copy"><span class="quest-ui-dashboard-notification-text">Quest list refreshed</span></span></button></div><div class="quest-ui-dashboard-actionbar-destinations"><button class="quest-ui-toolbar-button quest-ui-market-button">M</button><button class="quest-ui-toolbar-button quest-ui-home-button">H</button></div></div><div class="quest-ui-dashboard"><div class="quest-ui-dashboard-header"><div class="quest-ui-default-status-strip"><div class="quest-ui-default-status-product is-orion"><div><span class="quest-ui-default-status-name">Orion Quest</span><span class="quest-ui-version-chip is-stable">v4.11.5</span></div><div class="quest-ui-default-status-state"><span class="quest-ui-product-update-chip is-current">You are up to date</span></div><button class="quest-ui-status-settings-button">S</button></div><div class="quest-ui-status-bridge is-connected"><span class="quest-ui-status-bridge-line"></span><span class="quest-ui-status-bridge-node"></span><span class="quest-ui-status-bridge-line"></span></div><div class="quest-ui-default-status-product is-questui"><div><span class="quest-ui-default-status-name">QuestUI</span><span class="quest-ui-version-chip is-beta">v1.6.0-beta2</span></div><div class="quest-ui-default-status-state"><span class="quest-ui-product-update-chip is-current">You are up to date</span></div><button class="quest-ui-status-settings-button">S</button></div></div><div class="quest-ui-dashboard-summary"><button class="quest-ui-summary-chip quest-ui-summary-available">Available <span class="quest-ui-summary-chip-count">0</span></button><button class="quest-ui-summary-chip quest-ui-summary-claimable">Ready <span class="quest-ui-summary-chip-count">4</span></button></div><div class="quest-ui-dashboard-filter-tools"><h2 class="quest-ui-dashboard-list-title">Quest List</h2><button class="quest-ui-dashboard-filter-control quest-ui-sort-button">Sort: Expiring Soon</button><button class="quest-ui-dashboard-filter-control quest-ui-filter-button is-active">Filter <span class="quest-ui-filter-count-badge">1</span></button></div></div><div class="quest-ui-dashboard-content">'+cards+'</div></div></div><div class="'+root+' quest-ui-update-panel quest-ui-update-panel-v16"><div class="quest-ui-update-banner is-current"><span class="quest-ui-update-banner-mark">OK</span></div><div class="quest-ui-update-banner has-error"><span class="quest-ui-update-banner-mark">Error</span></div><header class="quest-ui-update-panel-heading"><div class="quest-ui-update-panel-title"><span class="quest-ui-update-panel-title-icon">U</span><strong>Update Center</strong></div><div class="quest-ui-update-panel-heading-actions"><button class="quest-ui-update-check-button">Check now</button></div></header><div class="quest-ui-update-product-list"><div class="quest-ui-update-product-entry is-current"><div class="quest-ui-update-product-row"><div class="quest-ui-update-product-identity"><span class="quest-ui-update-row-version is-beta">v1.6.0-beta2</span></div><div class="quest-ui-update-product-row-meta">Up to date</div><button class="quest-ui-update-github-button">G</button></div></div><div class="quest-ui-update-product-entry is-available"><div class="quest-ui-update-product-expanded"><div class="quest-ui-update-card"><div class="quest-ui-update-card-actions"><button>Update</button><button class="quest-ui-update-restart">Restart Discord</button></div><div class="quest-ui-update-decision"><div class="quest-ui-update-decision-actions"><button>Keep</button><button class="is-destructive">Discard &amp; update</button></div></div></div></div></div></div></div><div class="'+root+' quest-ui-notification-center-panel"><div class="quest-ui-notification-center-header"><strong>Notifications</strong><span class="quest-ui-notification-center-unread has-unread">2 unread</span></div><div class="quest-ui-notification-center-account"><span class="quest-ui-notification-center-avatar">H</span><span class="quest-ui-notification-center-account-copy"><strong>Account</strong><span>@account</span></span><span class="quest-ui-notification-center-current-chip">Current account</span></div><div class="quest-ui-notification-center-actions"><button class="quest-ui-notification-center-action">Mark all read</button><button class="quest-ui-notification-center-action">Mark all unread</button><button class="quest-ui-notification-center-action is-danger">Clear Notification</button></div><div class="quest-ui-notification-center-list"><div class="quest-ui-notification-center-row is-error is-unread"><span class="quest-ui-notification-center-row-artwork"><span class="quest-ui-notification-center-row-artwork-fallback">!</span><span class="quest-ui-notification-center-task-badge">Q</span></span><div class="quest-ui-notification-center-row-main">Example</div></div></div></div>';
markup += "<div class=\"quest-ui-theme quest-ui-theme-origami quest-ui-dashboard-choice-list\"><button>Default</button><button class=\"is-selected\">Origami<span class=\"quest-ui-dashboard-choice-list-radio\"><span></span></span></button></div><div class=\"quest-ui-theme quest-ui-theme-origami quest-ui-filter-list\"><button class=\"quest-ui-filter-list-row is-ready is-checked\"><span class=\"quest-ui-filter-list-box\">✓</span>Ready</button><button class=\"quest-ui-filter-list-row\"><span class=\"quest-ui-filter-list-box\"></span>Other</button></div><div class=\"quest-ui-theme quest-ui-theme-origami quest-ui-event-sort-menu\"><button class=\"is-selected\">Newest<span class=\"quest-ui-event-sort-radio\"><span></span></span></button></div><div class=\"quest-ui-theme quest-ui-theme-origami quest-ui-event-filter-menu\"><button class=\"quest-ui-event-filter-list-row tone-error is-checked\"><span class=\"quest-ui-event-filter-list-box\">✓</span>Error</button></div><div class=\"quest-ui-theme quest-ui-theme-origami quest-ui-event-log-panel quest-ui-event-surface\"><div class=\"quest-ui-event-log-header\"><strong>Event Log</strong><span class=\"quest-ui-event-storage is-watch\"><svg class=\"quest-ui-event-storage-icon\" viewBox=\"0 0 16 16\"><circle cx=\"8\" cy=\"8\" r=\"5\"/></svg><span class=\"quest-ui-event-storage-used\">7.1 MB</span><span class=\"quest-ui-event-storage-separator\">/</span><span class=\"quest-ui-event-storage-limit\">10.0 MB</span></span></div><div class=\"quest-ui-event-search-shell\"><input class=\"quest-ui-event-search\"></div><div class=\"quest-ui-event-log-actions\"><button class=\"quest-ui-event-flat-control\">Sort</button><div class=\"quest-ui-event-action-island\"><button class=\"quest-ui-event-island-icon-button\">Folder</button><div class=\"quest-ui-event-clean-island\"><button class=\"quest-ui-event-clean-trigger\" aria-expanded=\"false\">Clean</button><div class=\"quest-ui-event-clear-confirm\"><span class=\"quest-ui-event-clear-confirm-text\">Clear log? 5s</span><div class=\"quest-ui-event-clear-confirm-actions\"><button class=\"quest-ui-event-clear-confirm-button is-confirm\">Yes</button><button class=\"quest-ui-event-clear-confirm-button is-cancel\">No</button></div></div></div></div></div><article class=\"quest-ui-event-row is-error is-category-network\"><span>12:00</span><span class=\"quest-ui-event-severity is-error\">X</span><div class=\"quest-ui-event-copy\">Failure</div><button class=\"quest-ui-event-view-detail\">View details</button></article></div><div class=\"quest-ui-theme quest-ui-theme-origami quest-ui-event-detail quest-ui-event-surface\"><button class=\"quest-ui-event-detail-back\">Back</button><div class=\"quest-ui-event-detail-meta-card\">Metadata</div><section class=\"quest-ui-event-detail-callout is-reason\">Reason</section><section class=\"quest-ui-event-detail-diagnostic\"><pre>Stack trace</pre></section></div>";
markup = markup.replace('<button class="quest-ui-filter-list-row"><span class="quest-ui-filter-list-box"></span>Other</button>', "<button class=\"quest-ui-filter-list-row\"><span class=\"quest-ui-filter-list-box\"></span>Other</button><div class=\"quest-ui-history-steps\" style=\"--quest-ui-history-step:4\"><div class=\"quest-ui-history-steps-track\"><span class=\"quest-ui-history-steps-line\"></span><span class=\"quest-ui-history-steps-fill\"></span><div class=\"quest-ui-history-steps-nodes\" role=\"radiogroup\"><button class=\"is-reached\" role=\"radio\" aria-checked=\"false\"><span class=\"quest-ui-history-step-node\"><span></span></span><span class=\"quest-ui-history-step-label\">7d</span></button><button class=\"is-reached\" role=\"radio\" aria-checked=\"false\"><span class=\"quest-ui-history-step-node\"><span></span></span><span class=\"quest-ui-history-step-label\">15d</span></button><button class=\"is-reached\" role=\"radio\" aria-checked=\"false\"><span class=\"quest-ui-history-step-node\"><span></span></span><span class=\"quest-ui-history-step-label\">30d</span></button><button class=\"is-reached\" role=\"radio\" aria-checked=\"false\"><span class=\"quest-ui-history-step-node\"><span></span></span><span class=\"quest-ui-history-step-label\">90d</span></button><button class=\"is-reached is-selected\" role=\"radio\" aria-checked=\"true\"><span class=\"quest-ui-history-step-node\"><span></span></span><span class=\"quest-ui-history-step-label\">All</span></button></div></div></div>");
const script = String.raw`
const errors = [];
window.addEventListener("error",event=>{
    document.body.dataset.result="fail";
    document.querySelector("#result").textContent=JSON.stringify([...errors,event.message || "browser script error"]);
});
const check = (ok, message) => { if (!ok) errors.push(message); };
const q = s => document.querySelector(s);
const css = (s,p) => getComputedStyle(q(s),p);
const shell = css(".quest-ui-dashboard-shell");
check(Math.abs(parseFloat(shell.width) - Math.min(820,innerWidth-24)) <= 1,"dashboard width must retain the native 820px cap");
check(parseFloat(css(".quest-ui-dashboard-topbar").minHeight) === 50,"native topbar height");
check(!shell.fontFamily.toLowerCase().includes("monospace"),"dashboard must not inherit Terminal typography");
const materials = ["footer","fold","fold-left","fold-right","header-green","header-leaf"];
for (const name of materials) {
    const value = shell.getPropertyValue("--origami-art-"+name).trim();
    const uri = value.replace(/^url\(["']?/,"").replace(/["']?\)$/,"");
    const xml = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    const parsed = new DOMParser().parseFromString(xml,"image/svg+xml");
    check(uri.startsWith("data:image/svg+xml,") && parsed.documentElement.localName === "svg" && !parsed.querySelector("parsererror"), name + " is valid local SVG");
}
for (const selector of [".quest-ui-dashboard-choice-list",".quest-ui-filter-list",".quest-ui-event-sort-menu",".quest-ui-event-filter-menu",".quest-ui-event-log-panel",".quest-ui-event-detail"]) {
    const portal=css(selector);
    check(portal.backgroundImage.includes("data:image/png;base64,") && portal.borderRadius==="3px","paper portal "+selector);
    check(portal.clipPath==="none","portal does not clip nested menus "+selector);
}
for (const selector of [".quest-ui-dashboard-choice-list .is-selected",".quest-ui-filter-list-row.is-checked",".quest-ui-event-sort-menu .is-selected",".quest-ui-event-filter-list-row.is-checked",".quest-ui-event-flat-control",".quest-ui-event-view-detail",".quest-ui-event-detail-back",".quest-ui-event-row",".quest-ui-event-detail-meta-card"]) {
    check(css(selector).backgroundImage.includes("data:image/png;base64,"),"paper control or sheet "+selector);
}
check(css(".quest-ui-filter-list-row.is-ready .quest-ui-filter-list-box").backgroundColor==="rgb(22, 134, 76)","ready checkbox semantic paper");
check(css(".quest-ui-event-filter-list-row.tone-error .quest-ui-event-filter-list-box").backgroundColor==="rgb(197, 54, 72)","error checkbox semantic paper");
check(css(".quest-ui-event-log-panel").isolation==="auto" && css(".quest-ui-event-log-panel").zIndex==="auto","nested popout stacking unchanged");
check(css(".quest-ui-event-island-icon-button").backgroundImage.includes("data:image/png;base64,"),"folder uses folded paper stock");
const cleanIsland=q(".quest-ui-event-clean-island");
const cleanConfirm=q(".quest-ui-event-clear-confirm");
const cleanTrigger=q(".quest-ui-event-clean-trigger");
cleanIsland.style.transition="none";
cleanConfirm.style.transition="none";
const childStock=css(".quest-ui-event-island-icon-button").backgroundImage;
for (const expanded of [false,true,false]) {
    cleanIsland.classList.toggle("is-expanded",expanded);
    cleanTrigger.setAttribute("aria-expanded",String(expanded));
    const style=getComputedStyle(cleanIsland);
    const trigger=getComputedStyle(cleanTrigger);
    check(style.backgroundImage==="none" && style.backgroundColor==="rgba(0, 0, 0, 0)" && style.borderImageSource===childStock && style.borderImageSlice==="20 fill" && style.borderImageWidth==="12px" && style.clipPath==="none","one continuously sliced expandable paper child "+expanded);
    check(trigger.backgroundImage==="none" && trigger.backgroundColor==="rgba(0, 0, 0, 0)" && trigger.borderImageSource==="none" && trigger.boxShadow==="none","clear trigger never paints a second paper layer "+expanded);
    check(Math.abs(cleanIsland.getBoundingClientRect().width-(expanded?196:36))<=1 && style.borderTopWidth==="1px","native clear island geometry "+expanded);
    if (expanded) {
        const outer=cleanIsland.getBoundingClientRect();
        const content=cleanConfirm.getBoundingClientRect();
        check(content.width>=150 && content.left>=outer.left && content.right<=outer.right && getComputedStyle(cleanConfirm).opacity==="1","expanded paper covers the full confirmation content");
        for(const button of cleanConfirm.querySelectorAll("button")) {
            const r=button.getBoundingClientRect();
            check(r.right<=outer.right && r.left>=content.left && r.width>=26,"confirmation action fits expanded paper");
        }
    }
}
cleanIsland.style.removeProperty("transition");
cleanConfirm.style.removeProperty("transition");
check(css(".quest-ui-event-action-island").borderImageSource.includes("data:image/svg+xml,"),"shared file tray retains paper frame");
check(css(".quest-ui-event-row").boxShadow.includes("rgb(184, 61, 75)"),"error severity wins over category");
check(css(".quest-ui-event-row").clipPath.startsWith("polygon(") && css(".quest-ui-event-view-detail").clipPath.startsWith("polygon("),"cut paper silhouettes on rows and leaf actions");
for (const selector of [".quest-ui-event-row",".quest-ui-event-flat-control",".quest-ui-event-view-detail",".quest-ui-event-detail-back",".quest-ui-update-check-button",".quest-ui-update-banner.is-current",".quest-ui-update-banner.has-error",".quest-ui-update-product-entry",".quest-ui-update-row-version",".quest-ui-update-decision",".quest-ui-event-detail-meta-card"]) {
    const style=css(selector);
    const source=style.borderImageSource;
    const xml=decodeURIComponent(source.replace(/^url\(["']?/,"").replace(/["']?\)$/,"").slice("data:image/svg+xml,".length));
    const parsed=new DOMParser().parseFromString(xml,"image/svg+xml");
    check(source.includes("data:image/svg+xml,") && parsed.documentElement.localName==="svg" && !parsed.querySelector("parsererror"),"continuous local frame "+selector);
    check(style.borderRadius==="0px" && style.borderImageSlice!=="100%","fixed corner geometry "+selector);
}
check(css(".quest-ui-update-panel").clipPath==="none" && css(".quest-ui-update-panel").borderRadius==="0px" && css(".quest-ui-update-panel").backgroundImage.includes("data:image/png;base64,"),"unclipped unfolded Update Center");
check(css(".quest-ui-update-product-entry").clipPath==="none","expanded product sheet never clips its children with a polygon");
check(css(".quest-ui-update-panel-title-icon").backgroundImage.includes("data:image/png;base64,") && css(".quest-ui-update-github-button").backgroundImage.includes("data:image/png;base64,"),"Update Center folded paper icon stamps");
check(css(".quest-ui-update-banner.is-current").borderImageSource!==css(".quest-ui-update-banner.has-error").borderImageSource,"semantic update banner frames");
check(css(".quest-ui-update-check-button").clipPath.startsWith("polygon("),"Update Center leaf silhouette");
for (const selector of [".quest-ui-event-flat-control",".quest-ui-event-view-detail",".quest-ui-update-check-button",".quest-ui-update-decision-actions > .is-destructive"]) {
    const button=q(selector);
    const normal=css(selector).borderImageSource;
    button.focus({preventScroll:true});
    check(document.activeElement===button,"native focus "+selector);
    if (button.matches(":focus-visible")) check(css(selector).borderImageSource!==normal,"focus frame "+selector);
    button.blur();
}
check(css(".quest-ui-event-severity").backgroundImage.includes("data:image/png;base64,"),"severity has folded paper stamp");
const history=q(".quest-ui-history-steps");
const nodes=[...history.querySelectorAll(".quest-ui-history-steps-nodes > button")];
for(let selected=0;selected<5;selected++) {
    history.style.setProperty("--quest-ui-history-step",selected);
    nodes.forEach((node,i)=>{node.classList.toggle("is-selected",i===selected);node.classList.toggle("is-reached",i<=selected);node.setAttribute("aria-checked",String(i===selected));});
    check(nodes.every(node=>getComputedStyle(node).backgroundImage==="none" && getComputedStyle(node).backgroundColor==="rgba(0, 0, 0, 0)" && getComputedStyle(node).boxShadow==="none"),"history button never inherits menu selection background "+selected);
    check(nodes.every(node=>{const style=getComputedStyle(node.querySelector(".quest-ui-history-step-node"));return style.clipPath.startsWith("polygon(") && style.backgroundImage.includes("data:image/png;base64,");}),"folded paper milestones "+selected);
    const track=history.querySelector(".quest-ui-history-steps-track").getBoundingClientRect();
    const fill=history.querySelector(".quest-ui-history-steps-fill").getBoundingClientRect();
    check(Math.abs(fill.width-(track.width-18)*selected/4)<=1,"cumulative history fill "+selected);
}
const rows = [...document.querySelectorAll("[data-origami-scene]")];
check(rows.length === 10,"ten animals in fixture");
check(new Set(rows.map(row=>getComputedStyle(row).getPropertyValue("--origami-animal-image"))).size === 10,"ten distinct animal images");
check(new Set(rows.map(row=>getComputedStyle(row).getPropertyValue("--origami-terrain-image"))).size === 10,"ten independent panorama artworks");
check(new Set(rows.map(row=>getComputedStyle(row,"::before").backgroundImage)).size === 10,"ten fixed scene compositions");
check(new Set(rows.map(row=>getComputedStyle(row).getPropertyValue("--origami-animal-height"))).size >= 7,"species-specific scale");
for (const row of rows) {
    const style = getComputedStyle(row);
    const scenery = getComputedStyle(row,"::before");
    const animal = row.querySelector(".quest-ui-origami-card-animal");
    const art = getComputedStyle(animal,"::before");
    check(scenery.backgroundImage.includes("data:image/png;base64,") && scenery.pointerEvents === "none","raster terrain must not intercept input");
    check(scenery.backgroundSize.split(",")[0].trim() === "cover" && scenery.maskImage.includes("linear-gradient"),"single terrain covers entire scene without exposing the pigment gradient");
    check((scenery.backgroundImage.match(/data:image\/png;base64,/g) ?? []).length === 1 && scenery.backgroundRepeat.split(",")[0].trim() === "no-repeat","exactly one non-repeating terrain raster");
    check(parseFloat(scenery.width) >= row.getBoundingClientRect().width*.50,"terrain covers the previously empty middle");
    const foreground = getComputedStyle(animal,"::after");
    check(foreground.content === "none" && foreground.backgroundImage === "none","no duplicate terrain crop or internal seam");
    const paperLayer = row.querySelector(".quest-ui-origami-card-paper");
    const paper = getComputedStyle(paperLayer,"::before");
    check(style.backgroundImage==="none" && style.backgroundColor==="rgba(0, 0, 0, 0)" && paper.backgroundImage.includes("data:image/png;base64,") && !paper.backgroundImage.includes("linear-gradient"),"scene fades into one cut neutral paper backing");
    check(art.backgroundImage.includes("data:image/webp;base64,") && art.maskImage.includes("data:image/webp;base64,"),"animal lighting and alpha silhouette");
    const expectedPigment = document.createElement("span");
    expectedPigment.style.backgroundColor = "rgb("+row.style.getPropertyValue("--origami-animal-rgb")+")";
    row.appendChild(expectedPigment);
    const expectedColor = getComputedStyle(expectedPigment).backgroundColor;
    expectedPigment.remove();
    check(art.backgroundBlendMode.split(",")[0].trim() === "hard-light" && art.backgroundColor === expectedColor,"thumbnail pigment reaches animal: "+art.backgroundBlendMode+" "+art.backgroundColor+" expected "+expectedColor);
    const frame = getComputedStyle(animal);
    check(frame.pointerEvents === "none" && frame.position === "absolute","animal is decorative and out of layout");
    check(frame.right === scenery.right && frame.width === scenery.width && frame.height === scenery.height,"animal and landscape share one composition frame");
    const oldPigment = row.style.getPropertyValue("--origami-animal-rgb");
    const oldTerrain = scenery.backgroundImage, oldPaper = paper.backgroundImage, oldBorder = style.borderColor;
    const oldCorners = getComputedStyle(row,"::after").backgroundColor;
    const oldEdge = getComputedStyle(paperLayer,"::after").backgroundColor;
    const oldAnimal = art.backgroundColor;
    row.style.setProperty("--origami-animal-rgb","3 17 231");
    check(getComputedStyle(animal,"::before").backgroundColor !== oldAnimal,"animal reacts to thumbnail pigment");
    check(getComputedStyle(row,"::before").backgroundImage === oldTerrain && getComputedStyle(paperLayer,"::before").backgroundImage === oldPaper && getComputedStyle(row).borderColor === oldBorder && getComputedStyle(row,"::after").backgroundColor === oldCorners && getComputedStyle(paperLayer,"::after").backgroundColor === oldEdge,"thumbnail pigment never leaks to landscape, backing or corners");
    row.style.removeProperty("--origami-animal-rgb");
    check(getComputedStyle(animal,"::before").backgroundColor !== "rgba(0, 0, 0, 0)","monochrome fallback uses fixed scene pigment");
    row.style.setProperty("--origami-animal-rgb",oldPigment);
    check(getComputedStyle(row.querySelector(".quest-ui-card-title")).fontFamily.startsWith("Arial"),"actual card title uses proportional type");
    check(parseFloat(style.minHeight) === 118,"native card minimum height");
    const corners = getComputedStyle(row,"::after");
    check(corners.pointerEvents === "none","corners must not intercept input");
    check(corners.maskImage==="none" && corners.backgroundColor==="rgba(0, 0, 0, 0)","corner shading is translucent, never a colored patch");
    const cornerSizes = corners.backgroundSize.split(",").map(size=>size.trim());
    check(cornerSizes.length===4 && cornerSizes.every(size=>size==="34px 34px"),"four fixed-size matte wraps");
    check((corners.backgroundImage.match(/data:image\/png;base64,/g) ?? []).length===4 && !corners.backgroundImage.includes("linear-gradient") && style.borderTopWidth==="1px" && style.borderTopColor==="rgba(0, 0, 0, 0)","only one decorative folded perimeter; no rectangular border");
    check(paper.clipPath.startsWith("polygon(") && paper.clipPath===corners.clipPath && style.clipPath==="none" && style.overflow==="visible","paper and folds share cut outline without clipping native controls");
    check(getComputedStyle(paperLayer).pointerEvents==="none" && getComputedStyle(paperLayer).filter.includes("drop-shadow"),"paper silhouette casts independent shadow");
    const edge=getComputedStyle(paperLayer,"::after");
    check(edge.clipPath===paper.clipPath && Number(edge.zIndex)<Number(paper.zIndex) && paper.top==="0px" && edge.transform!=="none","dyed edge is the substrate beneath the ivory sheet");
    check(new Set(corners.backgroundPosition.split(",").slice(0,4).map(position=>position.trim())).size===4,"corner tabs occupy four distinct corners");
    const originalWidth = row.style.width;
    for (const width of [480,680,880,1040]) {
        row.style.width = width+"px";
        const resized = getComputedStyle(row,"::before");
        check(resized.backgroundSize.split(",")[0].trim()==="cover" && getComputedStyle(animal,"::after").content==="none","seam-free cover contract at "+width+"px");
    }
    row.style.width = originalWidth;
}
const rings = [...document.querySelectorAll(".quest-ui-origami-ring-art")];
for (const ring of rings) {
    const active = getComputedStyle(ring,"::after");
    check(active.maskImage.includes("data:image/webp;base64,") && active.maskImage.includes("conic-gradient") && active.maskComposite.includes("intersect"),"raster ring reveals native progress continuously");
    check(active.maskSize === "196% 196%, 100% 100%" && active.backgroundSize.startsWith("196% 196%"),"original ring artwork compensates for source alpha padding");
    check(Math.abs(ring.getBoundingClientRect().width-56)<=1 && Math.abs(ring.getBoundingClientRect().height-56)<=1,"native full-size 56px stat ring");
    check(getComputedStyle(ring.parentElement.querySelector("span")).fontSize === "14px","stat label remains readable");
}
check(getComputedStyle(rings[0]).getPropertyValue("--origami-ring-completion").trim()==="0%" && getComputedStyle(rings[1]).getPropertyValue("--origami-ring-completion").trim()==="65%","partial and zero progress");
const segments = [...document.querySelectorAll(".quest-ui-achievement-progress-segments > span")];
check(segments.length===5 && segments.every(segment=>{const style=getComputedStyle(segment);return style.borderImageSource.includes("data:image/png;base64,") && style.borderImageSlice==="0 18 fill" && style.borderImageWidth==="0 9px" && style.backgroundImage==="none" && style.filter.includes("drop-shadow");}),"five thin folded achievement tiles with fixed ends");
check(css(".quest-ui-achievement-progress-segments").columnGap==="3px" && segments.every(segment=>Math.abs(segment.getBoundingClientRect().height-16)<1),"separate readable progress tiles");
const filledSegment = shell.getPropertyValue("--origami-fold-segment-filled").trim().slice(5,-2), emptySegment = shell.getPropertyValue("--origami-fold-segment-empty").trim().slice(5,-2);
check(filledSegment!==emptySegment && filledSegment.length>100 && emptySegment.length>100,"two independent baked progress pigments");
for (const count of [0,1,2,3,4,5]) {
    segments.forEach((segment,i)=>segment.classList.toggle("is-filled",i<count));
    check(segments.filter(segment=>getComputedStyle(segment).borderImageSource.includes(filledSegment)).length===count && segments.filter(segment=>getComputedStyle(segment).borderImageSource.includes(emptySegment)).length===5-count,"correct filled and empty sheets at "+count+"/5");
}
segments.forEach((segment,i)=>segment.classList.toggle("is-filled",i<2));
check(css(".quest-ui-dashboard-topbar","::before").backgroundImage.includes("data:image/webp;base64,"),"header artwork");
const title = q(".quest-ui-dashboard-display-title");
const nitro = q(".quest-ui-dashboard-boost-source-tag");
const tools = q(".quest-ui-dashboard-header-tools");
const headerArt = css(".quest-ui-dashboard-topbar","::before");
check(css(".quest-ui-dashboard-display-title").backgroundImage === "none","title group must not wrap Nitro in ivory");
check(css(".quest-ui-dashboard-display-title","::before").backgroundImage.includes("data:image/png;base64,") && css(".quest-ui-dashboard-display-title","::before").maskImage.includes("data:image/webp;base64,"),"title paints paper and uses only the original alpha outline");
check(css(".quest-ui-dashboard-display-title","::before").gridColumnEnd === "3","title paper spans icon and text only");
check(parseFloat(css(".quest-ui-dashboard-display-title","::before").marginRight) === 0 && parseFloat(css(".quest-ui-dashboard-boost-source-tag").marginLeft) === 0,"title and Nitro have no negative overlap");
check(css(".quest-ui-dashboard-boost-source-tag").backgroundImage !== css(".quest-ui-dashboard-orb-balance").backgroundImage,"Nitro and Orb balance use distinct fixed folds");
const premium=q(".quest-ui-dashboard-boost-source-tag"),nitroPaper=css(".quest-ui-dashboard-boost-source-tag").backgroundImage;
premium.classList.replace("is-nitro","is-xbox");
check(css(".quest-ui-dashboard-boost-source-tag").backgroundImage!==nitroPaper && css(".quest-ui-dashboard-boost-source-tag").backgroundColor==="rgb(23, 110, 60)","Xbox+ has its own green paper");
premium.classList.replace("is-xbox","is-nitro");
check(css(".quest-ui-dashboard-palette-button").backgroundImage.includes("data:image/png;base64,"),"theme picker paints paper");
check(headerArt.order === "1" && headerArt.pointerEvents === "none" && parseFloat(headerArt.width) > 0,"art occupies the live gap");
check(nitro.getBoundingClientRect().right <= tools.getBoundingClientRect().left,"premium badge cannot overlap the header tools");
nitro.remove();
check(q(".quest-ui-dashboard-display-title strong").getBoundingClientRect().right <= tools.getBoundingClientRect().left,"non-premium title fits");
for (const name of ["primary","destinations"]) {
    const selector = ".quest-ui-dashboard-actionbar-"+name;
    const tray = q(selector);
    const style = css(selector);
    const paper = css(selector,"::before");
    const bounds = tray.getBoundingClientRect();
    check(paper.borderImageSource.includes("data:image/png;base64,") && paper.clipPath.startsWith("polygon("),"folded paper tray: "+name);
    check(paper.pointerEvents === "none" && style.overflow === "visible" && style.clipPath === "none","tray must not clip controls or intercept input: "+name);
    check(parseFloat(style.paddingTop) >= 5 && parseFloat(style.paddingLeft) >= 6,"native safe padding: "+name);
    for (const button of tray.querySelectorAll("button")) {
        const rect = button.getBoundingClientRect();
        check(rect.left >= bounds.left + 6 && rect.right <= bounds.right - 6 && rect.top >= bounds.top + 5 && rect.bottom <= bounds.bottom - 5,"control stays within paper tray: "+name);
    }
}
const stockUri = name => shell.getPropertyValue("--origami-stock-"+name).trim().replace(/^url\(["']?/,"").replace(/["']?\)$/,"");
const foldUri = name => shell.getPropertyValue("--origami-fold-"+name).trim().replace(/^url\(["']?/,"").replace(/["']?\)$/,"");
const hasStock = (style,name) => style.borderImageSource.includes(stockUri(name));
const checkSlice = (style,name) => {
    check(hasStock(style,name),"paper stock: "+name);
    check(style.borderImageSlice.includes("fill") && style.borderImageRepeat === "stretch","filled nine-slice: "+name);
    check(style.borderImageWidth === (name === "matte" ? "8px 12px" : name === "raised" ? "6px 9px" : "6px 8px"),"fixed-size paper edges: "+name);
};
for (const name of ["primary","destinations"]) {
    const tray = q(".quest-ui-dashboard-actionbar-"+name);
    checkSlice(getComputedStyle(tray,"::before"),"matte");
    for (const button of tray.querySelectorAll("button")) {
        const style = getComputedStyle(button);
        if (button.matches(".quest-ui-orion-icon-button")) {
            const face=getComputedStyle(button,"::before"),kind=button.classList.contains("is-stop")?"stop":button.classList.contains("is-pause")?"pause":"start";
            check(face.borderImageSource.includes(foldUri("action-"+kind)) && face.borderImageSlice==="0 34 fill" && face.borderImageWidth==="0 17px" && face.clipPath==="none","actual folded action sheet with fixed ends");
        }
        else if (button.matches(".quest-ui-claim-all-button")) {check(hasStock(getComputedStyle(button,"::before"),"slip"),"Claim All folded slip");check(style.clipPath==="none" && style.filter.includes("drop-shadow") && style.fontWeight==="800","Claim All raised above tray");}
        else {const face=getComputedStyle(button,"::before");check(face.backgroundImage.includes("data:image/png;base64,") && face.borderImageSource==="none" && face.pointerEvents==="none" && style.filter.includes("drop-shadow"),"icon control uses independent folded sheet");}
    }
}
const iconFolds=new Set([...document.querySelectorAll(".quest-ui-dashboard-actionbar :is(.quest-ui-reload-icon-button,.quest-ui-event-log-button,.quest-ui-toolbar-button:not(.quest-ui-claim-all-button))")].map(button=>getComputedStyle(button,"::before").backgroundImage));
check(iconFolds.size===5,"five toolbar roles have distinct fixed folds");
const claim=q(".quest-ui-claim-all-button"),claimCount=q(".quest-ui-claim-all-count");
const enabledPaint=getComputedStyle(claim,"::before").backgroundImage;
check(enabledPaint.includes("linear-gradient") && getComputedStyle(claimCount).clipPath.startsWith("polygon("),"Claim All warm paper and folded count");
const claimLabel=claim.querySelector(".quest-ui-claim-all-label");
const claimBounds=()=>{
    const r=claim.getBoundingClientRect(),l=claimLabel.getBoundingClientRect(),c=claimCount.getBoundingClientRect();
    check(r.width>=128 && l.left-r.left>=13 && r.right-c.right>=13 && c.left-l.right>=7 && c.height===18,"Claim All keeps safe content insets and badge spacing");
    check(Math.abs((l.top+l.bottom-c.top-c.bottom)/2)<=1,"Claim All label and stamp align vertically");
};
for(const count of ["0","4","99","100"]){
    claimCount.textContent=count;
    claimBounds();
}
claimCount.textContent="0";
claim.disabled=true;
check(getComputedStyle(claim).filter==="none" && getComputedStyle(claim,"::before").backgroundImage!==enabledPaint,"disabled Claim All remains visibly inactive");
claimBounds();
const claimMarkup=claim.innerHTML;
claim.setAttribute("aria-busy","true");
claim.textContent="Claiming 100/100…";
check(claim.scrollWidth<=claim.clientWidth && claim.getBoundingClientRect().width>=128,"busy Claim All label fits");
claim.innerHTML=claimMarkup;
claim.querySelector(".quest-ui-claim-all-count").textContent="4";
claim.removeAttribute("aria-busy");
claim.disabled=false;
const smart=q(".quest-ui-orion-icon-button.is-start");
for(const [state,pigment] of [["start","start"],["pause","pause"],["resume","start"]]){
    smart.className="quest-ui-orion-icon-button is-"+state;
    check(getComputedStyle(smart,"::before").borderImageSource.includes(foldUri("action-"+pigment)),"smart action uses correct paper pigment: "+state);
}
smart.className="quest-ui-orion-icon-button is-start";
check(css(".quest-ui-orion-icon-button.is-stop","::before").borderImageSource.includes(foldUri("action-stop")) && foldUri("action-start")!==foldUri("action-stop"),"Start and Stop retain distinct baked pigments");
const notice = q(".quest-ui-dashboard-notification-region");
const bell = q(".quest-ui-dashboard-notification-island");
check(!notice.closest(".quest-ui-dashboard-actionbar-primary") && bell.parentElement === notice,"notification expansion lane stays independent");
check(notice.getBoundingClientRect().width >= 44,"notification lane reserves bell width");
for (const state of ["is-idle","is-mounted is-success","is-visible is-success","is-visible is-warning","is-visible is-error","is-exiting is-success","is-idle is-open"]) {
    bell.className = "quest-ui-dashboard-notification-island " + state;
    check(getComputedStyle(bell).backgroundColor === "rgba(0, 0, 0, 0)" && getComputedStyle(bell).borderRadius === "0px","no competing rounded background: "+state);
    const child = getComputedStyle(bell,"::before"), parent = getComputedStyle(bell,"::after");
    check(child.clipPath.startsWith("polygon(") && hasStock(child,"raised") && child.top === "5px" && child.left === "5px","inset notification child: "+state);
    check(parent.backgroundImage.includes("data:image/svg+xml,") && parent.top === "0px" && parent.left === "0px" && Number(parent.zIndex)<Number(child.zIndex),"outer paper tray beneath child: "+state);
    check(parent.pointerEvents === "none" && child.pointerEvents === "none","decorations do not intercept notification clicks");
    check(css(".quest-ui-dashboard-notification-surface").display === "none" && css(".quest-ui-dashboard-notification-icon").display !== "none","hide old capsule, retain native bell: "+state);
    check(css(".quest-ui-dashboard-notification-region").position === "relative" && Number(css(".quest-ui-dashboard-notification-region").zIndex) > Number(css(".quest-ui-dashboard-topbar").zIndex),"notification lane paints above header artwork: "+state);
}
bell.className = "quest-ui-dashboard-notification-island is-idle";
for (const product of document.querySelectorAll(".quest-ui-default-status-product")) {
    const paper = getComputedStyle(product,"::before");
    check(hasStock(paper,"status-3d") && paper.borderImageSlice === "0 120 fill" && paper.borderImageWidth === "0 60px" && getComputedStyle(product).clipPath === "none","baked 3D paper with fixed end folds and native controls");
    const underlay=getComputedStyle(product,"::after");
    check(underlay.content!=="none" && underlay.clipPath===paper.clipPath && underlay.pointerEvents==="none" && Number(underlay.zIndex)<Number(paper.zIndex),"independent status paper contact shadow behind live controls");
    for (const chip of product.querySelectorAll(".quest-ui-version-chip,.quest-ui-product-update-chip")) {const style=getComputedStyle(chip);check(style.borderImageSource.includes("data:image/png;base64,") && style.borderImageWidth==="0 10px","product chip uses scale-specific folded sheet");}
    const gear = product.querySelector(".quest-ui-status-settings-button");
    const gearStyle = getComputedStyle(gear);
    const gearFace=getComputedStyle(gear,"::before");
    check(gearFace.backgroundImage.includes(foldUri("settings")) && gearFace.borderImageSource==="none" && gearFace.pointerEvents==="none" && gearStyle.filter.includes("drop-shadow"),"settings has independent folded paper");
    check(gearStyle.clipPath === "none" && gear.getBoundingClientRect().width >= 30 && gear.getBoundingClientRect().height >= 30,"settings retains native hit target and visible focus");
    gear.focus();
    check(getComputedStyle(gear).outlineStyle !== "none","settings keyboard focus remains visible");
    gear.blur();
}
const bridge = q(".quest-ui-status-bridge");
const connectedArt = css(".quest-ui-status-bridge-node").backgroundImage;
check(parseFloat(css(".quest-ui-status-bridge-node").width) === 24 && connectedArt.includes("data:image/svg+xml,") && css(".quest-ui-status-bridge-node").transform === "none","folded paper link replaces diamond");
bridge.classList.replace("is-connected","is-disconnected");
check(css(".quest-ui-status-bridge-node").backgroundImage !== connectedArt && css(".quest-ui-status-bridge-node").backgroundImage.includes("data:image/svg+xml,"),"disconnected paper link is visibly separate");
bridge.classList.replace("is-disconnected","is-connected");
const fuji = css(".quest-ui-dashboard-filter-tools","::before");
check(fuji.backgroundImage.includes("data:image/webp;base64,") && fuji.pointerEvents === "none","reference Fuji artwork");
const sort = q(".quest-ui-sort-button"), filter = q(".quest-ui-filter-button"), listTitle = q(".quest-ui-dashboard-list-title");
check(listTitle.getBoundingClientRect().right <= sort.getBoundingClientRect().left && sort.getBoundingClientRect().right <= filter.getBoundingClientRect().left,"list controls never overlap");
if(innerWidth>520) check(fuji.gridColumnStart === "2" && fuji.display !== "none","Fuji occupies flexible gap");
else check(fuji.display === "none","Fuji yields to controls at narrow widths");
for(const item of [listTitle,sort,filter]) check(getComputedStyle(item).backgroundImage.includes("data:image/png;base64,"),"list plaque uses unfolded paper");
check(css(".quest-ui-filter-count-badge").clipPath.startsWith("polygon(") && hasStock(css(".quest-ui-filter-count-badge"),"stamp"),"filter count has own paper badge");
check(css(".quest-ui-dashboard-content","::after").backgroundImage.includes("data:image/svg+xml"),"footer artwork");
const summaryFolds={all:"stock-micro",available:"variant-top-right",claimable:"variant-bottom-left","in-progress":"variant-pleat",claimed:"variant-top-pair",expired:"variant-unfolded-diagonal",ignored:"variant-bottom-pair",hidden:"variant-unfolded-cross"};
const sampleChip=q(".quest-ui-summary-available"),originalClass=sampleChip.className,seenFolds=new Set();
for(const [kind,token] of Object.entries(summaryFolds)){
    sampleChip.className="quest-ui-summary-chip quest-ui-summary-"+kind;
    const style=getComputedStyle(sampleChip),uri=shell.getPropertyValue("--origami-"+token).trim().slice(5,-2);
    check(uri.length>100 && style.borderImageSource.includes(uri) && style.borderImageSlice==="0 20 fill" && style.borderImageWidth==="0 10px","fixed semantic fold "+kind);
    seenFolds.add(style.borderImageSource);
}
sampleChip.className=originalClass;
check(seenFolds.size===8,"all eight summary roles have distinct fixed folds");
check(css(".quest-ui-summary-available").backgroundImage !== css(".quest-ui-summary-claimable").backgroundImage || css(".quest-ui-summary-available").backgroundColor !== css(".quest-ui-summary-claimable").backgroundColor,"summary states have distinct colors");
for (const chip of document.querySelectorAll(".quest-ui-dashboard-summary > .quest-ui-summary-chip")) {
    const label=chip.querySelector(".quest-ui-summary-chip-count");
    check(Boolean(label),"summary chip fixture has count");
    if(label)check(hasStock(getComputedStyle(label),"stamp"),"summary count uses independent paper stamp");
    if (!label) continue;
    const a=chip.getBoundingClientRect(),b=label.getBoundingClientRect();
    check(b.left>=a.left && b.right<=a.right && b.top>=a.top && b.bottom<=a.bottom,"summary count stays inside its paper parent");
}
check(parseFloat(css(".quest-ui-card-title").fontSize)===16,"card title hierarchy");
check(parseFloat(css(".quest-ui-card-meta-row").fontSize)===12,"readable card metadata");
check(css(".quest-ui-update-banner.is-current .quest-ui-update-banner-mark").color !== css(".quest-ui-update-banner.has-error .quest-ui-update-banner-mark").color,"update status colors must differ");
for (const [selector,tone] of [[".quest-ui-notification-center-panel","ivory"],[".quest-ui-dashboard-shell","navy"],["[data-origami-scene] > .quest-ui-origami-card-paper","ivory"]]) {
    const style = selector.endsWith("card-paper") ? getComputedStyle(q(selector),"::before") : css(selector);
    const source = shell.getPropertyValue("--origami-art-"+tone).trim().replace(/^url\(["']?/,"").replace(/["']?\)$/,"");
    check(style.backgroundImage.includes("data:image/png;base64,") && style.backgroundImage.includes(source),"baked crumpled paper: "+selector);
    check(style.backgroundRepeat.split(",").every(value=>value.trim()==="no-repeat") && style.backgroundSize.split(",").some(value=>value.trim()==="cover"),"single continuous sheet: "+selector);
}
const noticePanel=css(".quest-ui-notification-center-panel");
check(noticePanel.borderRadius==="0px" && noticePanel.clipPath==="none" && noticePanel.borderImageSource.includes("data:image/svg+xml,"),"notification panel uses unclipped paper frame");
check(css(".quest-ui-notification-center-account").borderRadius==="0px" && css(".quest-ui-notification-center-account").borderImageSource.includes("data:image/svg+xml,") && css(".quest-ui-notification-center-account").backgroundImage.includes("data:image/png;base64,"),"account is a separate paper sheet");
check(css(".quest-ui-notification-center-avatar").borderRadius==="50%","native avatar identity preserved");
for (const selector of [".quest-ui-notification-center-unread",".quest-ui-notification-center-current-chip",".quest-ui-event-storage"]) {
    const style=css(selector);
    check(style.borderRadius==="0px" && style.clipPath.startsWith("polygon(") && style.borderImageSource.includes("data:image/svg+xml,") && style.backgroundImage.includes("data:image/png;base64,"),"folded semantic label "+selector);
}
const unread=q(".quest-ui-notification-center-unread");
const unreadFrame=css(".quest-ui-notification-center-unread").borderImageSource;
unread.classList.remove("has-unread");
check(css(".quest-ui-notification-center-unread").borderImageSource!==unreadFrame,"zero unread has a neutral frame");
unread.classList.add("has-unread");
const storage=q(".quest-ui-event-storage");
const storageColors=new Set();
for(const state of ["safe","watch","high","critical"]) {
    storage.className="quest-ui-event-storage is-"+state;
    const color=css(".quest-ui-event-storage-used").color;
    storageColors.add(color);
    check(css(".quest-ui-event-storage-icon").stroke===color,"storage icon and amount share semantic color "+state);
    const bounds=storage.getBoundingClientRect();
    for(const part of storage.children) {
        const r=part.getBoundingClientRect();
        check(r.left>=bounds.left && r.right<=bounds.right,"storage content remains inside paper "+state);
    }
}
storage.className="quest-ui-event-storage is-watch";
check(storageColors.size===4,"four storage threshold colors");
check(css(".quest-ui-notification-center-row-artwork-fallback").clipPath.startsWith("polygon(") && css(".quest-ui-notification-center-task-badge").backgroundImage.includes("data:image/png;base64,"),"notification artwork and badge use local paper");
const noticeActions = [...document.querySelectorAll(".quest-ui-notification-center-action")];
check(noticeActions.length === 3,"notification action fixture");
check(new Set(noticeActions.map(action=>getComputedStyle(action).backgroundImage)).size===3,"notification actions have distinct fixed folds");
for (const action of noticeActions) {
    const style = getComputedStyle(action);
    check(style.backgroundImage.includes("data:image/png;base64,") && style.backgroundImage.includes(shell.getPropertyValue("--origami-art-unfolded-button").trim().replace(/^url\(["']?/,"").replace(/["']?\)$/,"")),"notification action uses unfolded paper");
    check(style.backgroundRepeat.split(",").every(v=>v.trim()==="no-repeat") && style.backgroundSize.includes("cover") && style.boxShadow !== "none","continuous folded paper button");
    action.focus();
    check(getComputedStyle(action).outlineStyle !== "none","notification keyboard focus");
    action.blur();
}
check(getComputedStyle(noticeActions[2]).color === "rgb(172, 40, 59)","clear action keeps danger color");
for(const [selector,token] of [[".quest-ui-dashboard-choice-list .is-selected","variant-unfolded-cross"],[".quest-ui-event-filter-list-row.is-checked","variant-bottom-left"],[".quest-ui-update-check-button","variant-right-pair"],[".quest-ui-event-view-detail","variant-bottom-right"],[".quest-ui-notification-center-current-chip","micro-left"],[".quest-ui-event-storage","micro-left"]]){
    const expected=shell.getPropertyValue("--origami-"+token).trim().slice(5,-2);
    check(expected.length>100 && css(selector).backgroundImage.includes(expected),"rigid fold endcap on "+selector);
}
const rasterSizes = { art:[320,125], title:[275,51], purple:[130,48], palette:[48,48], fuji:[320,63] };
const stockSizes = { matte:[128,64], raised:[64,28], "status-3d":[840,112],micro:[112,40],stamp:[36,32],slip:[160,64] };
const allRasters = [...Object.entries(rasterSizes).map(([name,size])=>["--origami-header-raster-"+name,size]),...Object.entries(stockSizes).map(([name,size])=>["--origami-stock-"+name,size]),["--origami-art-ivory",[640,640]],["--origami-art-navy",[640,640]],["--origami-art-unfolded-button",[320,80]],...Object.entries({crane:[354,275],whale:[354,255],wolf:[237,284],rabbit:[196,284],fox:[266,284],butterfly:[354,245],elephant:[354,252],turtle:[354,220],koi:[354,252],owl:[218,284]}).map(([name,size])=>["--origami-animal-"+name,size]),...Object.entries({"corner-tl":[80,80],"corner-br":[80,80],ring:[184,184]}).map(([name,size])=>["--origami-card-"+name,size])];
allRasters.push(...["crane","whale","wolf","rabbit","fox","butterfly","elephant","turtle","koi","owl"].map(name=>["--origami-scene-"+name,[800,200]]));
allRasters.push(...["tl","tr","bl","br"].map(name=>["--origami-wrap-"+name,[96,96]]));
allRasters.push(...["start","stop","pause"].map(name=>["--origami-fold-action-"+name,[160,64]]),["--origami-fold-settings",[60,60]],["--origami-fold-segment-empty",[88,32]],["--origami-fold-segment-filled",[88,32]]);
allRasters.push(["--origami-micro-left",[20,40]],["--origami-micro-right",[20,40]],["--origami-slip-left",[36,64]],["--origami-slip-right",[36,64]]);
allRasters.push(...["top-right","bottom-left","bottom-right","top-pair","bottom-pair","diagonal-pair","right-pair","unfolded-diagonal","unfolded-cross","pleat"].map(name=>["--origami-variant-"+name,[112,40]]),["--origami-variant-crumpled",[280,80]]);
const pending = allRasters.map(([name,[w,h]]) => {
    const value = shell.getPropertyValue(name).trim();
    const uri = value.replace(/^url\(["']?/,"").replace(/["']?\)$/,"");
    const img = new Image();
    img.hidden = true;
    img.src = uri;
    document.body.appendChild(img);
    return {name,w,h,img};
});
window.addEventListener("load",()=>{
    for (const {name,w,h,img} of pending) {
        check(img.complete && img.naturalWidth === w && img.naturalHeight === h,name+" raster dimensions/decode");
        if(name==="--origami-art-navy" && img.naturalWidth===w) {
            const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
            const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);
            const pixels=ctx.getImageData(0,0,w,h).data;
            let lo=255,hi=0,sum=0,sq=0;
            for(let i=2;i<pixels.length;i+=4){const v=pixels[i];lo=Math.min(lo,v);hi=Math.max(hi,v);sum+=v;sq+=v*v;}
            const n=w*h,mean=sum/n,sd=Math.sqrt(sq/n-mean*mean);
            check(lo>=49 && hi<=80 && hi-lo>=20 && mean>=61 && mean<=68 && sd>=3 && sd<=7,"navy reopened paper has bounded visible relief: "+lo+".."+hi+", mean "+mean+", sd "+sd);
        }
        if(name==="--origami-stock-matte" && img.naturalWidth===w) {
            const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
            const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);
            const data=ctx.getImageData(0,0,w,h).data;
            let max=0;for(let i=3;i<data.length;i+=4)max=Math.max(max,data[i]);
            check(max>=55 && max<=145 && data[(32*w+64)*4+3]<=40,"matte stock has visible fold planes and a quiet center");
        }
        if(name.startsWith("--origami-wrap-") && img.naturalWidth===w) {
            const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
            const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);
            const pixels=ctx.getImageData(0,0,w,h).data;
            const right=name.endsWith("r"),bottom=name.endsWith("bl")||name.endsWith("br");
            const alpha=(x,y)=>pixels[((bottom?h-1-y:y)*w+(right?w-1-x:x))*4+3];
            let max=0;for(let i=3;i<pixels.length;i+=4)max=Math.max(max,pixels[i]);
            check(alpha(2,2)===0 && max>=16 && max<=165 && alpha(93,93)===0,"rigid fold shading is local, translucent and leaves the cut tip clear "+name);
        }
        if(name.startsWith("--origami-fold-") && img.naturalWidth===w) {
            const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
            const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);
            const data=ctx.getImageData(0,0,w,h).data,center=((h>>1)*w+(w>>1))*4;
            check(data[3]===0 && data[center+3]===255,"folded sheet has transparent cut and opaque paper center: "+name);
            if(name.endsWith("start"))check(data[center+1]>data[center] && data[center+1]>data[center+2],"green paper pigment");
            if(name.endsWith("stop"))check(data[center]>data[center+1] && data[center]>data[center+2],"red paper pigment");
            if(name.endsWith("pause"))check(data[center]>data[center+1] && data[center+1]>data[center+2],"yellow paper pigment");
        }
        if(name==="--origami-fold-segment-empty" && img.naturalWidth===w) {
            const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
            const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);
            const empty=ctx.getImageData(0,0,w,h).data;
            ctx.clearRect(0,0,w,h);
            const filledImage=pending.find(entry=>entry.name==="--origami-fold-segment-filled").img;
            ctx.drawImage(filledImage,0,0);
            const filled=ctx.getImageData(0,0,w,h).data;
            let sameAlpha=true,lo=255,hi=0;
            for(let i=0;i<empty.length;i+=4){
                sameAlpha&&=empty[i+3]===filled[i+3];
                if(empty[i+3]===255){lo=Math.min(lo,empty[i]);hi=Math.max(hi,empty[i]);}
            }
            const center=((h>>1)*w+(w>>1))*4;
            check(sameAlpha && hi-lo>=12,"matching paper silhouette and visible fold shading");
            check(empty[center]>empty[center+1] && empty[center+1]>empty[center+2] && filled[center+2]>filled[center] && filled[center]>filled[center+1],"ivory and purple baked paper pigments");
        }
        if(name==="--origami-card-ring" && img.naturalWidth===w) {
            const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
            const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);
            const pixels=ctx.getImageData(0,0,w,h).data;
            let lo=w,hi=-1;
            for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>=128){lo=Math.min(lo,x);hi=Math.max(hi,x);}
            const projected=(hi-lo+1)/w*1.96*56;
            check(projected>=49 && projected<=57,"visible ring diameter matches original native stat: "+projected);
        }
        img.remove();
    }
    document.body.dataset.result=errors.length?"fail":"pass";
    q("#result").textContent=JSON.stringify(errors);
});
`;
const dir = mkdtempSync(join(tmpdir(),"questui-origami-"));
try {
    writeFileSync(join(dir,"theme.css"),managedCss);
    writeFileSync(join(dir,"fixture.html"),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><body data-result="pending">'+markup+'<pre id="result"></pre><script>'+script+'</script>');
    const proc = spawnSync(chrome,["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking","--allow-file-access-from-files","--force-device-scale-factor=1","--virtual-time-budget=5000","--window-size=1024,900","--dump-dom",pathToFileURL(join(dir,"fixture.html")).href],{encoding:"utf8",timeout:45000,maxBuffer:2*1024*1024});
    assert.equal(proc.status,0,proc.error?.message || proc.stderr);
    assert.ok(proc.stdout.includes('data-result="pass"'),proc.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "Browser fixture never completed: "+proc.stderr.slice(-1500));
    // Exercise the compact list independently of unrelated full-size assertions.
    const compactScript = `
        const row = document.querySelector(".quest-ui-dashboard-filter-tools");
        const title = row.querySelector(".quest-ui-dashboard-list-title").getBoundingClientRect();
        const sort = row.querySelector(".quest-ui-sort-button").getBoundingClientRect();
        const filter = row.querySelector(".quest-ui-filter-button").getBoundingClientRect();
        const bounds = row.getBoundingClientRect();
        const ok = getComputedStyle(row,"::before").display === "none"
            && title.bottom <= sort.top && title.bottom <= filter.top
            && sort.right <= filter.left && sort.left >= bounds.left - 1
            && filter.right <= bounds.right + 1;
        document.body.dataset.result = ok ? "pass" : "fail";
    `;
    writeFileSync(join(dir,"compact.html"),'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><body data-result="pending">'+markup+'<script>'+compactScript+'</script>');
    writeFileSync(join(dir,"compact-host.html"),'<!doctype html><iframe id="compact" width="400" height="900" src="compact.html"></iframe><script>document.querySelector("iframe").onload=()=>{document.body.dataset.result=document.querySelector("iframe").contentDocument.body.dataset.result;};</script>');
    const compact = spawnSync(chrome,["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking","--allow-file-access-from-files","--force-device-scale-factor=1","--virtual-time-budget=5000","--window-size=1024,900","--dump-dom",pathToFileURL(join(dir,"compact-host.html")).href],{encoding:"utf8",timeout:45000,maxBuffer:2*1024*1024});
    assert.equal(compact.status,0,compact.error?.message || compact.stderr);
    assert.ok(compact.stdout.includes('data-result="pass"'),"Compact Quest List must keep title, Sort and Filter within the row");
    console.log("Origami visual contract passed.");
} finally {
    rmSync(dir,{recursive:true,force:true});
}
