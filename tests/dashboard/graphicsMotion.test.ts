import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import * as policy from "../../src/graphics/policy";
import { QUEST_RELOAD_MIN_ROTATIONS, shouldFinishReloadSpin } from "../../src/quests/reload/logic";

// Execute the actual runtime and Reload component using controlled host mocks.
// No real timers, network or Discord account actions are used.
function compile(path: string) {
    return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
}
function load(output: string, modules: Record<string, any>, globals: Record<string, any>) {
    const mod = { exports: {} as Record<string, any> };
    new Function("require","module","exports",...Object.keys(globals),output)((name: string) => {
        assert.ok(Object.hasOwn(modules,name), "Unexpected dependency " + name);
        return modules[name];
    },mod,mod.exports,...Object.values(globals));
    return mod.exports;
}
const motionOutput = compile("../../src/graphics/runtime.ts");
const mediaListeners = new Set<() => void>();
let additions = 0, removals = 0, preference = "3";
const media = {
    matches:false,
    addEventListener(name: string, cb: () => void) { assert.equal(name,"change"); additions++; mediaListeners.add(cb); },
    removeEventListener(name: string, cb: () => void) { assert.equal(name,"change"); removals++; mediaListeners.delete(cb); }
};
let subscribe!: (listener: () => void) => () => void;
let snapshot!: () => boolean;
const motion = load(motionOutput,{
    "@webpack/common": {React:{useSyncExternalStore(sub: typeof subscribe, get: typeof snapshot) { subscribe=sub; snapshot=get; return get(); }}},
    "../plugin/settings": {__esModule:true,default:{use:()=>({dashboardGraphicsPreference:preference})}},
    "./policy": policy
},{window:{matchMedia(query: string) { assert.equal(query,"(prefers-reduced-motion: reduce)"); return media; }}});
assert.equal(motion.useSystemReducedMotion(),false);
let a=0,b=0;
const ua=subscribe(()=>a++),ub=subscribe(()=>b++);
assert.equal(additions,1);
assert.equal(mediaListeners.size,1);
media.matches=true; for(const f of mediaListeners) f();
assert.deepEqual([a,b,snapshot()],[1,1,true]);
assert.deepEqual(motion.useGraphicsRootClasses(),["quest-ui-quality-max","quest-ui-reduced-motion"]);
ua(); assert.equal(removals,0);
media.matches=false; for(const f of mediaListeners) f();
assert.deepEqual([a,b,snapshot()],[1,2,false]);
ub(); assert.equal(removals,1); assert.equal(mediaListeners.size,0);
const uc=subscribe(()=>{}); assert.equal(additions,2); uc(); assert.equal(removals,2);
preference="light"; assert.equal(motion.useEffectiveReducedMotion(),true);
assert.deepEqual(motion.useGraphicsRootClasses(),["quest-ui-quality-low","quest-ui-reduced-motion"]);
console.log("Production motion subscription: system changes, shared listener and cleanup PASS");

const reloadOutput=compile("../../src/quests/reload/QuestReloadControl.tsx");
function createHarness(initialReduced: boolean) {
    let reduced=initialReduced, active=true, cursor=0, timerId=0;
    const slots:any[]=[];
    const pendingEffects:Array<()=>void>=[];
    const cleanup=new Map<number,()=>void>();
    const timers=new Map<number,{callback:()=>void,delay:number}>();
    const events:string[]=[],notices:string[]=[],toasts:string[]=[];
    let resolveRequest!:()=>void,rejectRequest!:(e:Error)=>void;
    const request=new Promise<void>((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject;});
    const timer=(callback:()=>void,delay:number)=>{const id=++timerId;timers.set(id,{callback,delay});return id;};
    const clear=(id:number)=>{timers.delete(id);};
    function useState(initial:any) {
        const i=cursor++;
        if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;
        return [slots[i],(next:any)=>{slots[i]=typeof next==="function"?next(slots[i]):next;}];
    }
    function useRef(initial:any) {
        const i=cursor++;
        if(!(i in slots))slots[i]={current:initial};
        return slots[i];
    }
    function useEffect(effect:()=>void|(()=>void),deps:unknown[]) {
        const i=cursor++,prev=slots[i] as unknown[]|undefined;
        if(prev&&prev.length===deps.length&&prev.every((v,j)=>Object.is(v,deps[j])))return;
        slots[i]=deps;
        pendingEffects.push(()=>{cleanup.get(i)?.();cleanup.delete(i);const dispose=effect();if(typeof dispose==="function")cleanup.set(i,dispose);});
    }
    const jsx=(type:any,props:any)=>({type,props});
    const mod=load(reloadOutput,{
        "react/jsx-runtime":{jsx,jsxs:jsx},
        "@webpack/common":{useState,useRef,useEffect,showToast:(v:any)=>toasts.push(v.text)},
        "../../eventLog/runtime":{recordQuestUIEvent:async(v:any)=>{events.push(v.eventCode);}},
        "../../graphics/runtime":{useEffectiveReducedMotion:()=>reduced},
        "../../dashboard/notifications":{pushDashboardNotice:(v:any)=>notices.push(v.text)},
        "./auto":{markQuestReloadSuccessful:async()=>{}},
        "./native":{reloadQuestList:()=>request},
        "./logic":{shouldFinishReloadSpin},
        "../../plugin/accountSession":{captureAccountSession:()=>({accountId:"test"}),isCurrentAccountSession:()=>active}
    },{window:{setTimeout:timer,clearTimeout:clear},setTimeout:timer,clearTimeout:clear});
    function render(){cursor=0;const button=mod.QuestReloadControl();for(const f of pendingEffects.splice(0))f();return button;}
    async function flush(){for(let i=0;i<15;i++)await Promise.resolve();}
    return {
        render,flush,events,notices,toasts,timers,
        start(){render().props.onClick();assert.equal(render().props["aria-busy"],true);},
        resolve:resolveRequest,reject:rejectRequest,
        iteration(){render().props.children.props.onIteration();},
        setReduced(v:boolean){reduced=v;render();},
        setInactive(){active=false;},
        unmount(){for(const f of cleanup.values())f();cleanup.clear();},
        busy(){return render().props["aria-busy"];},
        recovery(){return [...timers.values()].some(t=>t.delay===5000);}
    };
}
const noticeOutput = compile("../../src/dashboard/DashboardNoticeLane.tsx");
function testNoticeLifecycle() {
    let reduced=false,cursor=0,timerId=0;
    type Notice={id:number;text:string;tone:string;};
    let current:Notice|null=null,subscriber:(()=>void)|null=null;
    const slots:any[]=[];
    const effects:Array<()=>void>=[];
    const cleanups=new Map<number,()=>void>();
    const timers=new Map<number,{callback:()=>void;delay:number;}>();
    function useState(initial:any) {
        const i=cursor++;
        if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;
        return [slots[i],(next:any)=>{slots[i]=typeof next==="function"?next(slots[i]):next;}];
    }
    function useRef(initial:any){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}
    function useEffect(effect:()=>void|(()=>void),deps:unknown[]) {
        const i=cursor++,prev=slots[i] as unknown[]|undefined;
        if(prev&&prev.length===deps.length&&prev.every((v,j)=>Object.is(v,deps[j])))return;
        slots[i]=deps;
        effects.push(()=>{cleanups.get(i)?.();cleanups.delete(i);const dispose=effect();if(typeof dispose==="function")cleanups.set(i,dispose);});
    }
    const jsx=(type:any,props:any)=>({type,props});
    const Popout={Animation:{NONE:0}};
    const timer=(callback:()=>void,delay:number)=>{const id=++timerId;timers.set(id,{callback,delay});return id;};
    const clear=(id:number)=>{timers.delete(id);};
    const mod=load(noticeOutput,{
        "react/jsx-runtime":{jsx,jsxs:jsx,Fragment:"fragment"},
        "@webpack/common":{Popout,useState,useRef,useEffect},
        "../graphics/runtime":{useEffectiveReducedMotion:()=>reduced},
        "../notifications/NotificationCenter":{NotificationCenterPanel:()=>null,useNotificationCenterFeed:()=>({unreadCount:0})},
        "./notifications":{getDashboardNotice:()=>current,subscribeDashboardNotice:(callback:()=>void)=>{subscriber=callback;return()=>{subscriber=null;};}}
    },{setTimeout:timer,clearTimeout:clear});
    function flush(){for(const f of effects.splice(0))f();}
    function render(flushEffects=true) {
        cursor=0;
        const popout=mod.DashboardNoticeLane();
        if(flushEffects)flush();
        const fragment=popout.props.children(null,{isShown:false});
        return fragment.props.children.props;
    }
    function emit(next:Notice|null){current=next;assert.ok(subscriber);subscriber();}
    function runTimer(delay:number){
        const item=[...timers.entries()].find(([,value])=>value.delay===delay);
        assert.ok(item,"Expected transition timer "+delay);
        timers.delete(item[0]);item[1].callback();
    }
    const first={id:1,text:"First",tone:"success"},second={id:2,text:"Second",tone:"info"};
    assert.match(render().className,/is-idle/);
    emit(first);assert.match(render().className,/is-mounted/);
    runTimer(24);assert.match(render().className,/is-visible/);
    emit(null);assert.match(render().className,/is-exiting/);
    runTimer(360);assert.match(render().className,/is-idle/);
    reduced=true;render();emit(first);assert.match(render().className,/is-visible/);assert.equal(timers.size,0);
    emit(null);assert.match(render().className,/is-idle/);assert.equal(timers.size,0);
    reduced=false;render();emit(first);render();runTimer(24);render();
    emit(null);assert.match(render().className,/is-exiting/);
    reduced=true;render(false); // effect from the exiting notice has not run yet
    emit(second); // a new notice arrives before that passive effect
    flush();const latest=render();
    assert.match(latest.className,/is-visible/);
    assert.match(latest["aria-label"],/Second/);
    assert.equal(timers.size,0);
    for(const f of cleanups.values())f();cleanups.clear();
    assert.equal(subscriber,null);assert.equal(timers.size,0);
    console.log("Production Notice lifecycle: normal/reduced, live switch and stale-effect race PASS");
}
testNoticeLifecycle();

async function main(){
    const normal=createHarness(false);normal.start();normal.resolve();await normal.flush();
    assert.equal(normal.busy(),true);assert.equal(normal.recovery(),true);
    for (let i=1;i<QUEST_RELOAD_MIN_ROTATIONS;i++) {
        normal.iteration();await normal.flush();
        assert.equal(normal.busy(),true,"Full motion must preserve the minimum rotations");
    }
    normal.iteration();await normal.flush();
    assert.equal(normal.busy(),false);assert.equal(normal.recovery(),false);
    assert.deepEqual(normal.events,["QUEST_RELOAD_SUCCEEDED"]);
    normal.unmount();
    const reduced=createHarness(true);reduced.start();reduced.resolve();await reduced.flush();
    assert.equal(reduced.busy(),false);assert.equal(reduced.recovery(),false);
    assert.deepEqual(reduced.events,["QUEST_RELOAD_SUCCEEDED"]);
    reduced.unmount();
    const switched=createHarness(false);switched.start();switched.resolve();await switched.flush();
    assert.equal(switched.busy(),true);switched.setReduced(true);await switched.flush();
    assert.equal(switched.busy(),false);assert.equal(switched.recovery(),false);
    assert.deepEqual(switched.events,["QUEST_RELOAD_SUCCEEDED"]);switched.unmount();
    const failed=createHarness(true);failed.start();failed.reject(Error("fixture"));await failed.flush();
    assert.equal(failed.busy(),false);assert.equal(failed.recovery(),false);
    assert.deepEqual(failed.events,["QUEST_RELOAD_FAILED"]);assert.equal(failed.toasts.length,1);failed.unmount();
    const account=createHarness(true);account.start();account.setInactive();account.resolve();await account.flush();
    assert.equal(account.busy(),false);assert.deepEqual(account.events,[]);assert.deepEqual(account.notices,[]);account.unmount();
    const disposed=createHarness(false);disposed.start();disposed.unmount();disposed.resolve();await disposed.flush();
    assert.deepEqual(disposed.events,[]);assert.equal(disposed.recovery(),false);
    console.log("Production Reload lifecycle: normal/reduced, live motion switch, failure, account switch and unmount PASS");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
