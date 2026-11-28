import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import * as companion from "../../src/orion/companion";
import * as status from "../../src/orion/status";
import * as policy from "../../src/orion/ignorePolicy";
import * as subscriptions from "../../src/orion/controlSubscription";

let account = {accountId:"A"}, ready = true, enabled = true, integration = true;
let ids = new Set(["q2","q1"]), running = false;
let states: Record<string, "paused" | "running" | "queued" | "stopped"> = {q1:"paused",q2:"paused",q3:"paused"};
const calls: unknown[][] = [];
const command = {name:"orion",plugin:"OrionQuests",isVencordCommand:true,execute(){},
    options:[{name:"action",type:3,required:true,choices:["start","stop","pause","resume"].map(value=>({value}))}]};
const plugin: any = {
    started:true,version:"4.11.5",commands:[command],
    getEngineRunning:()=>running,subscribeEngineRunning:()=>()=>{},
    getControlSnapshot:()=>({running,quests:{...states}}),subscribeControlState:()=>()=>{},
    controlEngine(action:string){calls.push(["engine",action]);running=action==="start";return "ok";},
    controlAll(action:string){calls.push(["all",action]);return "ok";},
    controlQuest(id:string,action:string){calls.push(["quest",id,action]);return "ok";}
};
const plugins={OrionQuests:plugin};
const modules:Record<string,any>={
    "../quests/ignored/runtime":{ignoredQuestIds:(id:string)=>id===account.accountId?ids:new Set(),isIgnoredQuestStateReady:()=>ready},
    "../plugin/settings":{__esModule:true,default:{store:{get orionIntegration(){return integration;}}}},
    "./ignorePolicy":policy,"../plugin/accountSession":{captureAccountSession:()=>account,isCurrentAccountSession:(value:any)=>value===account},
    "./controlSubscription":subscriptions,"@api/Commands":{ApplicationCommandOptionType:{STRING:3},commands:{orion:command}},
    "@api/PluginManager":{plugins,isPluginEnabled:()=>enabled},
    "./capabilities":{getOrionSchedulerCapabilitySource:()=>null},
    "./companion":companion,"./schedulerState":{normalizeOrionSchedulerSnapshot:()=>null},"./status":status
};
const src=readFileSync(new URL("../../src/orion/integration.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const mod={exports:{} as any};
new Function("require","module","exports",js)((name:string)=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];},mod,mod.exports);
const {syncOrionExclusions:sync,invokeOrionEngineControl:engine,invokeOrionGlobalTaskControl:global,invokeOrionQuestTaskControl:quest}=mod.exports;
async function main(){
    const acknowledge=function(this:any,id:string,excluded:readonly string[]){assert.equal(this,plugin);calls.push(["exclude",id,[...excluded]]);return true;};
    assert.equal(sync(),false);
    plugin.setExcludedQuests=acknowledge;
    await engine("start");
    assert.deepEqual(calls.splice(0),[["exclude","A",["q1","q2"]],["engine","start"]]);
    await global("resume");
    assert.deepEqual(calls.splice(0),[["exclude","A",["q1","q2"]],["exclude","A",["q1","q2"]],["all","resume"]]);
    await assert.rejects(quest("q1","resume"),/Unignore/);
    assert.deepEqual(calls,[]);
    ids=new Set();
    assert.equal(sync(),true);
    assert.deepEqual(calls.splice(0),[["exclude","A",[]]]);
    account={accountId:"B"};ids=new Set(["q2"]);
    assert.equal(sync(),true);assert.deepEqual(calls.splice(0),[["exclude","B",["q2"]]]);
    for(const invalid of [undefined,()=>false,()=>{throw Error("unsupported");},()=>Promise.resolve(true)]){
        plugin.setExcludedQuests=invalid;
        await global("resume");
        assert.deepEqual(calls.splice(0),[["quest","q1","resume"],["quest","q3","resume"]]);
    }
    plugin.setExcludedQuests=acknowledge;ready=false;assert.equal(sync(),false);await assert.rejects(global("resume"),/still loading/);
    ready=true;integration=false;assert.equal(sync(),false);integration=true;enabled=false;assert.equal(sync(),false);enabled=true;
    assert.deepEqual(calls,[]);
    plugin.setExcludedQuests=()=>{account={accountId:"C"};return true;};
    assert.equal(sync(),false);
    running=false;await assert.rejects(engine("start"),/account changed/);assert.deepEqual(calls,[]);
    console.log("Native exclusion integration: sync before Start/Resume, empty replacement, account guard, legacy fallback PASS");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
