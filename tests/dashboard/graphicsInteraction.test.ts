import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";

import * as logic from "../../src/dashboard/graphicsLogic";
import * as controller from "../../src/graphics/controller";
import { graphicsRootClasses } from "../../src/graphics/policy";

// Execute the actual selector component and handlers using a minimal hook host.
// This deliberately does not claim to reproduce Discord React scheduling.
type Node = { type: any; props: Record<string, any>; children: any[]; };
const parentHooks: any[] = [], menuHooks: any[] = [];
let hooks: any[] = [], cursor = 0;
function renderWith<T>(storage: any[], fn: () => T): T {
    const old = hooks, oldCursor = cursor;
    hooks = storage;
    cursor = 0;
    try { return fn(); }
    finally { hooks = old; cursor = oldCursor; }
}
function useState(initial: any) {
    const scope = hooks, i = cursor++;
    if (!(i in scope)) scope[i] = typeof initial === "function" ? initial() : initial;
    return [scope[i], (next: any) => { scope[i] = typeof next === "function" ? next(scope[i]) : next; }];
}
function useRef(initial: any) {
    const i = cursor++;
    if (!(i in hooks)) hooks[i] = { current: initial };
    return hooks[i];
}
const React = {
    createElement(type: any, props: any, ...children: any[]): Node { return { type, props: props ?? {}, children }; },
    useId: () => "test"
};
const Popout = { Animation: { NONE: 0 } };
let preference = "3", systemReduced = false;
const writes: string[] = [];
const settings = {
    use: () => ({ dashboardGraphicsPreference: preference }),
    store: {
        get dashboardGraphicsPreference() { return preference; },
        set dashboardGraphicsPreference(value: string) { preference = value; writes.push(value); }
    }
};
const modules: Record<string, any> = {
    "@webpack/common": { React, Popout, useState, useRef },
    "../plugin/settings": { __esModule: true, default: settings },
    "../graphics/controller": controller,
    "../graphics/runtime": { useSystemReducedMotion: () => systemReduced },
    "../themes/runtime": { useDashboardThemeClassName: (...classes: string[]) => ["quest-ui-theme","quest-ui-theme-default",...graphicsRootClasses(preference, systemReduced),...classes].join(" ") },
    "./graphicsLogic": logic
};
const source = readFileSync(new URL("../../src/dashboard/DashboardGraphicsControl.tsx", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const mod = { exports: {} as Record<string, any> };
new Function("require","module","exports", output)((name: string) => {
    assert.ok(Object.hasOwn(modules,name), "Unexpected dependency " + name);
    return modules[name];
}, mod, mod.exports);

function find(node: any, predicate: (node: Node) => boolean): Node | undefined {
    if (Array.isArray(node)) {
        for (const item of node) { const match = find(item,predicate); if (match) return match; }
    } else if (node && typeof node === "object" && "type" in node) {
        if (predicate(node)) return node;
        return find(node.children,predicate);
    }
    return undefined;
}
function text(node: any): string {
    if (Array.isArray(node)) return node.map(text).join(" ");
    return typeof node === "string" ? node : node && typeof node === "object" && "children" in node ? text(node.children) : "";
}
function view() {
    const popout: Node = renderWith(parentHooks, () => mod.exports.DashboardGraphicsControl());
    const trigger: Node = popout.children[0](null,{isShown:popout.props.shouldShow});
    if (!popout.props.shouldShow) {
        menuHooks.length = 0;
        return { popout, trigger, menu: null, slider: null };
    }
    const child: Node = popout.props.renderPopout();
    const menu: Node = renderWith(menuHooks, () => child.type(child.props));
    const slider = find(menu,n => n.props.role === "slider");
    assert.ok(slider);
    return { popout, trigger, menu, slider };
}
const target = { getBoundingClientRect: () => ({left:0,width:300}), focus() {}, setPointerCapture() {} };
const ev = (x: number, pointerId = 7) => ({button:0,pointerId,clientX:x,currentTarget:target});
function slider() { const s = view().slider; assert.ok(s); return s.props; }
function click(label: string) {
    const button = find(view().menu,n => n.props["aria-label"] === label);
    assert.ok(button, label); button.props.onClick();
}
function key(key: string) { slider().onKeyDown({key,preventDefault(){}}); }
function index(expected: number | "light") { assert.equal(view().trigger.props["data-graphics-index"],expected); }
function close() { view().popout.props.onRequestClose(); view(); }
function open() { view().trigger.props.onClick(); view(); }

index(3); open();
slider().onPointerDown(ev(14)); index(0);
slider().onPointerMove(ev(82)); index(1);
slider().onPointerMove(ev(218,99)); index(1);
slider().onPointerMove(ev(150)); index(2);
assert.deepEqual(writes, [], "Drag preview must not persist intermediate detents");
slider().onPointerUp(ev(150)); index(2);
assert.deepEqual(writes, ["2"], "Exactly one write on pointer release");
slider().onPointerDown(ev(14)); index(0);
slider().onPointerCancel(ev(14)); index(2);
assert.deepEqual(writes, ["2"], "Pointer cancellation must not persist");
slider().onPointerDown(ev(286)); index(4);
slider().onPointerUp(ev(286)); index(4);
slider().onLostPointerCapture(ev(286)); index(4);
assert.deepEqual(writes, ["2"], "Locked Ultra cannot change applied quality");
assert.match(text(view().menu), /Coming Soon/);
assert.ok(find(view().menu,n => n.type?.name === "LockIcon"));
click("Reduce Motion"); index(4);
assert.equal(preference,"2:reduced");
assert.doesNotMatch(text(view().menu), /Reduced Motion/);
close(); index(2);
open(); click("Light mode"); index("light");
assert.equal(preference,"light");
click("Light mode"); index(0);
assert.equal(preference,"0");
assert.equal(view().trigger.props["data-graphics-reduced"],false);
click("Light mode"); index("light");
const beforeCancel = writes.length;
slider().onPointerDown(ev(150)); index(2);
slider().onPointerCancel(ev(150)); index("light");
assert.equal(writes.length,beforeCancel);
slider().onPointerDown(ev(286)); slider().onPointerUp(ev(286)); index(4);
assert.equal(preference,"0:reduced","Dragging out of Light clears its override without applying Ultra");
close(); index(0);
open(); key("End"); index(4); assert.equal(preference,"0:reduced");
key("ArrowLeft"); index(3); assert.equal(preference,"3:reduced");
click("Reduce Motion"); assert.equal(preference,"3");
systemReduced=true;
assert.equal(view().trigger.props["data-graphics-reduced"],true);
assert.match(view().menu?.props.className,/quest-ui-reduced-motion/);
assert.match(text(view().menu),/Reduced Motion/);
systemReduced=false;
const beforeClose = writes.length;
slider().onPointerDown(ev(14)); index(0);
close(); index(3);
assert.equal(writes.length,beforeClose,"Closing an active drag must discard it");
console.log("Actual Graphics selector handlers: pointer preview, single commit, cancellation, Ultra, Light, keyboard and OS motion PASS");
