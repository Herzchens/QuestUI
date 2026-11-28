import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import * as logic from "../../src/quests/ignored/logic";
let session={accountId:"A"}, now=0, reads=0, writes=0, lookups=0;
let failRead=true, failWrite=false, blockWrite=false, allowCatalogue=false;
let releaseWrite:()=>void=()=>{};
let stored=logic.normalizeIgnoredQuestState({accounts:{A:["q1","q2"],B:["q1"]}});
const quests=new Map<string,any>([["q1",{id:"q1",config:{}}],["q2",{id:"q2",config:{expiresAt:"1970-01-01T00:00:05Z"}}]]);
const questListeners=new Set<()=>void>(), userListeners=new Set<()=>void>();
let serial=0;
const timers=new Map<number,{cb:()=>void,at:number,interval:number}>();
const modules:Record<string,any>={
    "@api/DataStore":{
        get:async()=>{reads++;if(failRead)throw Error("read failed");return structuredClone(stored);},
        update:async(_:string,fn:(value:unknown)=>typeof stored)=>{writes++;const next=fn(structuredClone(stored));if(blockWrite)await new Promise<void>(r=>releaseWrite=r);if(failWrite)throw Error("transaction aborted");stored=next;}
    },
    "@webpack/common":{React:{useSyncExternalStore:(_:any,read:()=>any)=>read()},UserStore:{getCurrentUser:()=>({id:session.accountId}),addChangeListener:(fn:()=>void)=>userListeners.add(fn),removeChangeListener:(fn:()=>void)=>userListeners.delete(fn)},useStateFromStores:(_:any,read:()=>any)=>read()},
    "./logic":{...logic,terminalIgnoredQuestIds:(values:Iterable<any>)=>logic.terminalIgnoredQuestIds(values,now)},
    "../../plugin/stores":{QuestsStore:{get quests(){if(!allowCatalogue)throw Error("full catalogue traversal forbidden");return quests;},getQuest:(id:string)=>{lookups++;return quests.get(id);},addChangeListener:(fn:()=>void)=>questListeners.add(fn),removeChangeListener:(fn:()=>void)=>questListeners.delete(fn)}},
    "../../plugin/accountSession":{captureAccountSession:()=>session,isCurrentAccountSession:(s:any)=>s===session}
};
const source=readFileSync(new URL("../../src/quests/ignored/runtime.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const mod={exports:{} as any};
class Clock extends Date {static now(){return now;}}
const add=(cb:()=>void,ms:number,interval=0)=>{timers.set(++serial,{cb,at:now+ms,interval});return serial;};
const clear=(id:number)=>timers.delete(id);
new Function("require","module","exports","Date","setTimeout","clearTimeout","setInterval","clearInterval",js)((name:string)=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];},mod,mod.exports,Clock,add,clear,(cb:()=>void,ms:number)=>add(cb,ms,ms),clear);
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function advance(ms:number){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){if(t.interval)t.at=now+t.interval;else timers.delete(id);t.cb();}}
const publish=(s:Set<()=>void>)=>{for(const fn of [...s])fn();};
async function main(){
    const {startIgnoredQuestLifecycle:start,stopIgnoredQuestLifecycle:stop,ignoredQuestIds:ids,isIgnoredQuestStateReady:ready,setQuestIgnored:set,useIgnoredQuests:hook,preloadIgnoredQuests:preload}=mod.exports;
    start();await flush();assert.equal(ready(),false);assert.equal(reads,1);
    for(let i=0;i<100;i++)preload();await flush();assert.equal(reads,1);
    await assert.rejects(set("A","new",true),/loading/);assert.equal(writes,0);
    failRead=false;advance(2000);await flush();assert.equal(ready(),true);assert.deepEqual([...ids()],["q1","q2"]);
    const original=ids(), initialLookups=lookups;
    for(let i=0;i<10000;i++){assert.equal(ids(),original);assert.equal(hook().ids,original);}
    assert.equal(lookups,initialLookups,"10,000 consumers must not repeat quest lookups");
    assert.equal(reads,2);
    failRead=true;await set("A","q3",true);assert.equal(ready(),true);assert.ok(ids().has("q3"));assert.equal(reads,2,"commit does not require a read-back");
    failWrite=true;await assert.rejects(set("A","q1",false),/persist/);assert.equal(ready(),false);assert.ok(ids().has("q1"));
    advance(2000);await flush();assert.equal(ready(),false);assert.ok(ids().has("q1"));
    failWrite=false;failRead=false;advance(2000);await flush();assert.equal(ready(),true);assert.ok(!ids().has("q2"),"expiry masked during retry");assert.ok(!stored.accounts.A.includes("q2"));
    quests.get("q1").userStatus={claimedAt:"2026-01-01"};publish(questListeners);assert.ok(!ids().has("q1"));await flush();assert.deepEqual(stored.accounts.A,["q3"]);assert.deepEqual(stored.accounts.B,["q1"]);
    quests.get("q1").userStatus={};session={accountId:"B"};publish(userListeners);assert.deepEqual([...ids()],["q1"]);await flush();
    blockWrite=true;const pending=set("B","q4",true);await flush();assert.ok(!ids().has("q4"),"no optimistic publication");stop();start();const beforeRestartRead=reads;preload();publish(questListeners);await flush();assert.equal(reads,beforeRestartRead,"restart cannot read ahead of an old transaction");blockWrite=false;releaseWrite();await pending;await flush();assert.equal(ready(),true);assert.ok(ids().has("q4"));
    stop();stored=logic.normalizeIgnoredQuestState({accounts:{B:Array.from({length:512},(_,i)=>"cap-"+i)}});start();await flush();assert.equal(ready(),true);await assert.rejects(set("B","overflow",true),/Ignore limit reached/);assert.equal(ready(),true);assert.equal(ids().size,512);assert.ok(ids().has("cap-0"));await set("B","cap-0",false);await set("B","overflow",true);assert.ok(ids().has("overflow"));
    stop();assert.equal(ready(),false);assert.equal(questListeners.size,0);assert.equal(userListeners.size,0);assert.equal(timers.size,0);
    stored=logic.normalizeIgnoredQuestState(null);
    session={accountId:"A"};allowCatalogue=true;
    quests.clear();quests.set("rule",{id:"rule",config:{messages:{questName:"Dune"}}});
    start();await flush();assert.equal(ready(),true);
    await mod.exports.setIgnoreRules("A",[],[{kind:"name-contains",value:"dune"}]);
    assert.ok(ids().has("rule"));assert.equal(hook().rules.length,1);
    await set("A","rule",false);assert.ok(!ids().has("rule"));assert.deepEqual(stored.ruleExceptions?.A,["rule"]);
    await set("A","rule",true);assert.ok(ids().has("rule"));assert.equal(stored.ruleExceptions,undefined);
    await mod.exports.setIgnoreRules("A",hook().rules,[]);assert.ok(ids().has("rule"),"manual Ignore survives rule removal");
    await set("A","rule",false);
    await mod.exports.setIgnoreRules("A",[],[{kind:"name-contains",value:"dune"}]);
    allowCatalogue=false;publish(questListeners);assert.equal(ready(),false);assert.ok(ids().has("rule"),"catalogue failure preserves last known exclusions");
    await mod.exports.setIgnoreRules("A",hook().rules,[]);assert.equal(ready(),true);assert.ok(!ids().has("rule"));
    stop();
    console.log("Ignore persistence: fail-closed reads, durable writes, retry, account/expiry cleanup, lifecycle and 10,000 shared reads PASS");
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
