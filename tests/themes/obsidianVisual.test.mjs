// Smoke test against all real Obsidian styles, in registry order.
// Mock Discord's host variables and markup; no Quest actions are invoked.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const registry = read("../../src/themes/registry.ts");
const imports = new Map([...registry.matchAll(/import\s+(\w+)\s+from\s+"\.\/obsidian\/([^"]+)\?managed";/g)].map(m => [m[1],m[2]]));
const order = registry.match(/id:\s*"obsidian"[\s\S]*?styles:\s*\[([\s\S]*?)\]/)?.[1].split(",").map(s=>s.trim()).filter(Boolean);
assert.ok(order?.length && order.every(name=>imports.has(name)), "Obsidian registry order");
const css = order.map(name=>read("../../src/themes/obsidian/"+imports.get(name))).join("\n");

const icon = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4L20 12 7 20Z" fill="currentColor"/></svg>';
const button = (classes,html,attrs="") => '<button type="button" class="'+classes+'" '+attrs+'>'+html+'</button>';
const update = (tone,copy,mark) => '<span class="quest-ui-product-update-chip is-'+tone+'"><span class="quest-ui-product-update-mark">'+mark+'</span><span>'+copy+'</span></span>';
const product = (name,kind,version,channel,runtime,notice) => '<div class="quest-ui-default-status-product is-'+kind+'"><div class="quest-ui-default-status-identity"><div class="quest-ui-default-status-identity-row"><strong class="quest-ui-default-status-name">'+name+'</strong><span class="quest-ui-version-chip quest-ui-version-chip-'+kind+' is-'+channel+'">'+version+'</span></div></div><div class="quest-ui-default-status-state">'+runtime+notice+'</div>'+button("quest-ui-status-settings-button",icon)+'</div>';
const runtimeIdle = '<span class="quest-ui-orion-status is-compact is-connected is-engine-idle"><span class="quest-ui-orion-runtime-chip"><span class="quest-ui-orion-status-dot"></span><span class="quest-ui-orion-status-copy">Idle</span></span></span>';
const runtimeRunning = '<span class="quest-ui-orion-status is-compact is-connected is-engine-running"><span class="quest-ui-orion-runtime-chip"><span class="quest-ui-orion-status-dot"></span><span class="quest-ui-orion-status-copy">Running</span></span></span>';
const summary = [["all","All",62],["available","Available",0],["claimable","Ready",0],["in-progress","In Progress",1],["claimed","Claimed",16],["expired","Expired",45],["ignored","Ignored",0],["hidden","Hidden",0]].map(([key,label,count])=>button("quest-ui-summary-chip quest-ui-summary-"+key+(key==="all"?" is-selected":""),'<span class="quest-ui-summary-chip-dot"></span><span class="quest-ui-summary-chip-label">'+label+'</span><span class="quest-ui-summary-chip-count">'+count+'</span>')).join("");
const notice = button("quest-ui-dashboard-notification-island is-idle",'<span class="quest-ui-dashboard-notification-bell"><svg class="quest-ui-dashboard-notification-surface"><rect class="quest-ui-dashboard-notification-surface-rect"/></svg>'+icon+'</span><span class="quest-ui-dashboard-notification-measure">Notification Center</span><span class="quest-ui-dashboard-notification-copy"><span class="quest-ui-dashboard-notification-text">Notification Center</span></span><span class="quest-ui-dashboard-notification-unread-dot"></span>');
const toolbar = '<div class="quest-ui-dashboard-actionbar"><div class="quest-ui-dashboard-actionbar-left"><div class="quest-ui-dashboard-actionbar-primary"><div class="quest-ui-orion-controls">'+button("quest-ui-orion-icon-button is-start",icon+'<span class="quest-ui-orion-control-label">Start</span>')+button("quest-ui-orion-icon-button is-stop",icon+'<span class="quest-ui-orion-control-label">Stop</span>',"disabled")+'</div>'+button("quest-ui-toolbar-button quest-ui-claim-all-button",'<span class="quest-ui-claim-all-label">Claim All</span><span class="quest-ui-claim-all-count">0</span>',"disabled")+'<span class="quest-ui-dashboard-action-divider"></span>'+["quest-ui-reload-icon-button","quest-ui-update-center-button","quest-ui-event-log-button"].map(c=>button(c,icon)).join("")+'</div></div><div class="quest-ui-dashboard-notification-region">'+notice+'</div><div class="quest-ui-dashboard-actionbar-destinations">'+button("quest-ui-toolbar-button quest-ui-market-button",icon)+button("quest-ui-toolbar-button quest-ui-home-button",icon)+'</div></div>';
const topbar = '<div class="quest-ui-dashboard-topbar"><div class="quest-ui-dashboard-display-title"><span class="quest-ui-dashboard-display-title-icon">'+icon+'</span><strong>Quest Dashboard</strong><span class="quest-ui-dashboard-boost-source-tag is-nitro">'+icon+'<span class="quest-ui-dashboard-boost-source-wordmark">Nitro</span></span></div><div class="quest-ui-dashboard-header-tools">'+button("quest-ui-dashboard-palette-button",icon)+button("quest-ui-dashboard-orb-balance is-ready",icon+"<strong>69780</strong>")+'</div></div>';
const sort = '<div class="quest-ui-dashboard-filter-tools"><h2 class="quest-ui-dashboard-list-title">Quest List</h2>'+button("quest-ui-dashboard-filter-control quest-ui-sort-button",icon+"<span>Sort: Expiring Soon</span>")+button("quest-ui-dashboard-filter-control quest-ui-filter-button is-active",icon+'<span>Filter</span><span class="quest-ui-filter-count-badge">1</span>')+'</div>';
const overlayFixture = '<div style="position:absolute;left:-10000px;top:0;width:720px">'
+'<div class="quest-ui-theme quest-ui-theme-obsidian quest-ui-dashboard-choice-list quest-ui-dashboard-menu-surface"><span class="quest-ui-dashboard-choice-list-title">Sort by</span><button role="menuitemradio" class="is-selected"><span>Expiring Soon</span><span class="quest-ui-dashboard-choice-list-radio"><span></span></span></button></div>'
+'<div class="quest-ui-theme quest-ui-theme-obsidian quest-ui-filter-list quest-ui-dashboard-menu-surface"><div class="quest-ui-filter-list-scroll"><section class="quest-ui-filter-list-section"><h3>Status</h3><div class="quest-ui-filter-list-options"><button class="quest-ui-filter-list-row is-checked"><span class="quest-ui-filter-list-box">'+icon+'</span><span>Available</span></button></div></section></div></div>'
+'<div class="quest-ui-theme quest-ui-theme-obsidian quest-ui-event-sort-menu quest-ui-event-menu-surface"><span class="quest-ui-event-sort-list-title">Sort by</span><button role="menuitemradio" class="is-selected"><span>Newest first</span><span class="quest-ui-event-sort-radio"><span></span></span></button></div>'
+'<div class="quest-ui-theme quest-ui-theme-obsidian quest-ui-event-filter-menu quest-ui-event-menu-surface"><section class="quest-ui-event-filter-list-section"><h3>Level</h3><div class="quest-ui-event-filter-list-options"><button class="quest-ui-event-filter-list-row is-check is-checked tone-error"><span class="quest-ui-event-filter-list-box">'+icon+'</span><span>Error</span></button></div></section></div>'
+'<div class="quest-ui-theme quest-ui-theme-obsidian quest-ui-event-log-panel quest-ui-event-surface"><div class="quest-ui-event-log-header"><div><strong>Event Log</strong></div><div class="quest-ui-event-log-header-meta"><span class="quest-ui-event-storage is-safe"><span class="quest-ui-event-storage-used">2 MB</span><span>/</span><span>10 MB</span></span></div></div><div class="quest-ui-event-search-shell">'+icon+'<input class="quest-ui-event-search" value="" placeholder="Search"><span class="quest-ui-event-match-count">16 events</span></div><div class="quest-ui-event-log-actions"><div class="quest-ui-event-controls-main">'+button("quest-ui-event-flat-control quest-ui-event-sort-trigger",icon+"<span>Sort</span>")+button("quest-ui-event-flat-control quest-ui-event-filter-launcher",icon+'<span>Filter</span><span class="quest-ui-event-filter-count">1</span>')+'</div><div class="quest-ui-event-action-island">'+button("quest-ui-event-island-icon-button",icon)+button("quest-ui-event-clean-trigger",icon)+'</div></div><div class="quest-ui-event-list"><div class="quest-ui-event-day"><span>Today</span><span class="quest-ui-event-day-line"></span></div><article class="quest-ui-event-row is-info is-category-runtime"><div class="quest-ui-event-time-cell"><span>12:30</span></div><span class="quest-ui-event-severity is-info">'+icon+'</span><div class="quest-ui-event-copy"><div><span class="quest-ui-event-source is-questui">QuestUI</span><span class="quest-ui-event-category is-runtime">RUNTIME</span><strong>Quest event</strong></div><span>Sample event row</span></div><div class="quest-ui-event-row-actions">'+button("quest-ui-event-view-detail","View details")+'</div></article></div><div class="quest-ui-event-page-footer">Scroll to continue…</div></div>'
+'<div class="quest-ui-theme quest-ui-theme-obsidian quest-ui-event-detail quest-ui-event-surface is-warning"><div class="quest-ui-event-detail-header">'+button("quest-ui-event-detail-back",icon+"<span>Back</span>")+'<div class="quest-ui-event-detail-header-actions">'+button("quest-ui-event-copy-report",icon+"<span>Copy report</span>")+'</div></div><div class="quest-ui-event-detail-hero"><span class="quest-ui-event-detail-hero-icon is-warning">'+icon+'</span><h3>Event detail</h3><span class="quest-ui-event-detail-category is-runtime">Runtime</span></div><div class="quest-ui-event-detail-meta-card"><div class="quest-ui-event-detail-meta-row"><span class="quest-ui-event-detail-meta-icon-wrap">'+icon+'</span><span class="quest-ui-event-detail-meta-label">Code</span><div class="quest-ui-event-detail-meta-value"><strong>TEST</strong></div></div></div><div class="quest-ui-event-detail-callout is-reason"><div class="quest-ui-event-detail-callout-heading"><strong>Reason</strong></div><p>Sample reason</p></div><div class="quest-ui-event-detail-diagnostic"><pre>diagnostic</pre></div></div>'
+'</div>';
const art = '<div class="quest-ui-artwork"><div class="quest-ui-artwork-fallback">'+icon+'</div><span class="quest-ui-type-badge">'+icon+'</span></div>';
const claimed = '<article class="quest-ui-card quest-ui-card-claimed" data-obsidian-fracture="1">'+art+'<div class="quest-ui-card-main"><div class="quest-ui-card-title-cluster"><strong class="quest-ui-card-title">New Operator: Argent Flow</strong></div><div class="quest-ui-card-status-line"><span class="quest-ui-card-status-dot"></span><span class="quest-ui-card-status">Claimed</span></div><div class="quest-ui-card-meta-row"><span class="quest-ui-card-reward">Reward: <strong>840 Orbs</strong></span></div></div><div class="quest-ui-card-side"><div class="quest-ui-progress-ring quest-ui-progress-claimed"><svg viewBox="0 0 56 56"><path d="M18 9H53L39 47H4Z" class="quest-ui-progress-track"/><path d="M18 9H53L39 47H4Z" class="quest-ui-progress-state-ring"/></svg><svg viewBox="0 0 24 24" class="quest-ui-progress-state-icon is-claimed"><path d="M6.5 12.4 10.1 16 17.7 8.4"/></svg></div><span class="quest-ui-card-expiry">Expires in 13d 19h</span></div></article>';
const active = '<article class="quest-ui-card quest-ui-card-in-progress quest-ui-card-achievement" data-obsidian-fracture="0">'+art+'<div class="quest-ui-card-main"><div class="quest-ui-card-title-cluster"><strong class="quest-ui-card-title">Dune: Part Three</strong><span class="quest-ui-card-orion-state is-stopped">Stopped</span></div><div class="quest-ui-card-status-line"><span class="quest-ui-card-status-dot"></span><span class="quest-ui-card-status">In progress</span></div><div class="quest-ui-card-meta-row"><span class="quest-ui-card-reward">Reward: <strong>840 Orbs</strong></span><span class="quest-ui-card-actions">'+button("quest-ui-card-orion-control is-start",icon)+button("quest-ui-card-action quest-ui-card-action-ignore",icon)+'</span></div></div><div class="quest-ui-card-side is-achievement"><div class="quest-ui-achievement-progress"><div class="quest-ui-achievement-progress-copy"><strong>0/5</strong><span>tasks done</span></div><div class="quest-ui-achievement-progress-segments" style="grid-template-columns:repeat(5,minmax(0,1fr))"><span></span><span></span><span></span><span></span><span></span></div></div><span class="quest-ui-card-expiry">Expires in 13d 19h</span></div></article>';
const host = 'html,body{margin:0;background:#171820;color:#f2f3f5;font:14px Arial,sans-serif}body{--font-primary:Arial,sans-serif;--font-display:Arial,sans-serif;--font-code:monospace;--header-primary:#f2f3f5;--header-secondary:#b9bbbe;--text-default:#f2f3f5;--text-muted:#a5a8b0;--text-strong:#fff;--interactive-normal:#d6d7dc;--interactive-muted:#878991;--brand-360:#b2a7ff;--brand-500:#8272f4;--status-positive:#43d78b;--status-danger:#f24f5a;--status-warning:#f0b232;--background-base-lowest:#080a10;--background-base-low:#10121a;--background-mod-strong:#242630;--border-subtle:#363845}button{font:inherit}';
function fixture(alternate) {
    const left=product("Orion Quest","orion","v4.11.5","stable",alternate?runtimeRunning:runtimeIdle,alternate?update("error","Update check failed","!"):update("current","You are up to date","✓"));
    const right=product("QuestUI","questui","v1.6.0-beta2","beta","",alternate?update("available","v1.6.0-beta.22 available","↑"):update("current","You are up to date","✓"));
    return '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="theme.css"><style>'+host+'</style><div class="quest-ui-theme quest-ui-theme-obsidian quest-ui-dashboard-shell has-orion-control">'+topbar+toolbar+'<section class="quest-ui-dashboard"><header class="quest-ui-dashboard-header"><div class="quest-ui-default-status-strip">'+left+'<span class="quest-ui-status-bridge is-connected"><span class="quest-ui-status-bridge-line"></span><span class="quest-ui-status-bridge-node"></span><span class="quest-ui-status-bridge-line"></span></span>'+right+'</div><div class="quest-ui-dashboard-summary">'+summary+'</div>'+sort+'</header><div class="quest-ui-dashboard-content">'+active+claimed+'</div></section></div>'+overlayFixture+'<script>('+inspect.toString()+')()</script>';
}
function inspect(){
    const errors=[];
    const check=(ok,message)=>{if(!ok)errors.push(message)};
    const inside=(a,b,e=2)=>a.left>=b.left-e&&a.right<=b.right+e&&a.top>=b.top-e&&a.bottom<=b.bottom+e;
    const selectors=".quest-ui-orion-icon-button,.quest-ui-claim-all-button,.quest-ui-dashboard-boost-source-tag,.quest-ui-dashboard-orb-balance,.quest-ui-summary-chip,.quest-ui-dashboard-filter-control,.quest-ui-version-chip,.quest-ui-product-update-chip,.quest-ui-status-settings-button,.quest-ui-card-orion-control,.quest-ui-card-action,.quest-ui-card-orion-state,.quest-ui-dashboard-palette-button,.quest-ui-reload-icon-button,.quest-ui-update-center-button,.quest-ui-event-log-button,.quest-ui-market-button,.quest-ui-home-button,.quest-ui-dashboard-notification-island,.quest-ui-type-badge";
    for(const node of document.querySelectorAll(selectors)){
        const style=getComputedStyle(node),box=node.getBoundingClientRect();
        if(style.display==="none"||!box.width||!box.height)continue;
        check(style.clipPath==="none",node.className+": content clip");
        for(const pseudo of ["::before","::after"]){
            const paint=getComputedStyle(node,pseudo);
            check(paint.clipPath!=="none"&&paint.content!=="none",node.className+": missing "+pseudo);
        }
        if(node.classList.contains("quest-ui-dashboard-notification-island"))continue;
        const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()){
            const text=walker.currentNode;
            if(!text.textContent.trim())continue;
            const range=document.createRange();range.selectNodeContents(text);
            for(const rect of range.getClientRects())if(rect.width&&rect.height)check(inside(rect,box),node.className+": text outside box: "+text.textContent);
        }
    }
    for(const panel of document.querySelectorAll(".quest-ui-default-status-product")){
        check(getComputedStyle(panel).clipPath==="none","status panel content clip");
        for(const child of panel.children)check(inside(child.getBoundingClientRect(),panel.getBoundingClientRect()),"status panel overflow: "+child.className);
    }
    if(innerWidth>=820){
        const orion=document.querySelector(".quest-ui-default-status-product.is-orion");
        const runtime=orion.querySelector(".quest-ui-orion-runtime-chip");
        const updateChip=orion.querySelector(".quest-ui-product-update-chip");
        const settings=orion.querySelector(".quest-ui-status-settings-button");
        const o=orion.getBoundingClientRect(),r=runtime.getBoundingClientRect(),u=updateChip.getBoundingClientRect(),g=settings.getBoundingClientRect();
        check(Math.abs(r.top-u.top)<=3,"Orion runtime/update wrapped on desktop");
        check(u.right<=g.left+2,"Orion update overlaps Settings");
        check(g.right<=o.right+2,"Orion Settings escapes status slab");
    }
    for(const count of document.querySelectorAll(".quest-ui-summary-chip-count,.quest-ui-filter-count-badge,.quest-ui-claim-all-count")){
        const style=getComputedStyle(count),box=count.getBoundingClientRect();
        check(parseFloat(style.borderTopLeftRadius)>=box.height/2-1,"count is not circular: "+count.className);
        check(Math.abs(box.width-box.height)<=1,"count is not square/circular: "+count.className+" "+box.width+"x"+box.height);
    }
    for(const count of document.querySelectorAll(".quest-ui-summary-chip-count")){
        check(getComputedStyle(count,"::before").content==="none"&&getComputedStyle(count,"::after").content==="none","summary count still uses parentheses");
    }
    check(getComputedStyle(document.querySelector(".quest-ui-dashboard-notification-surface")).visibility==="hidden","old notification rectangle visible");
    for(const rail of document.querySelectorAll(".quest-ui-dashboard-actionbar-primary,.quest-ui-orion-controls,.quest-ui-dashboard-actionbar-destinations")){
        check(parseFloat(getComputedStyle(rail).columnGap)===(rail.classList.contains("quest-ui-orion-controls")?0:3),"toolbar gap: "+rail.className);
    }
    const controls=document.querySelector(".quest-ui-orion-controls");
    const claim=document.querySelector(".quest-ui-claim-all-button");
    check(parseFloat(getComputedStyle(claim).marginInlineStart)===-3,"primary claim gap");
    const controlsBox=controls.getBoundingClientRect(),claimBox=claim.getBoundingClientRect();
    if(Math.abs(controlsBox.top-claimBox.top)<4)check(claimBox.left>=controlsBox.right-0.5,"primary action hitboxes overlap");
    // Measure the painted gap at the centerline, not just the flex gap.
    // The generated polygons use pixel offsets on straight diagonal edges.
    const [start,stop]=controls.querySelectorAll(".quest-ui-orion-icon-button");
    function midEdges(node){
        const rim=getComputedStyle(node,"::before");
        const box=node.getBoundingClientRect(),style=getComputedStyle(node);
        const w=box.width-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth);
        const h=box.height-parseFloat(style.borderTopWidth)-parseFloat(style.borderBottomWidth);
        const raw=rim.clipPath.match(/^polygon\((.*)\)$/)?.[1];
        const vertices=raw?.split(",").map(point=>{
            const xy=point.trim().match(/^(calc\(100% - [\d.]+px\)|[\d.]+(?:px|%)?)\s+(calc\(100% - [\d.]+px\)|[\d.]+(?:px|%)?)$/);
            if(!xy)return null;
            const px=(v,n)=>v.startsWith("calc")?n-Number(v.match(/- ([\d.]+)px/)[1]):v.endsWith("%")?parseFloat(v)*n/100:parseFloat(v);
            return [px(xy[1],w),px(xy[2],h)];
        });
        if(!vertices?.length||vertices.some(v=>!v))return null;
        const y=h/2,xs=[];
        for(let i=0;i<vertices.length;i++){
            const [x1,y1]=vertices[i],[x2,y2]=vertices[(i+1)%vertices.length];
            if(y1===y2)continue;
            if(y>=Math.min(y1,y2)&&y<=Math.max(y1,y2))xs.push(x1+(x2-x1)*(y-y1)/(y2-y1));
        }
        const left=box.left+parseFloat(style.borderLeftWidth);
        return xs.length?[left+Math.min(...xs),left+Math.max(...xs)]:null;
    }
    const a=midEdges(start),b=midEdges(stop),d=midEdges(claim);
    check(a&&b&&b[0]-a[1]>=5&&b[0]-a[1]<=11,"primary painted Start/Stop gap: "+(a&&b?b[0]-a[1]:"unknown"));
    if(Math.abs(controlsBox.top-claimBox.top)<4)check(b&&d&&d[0]-b[1]>=5&&d[0]-b[1]<=11,"primary painted Stop/Claim gap: "+(b&&d?d[0]-b[1]:"unknown"));
    check(getComputedStyle(document.querySelector(".quest-ui-dashboard-display-title > strong"),"::after").content==="none","Dashboard title still has // decoration");
    const vertexCount=node=>{
        const clip=getComputedStyle(node,"::before").clipPath;
        const raw=clip.match(/^polygon\((.*)\)$/)?.[1];
        return raw?raw.split(",").length:0;
    };
    check(vertexCount(document.querySelector(".quest-ui-default-status-product.is-orion"))>=9,"Orion status slab lost carved multi-corner silhouette");
    check(vertexCount(document.querySelector(".quest-ui-default-status-product.is-questui"))>=8,"QuestUI status slab lost carved multi-corner silhouette");
    check(vertexCount(document.querySelector(".quest-ui-sort-button"))>=6&&vertexCount(document.querySelector(".quest-ui-filter-button"))>=6,"Sort/Filter lost six-point silhouette");
    check(vertexCount(document.querySelector(".quest-ui-market-button"))>=7&&vertexCount(document.querySelector(".quest-ui-home-button"))>=7,"Destination socket lost multi-corner silhouette");
    check(vertexCount(document.querySelector(".quest-ui-dashboard-palette-button"))>=6,"Palette lost faceted silhouette");
    check(vertexCount(document.querySelector(".quest-ui-dashboard-orb-balance"))>=6,"Orb balance lost faceted silhouette");
    check(getComputedStyle(document.querySelector(".quest-ui-dashboard-list-title"),"::before").content==="none","Quest List ornament still visible");
    const utilities=[
        document.querySelector(".quest-ui-reload-icon-button"),
        document.querySelector(".quest-ui-update-center-button"),
        document.querySelector(".quest-ui-event-log-button")
    ];
    const utilityCuts=utilities.map(node=>getComputedStyle(node,"::before").clipPath);
    check(utilityCuts.every(cut=>cut===utilityCuts[0]),"utility trio silhouettes diverged");
    const marketCut=getComputedStyle(document.querySelector(".quest-ui-market-button"),"::before").clipPath;
    check(marketCut!==utilityCuts[0],"market/home incorrectly reuse utility silhouette");
    const settingsCut=getComputedStyle(document.querySelector(".quest-ui-status-settings-button"),"::before").clipPath;
    check(settingsCut!==utilityCuts[0],"settings incorrectly reuse utility silhouette");
    const versionCut=getComputedStyle(document.querySelector(".quest-ui-version-chip"),"::before").clipPath;
    const updateCut=getComputedStyle(document.querySelector(".quest-ui-product-update-chip"),"::before").clipPath;
    check(versionCut!==updateCut,"version/update chips incorrectly share silhouette");
    const orb=document.querySelector(".quest-ui-dashboard-orb-balance");
    const rim=getComputedStyle(orb,"::before");
    check(rim.backgroundImage.includes("rgb(213, 90, 255)"),"missing violet orb rim");
    const bell=document.querySelector(".quest-ui-dashboard-notification-bell");
    for(const [pseudo,inset] of [["::before",5],["::after",6]]){
        const layer=getComputedStyle(bell,pseudo);
        check(layer.content!=="none"&&layer.clipPath!=="none"&&parseFloat(layer.left)===inset,"missing angular bell child "+pseudo);
        check(layer.pointerEvents==="none","bell child intercepts pointer input");
    }
    for(const root of document.querySelectorAll(".quest-ui-dashboard-menu-surface,.quest-ui-event-menu-surface,.quest-ui-event-surface")){
        const before=getComputedStyle(root,"::before"),after=getComputedStyle(root,"::after");
        check(before.content!=="none"&&before.clipPath!=="none",root.className+": missing outer frame");
        check(after.content!=="none"&&after.clipPath!=="none",root.className+": missing inner frame");
    }
    for(const node of document.querySelectorAll(".quest-ui-event-sort-trigger,.quest-ui-event-filter-launcher")) check(getComputedStyle(node,"::before").clipPath!=="none"&&getComputedStyle(node,"::after").clipPath!=="none",node.className+": missing faceted control");
    for(const node of document.querySelectorAll(".quest-ui-event-row,.quest-ui-event-detail-meta-card,.quest-ui-event-detail-callout,.quest-ui-event-detail-diagnostic > pre,.quest-ui-event-view-detail")) check(getComputedStyle(node).clipPath!=="none",node.className+": missing faceted surface");
    const detailCategory=document.querySelector(".quest-ui-event-detail-category");
    if(innerWidth>520) check(getComputedStyle(detailCategory).display!=="none","Event Detail category hidden on desktop");
    else check(getComputedStyle(detailCategory).display==="none","Event Detail category visible on narrow layout");
    check(getComputedStyle(document.querySelector(".quest-ui-progress-claimed"),"::before").clipPath!=="none","missing claimed emblem");
    check(getComputedStyle(document.querySelector(".quest-ui-progress-claimed > svg:first-child")).visibility==="hidden","duplicate claimed outline");
    for(const image of document.querySelectorAll(".quest-ui-artwork-fallback"))check(inside(image.getBoundingClientRect(),image.parentElement.getBoundingClientRect()),"artwork escapes frame");
    if(innerWidth>=820){const chips=[...document.querySelectorAll(".quest-ui-summary-chip")];check(new Set(chips.map(chip=>Math.round(chip.getBoundingClientRect().top))).size===1,"desktop summary wraps")}
    parent.postMessage({width:innerWidth,errors},"*");
}

const chrome=process.env.CHROME_BIN||["google-chrome","chromium","chromium-browser"].find(name=>spawnSync(name,["--version"],{encoding:"utf8"}).status===0);
assert.ok(chrome,"Chrome/Chromium not found; set CHROME_BIN");
const dir=mkdtempSync(join(tmpdir(),"questui-obsidian-"));
try{
    writeFileSync(join(dir,"theme.css"),css);
    writeFileSync(join(dir,"normal.html"),fixture(false));
    writeFileSync(join(dir,"alternate.html"),fixture(true));
    const cases=[960,820,620,420].flatMap(width=>["normal","alternate"].map(state=>({width,state})));
    const html='<!doctype html><meta charset="utf-8"><body data-result="pending"><pre id="result"></pre><script>const results=[];window.addEventListener("message",e=>{if(!e.data||!Array.isArray(e.data.errors))return;results.push(e.data);if(results.length==='+cases.length+'){document.body.dataset.result=results.every(x=>!x.errors.length)?"pass":"fail";document.querySelector("#result").textContent=JSON.stringify(results)}});</script>'+cases.map(c=>'<iframe title="'+c.state+'-'+c.width+'" style="display:block;width:'+c.width+'px;height:900px;border:0" src="'+c.state+'.html"></iframe>').join("")+'</body>';
    writeFileSync(join(dir,"runner.html"),html);
    const proc=spawnSync(chrome,["--headless","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking","--allow-file-access-from-files","--virtual-time-budget=5000","--dump-dom",pathToFileURL(join(dir,"runner.html")).href],{encoding:"utf8",timeout:45000,maxBuffer:4*1024*1024});
    assert.equal(proc.status,0,proc.error?.message||proc.stderr);
    const result=proc.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1]??"";
    assert.ok(proc.stdout.includes('data-result="pass"'),"Obsidian browser smoke failed: "+(result||proc.stdout.slice(-3000)));
    console.log("Obsidian browser smoke passed: "+result);
}finally{rmSync(dir,{recursive:true,force:true})}
