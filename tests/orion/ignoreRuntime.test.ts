import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import * as policy from "../../src/orion/ignorePolicy";

let ids = new Set(["a"]), enabled = true, ready = true, native = false;
let now = 0, account = { accountId: "one" };
let snapshot: any = { running:true, quests:{a:"queued",b:"running"} };
const paused: string[] = [];
let publish: (()=>void)|undefined, changed: (()=>void)|undefined;
let tick: (()=>void)|undefined;
const settings={store:{get orionIntegration(){return enabled;}}};
const mod={exports:{} as any};
const modules: Record<string,any> = {
    "../plugin/accountSession": { captureAccountSession:()=>account,isCurrentAccountSession:(s:any)=>s===account },
    "../plugin/settings": {__esModule:true,default:settings},
    "../quests/ignored/runtime": {ignoredQuestIds:()=>ids,isIgnoredQuestStateReady:()=>ready,subscribeIgnoredQuests:(fn:()=>void)=>{changed=fn;return()=>{changed=undefined;};}},
    "./integration": {getOrionControlSnapshot:()=>snapshot,isOrionCommandReady:()=>true,
        syncOrionExclusions:()=>native,subscribeOrionControlState:(fn:()=>void)=>{publish=fn;return()=>{publish=undefined;};},
        invokeOrionQuestTaskControl:async(id:string,action:string)=>{assert.equal(action,"pause");paused.push(id);snapshot.quests[id]="paused";publish?.();}},
    "./ignorePolicy":policy
};
const source=readFileSync(new URL("../../src/orion/ignoreRuntime.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
new Function("require","module","exports","setInterval","clearInterval","Date",code)((name:string)=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];},mod,mod.exports,(fn:()=>void)=>{tick=fn;return 1;},()=>{tick=undefined;},{now:()=>now});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function main(){
    const {startOrionIgnoreEnforcement:start,stopOrionIgnoreEnforcement:stop}=mod.exports;
    start();await flush();assert.deepEqual(paused,["a"]);assert.equal(snapshot.quests.b,"running");
    snapshot.quests.a="queued";now+=1001;publish?.();await flush();assert.deepEqual(paused,["a","a"]);
    ids=new Set(["b"]);changed?.();await flush();assert.deepEqual(paused,["a","a","b"]);
    native=true;snapshot.quests.b="running";now+=1001;tick?.();await flush();assert.deepEqual(paused,["a","a","b"]);
    native=false;enabled=false;tick?.();await flush();assert.equal(paused.length,3);
    enabled=true;ready=false;tick?.();await flush();assert.equal(paused.length,3);
    ready=true;account={accountId:"two"};ids=new Set(["c"]);snapshot={running:true,quests:{c:"queued"}};tick?.();await flush();assert.deepEqual(paused,["a","a","b","c"]);
    stop();assert.equal(tick,undefined);assert.equal(publish,undefined);assert.equal(changed,undefined);
    snapshot.quests.c="queued";now+=1001;start();stop();await flush();assert.equal(paused.length,4);
    console.log("Orion Ignore enforcement: fallback, external resume, capability, account switch and stop PASS");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
