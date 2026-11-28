import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import * as responses from "../../src/quests/actions/responses";
import * as safety from "../../src/quests/actions/safety";
import * as batch from "../../src/quests/actions/claimAllState";

let account = { accountId: "a" };
let ignored = new Set<string>();
let ready = true, now = 10000, serial = 0;
const timers = new Map<number,{cb:()=>void,at:number}>();
const listeners = new Set<()=>void>();
const quests = new Map<string,any>();
const calls: string[] = [];
function addQuest(id:string, completed=false) {
    quests.set(id,{id,config:{rewardsConfig:{}},userStatus:completed?{completedAt:"2026-01-01"}:{}});
    return {id,name:id,status:completed?"claimable":"available"};
}
const q1=addQuest("q1",true),q2=addQuest("q2",true),q3=addQuest("q3"),q4=addQuest("q4",true);
const notify=()=>{for(const cb of [...listeners])cb();};
let claimMode:"confirmed"|"pending"|"rate"|"thrown-rate" = "confirmed";
let enrollMode:"confirmed"|"rate" = "confirmed";
const claim=async(id:string)=>{
    calls.push("claim:"+id);
    if(claimMode==="rate")return {status:429,body:{retry_after:4}};
    if(claimMode==="thrown-rate")throw {response:{status:429,headers:{"Retry-After":"5"}}};
    if(claimMode==="confirmed"){quests.get(id).userStatus.claimedAt="2026-01-02";notify();}
    return {body:{claimed_at:"2026-01-02"}};
};
const enroll=async(id:string)=>{
    calls.push("enroll:"+id);
    if(enrollMode==="rate")return {status:429,body:{retry_after:3}};
    quests.get(id).userStatus.enrolledAt="2026-01-02";notify();return {type:"success"};
};
const modules:Record<string,any>={
    "../ignored/runtime":{ignoredQuestIds:()=>ignored,isIgnoredQuestStateReady:()=>ready},
    "@webpack":{findByCodeLazy:(marker:string)=>marker==="QUESTS_ENROLL_BEGIN"?enroll:()=>{},mapMangledModuleLazy:()=>({claimQuestReward:claim})},
    "@webpack/common":{UserStore:{getCurrentUser:()=>({id:account.accountId})},useEffect(){},useState(){}},
    "./claimAllState":batch,"./responses":responses,"./safety":safety,
    "../../plugin/stores":{QuestsStore:{getQuest:(id:string)=>quests.get(id),addChangeListener:(fn:()=>void)=>listeners.add(fn),removeChangeListener:(fn:()=>void)=>listeners.delete(fn)}},
    "../../plugin/accountSession":{captureAccountSession:()=>account,isCurrentAccountSession:(s:any)=>s===account}
};
const src=readFileSync(new URL("../../src/quests/actions/native.ts",import.meta.url),"utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const mod={exports:{} as any};
class Clock extends Date { static now(){return now;} }
new Function("require","module","exports","Date","setTimeout","clearTimeout",js)((name:string)=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];},mod,mod.exports,Clock,(cb:()=>void,ms:number)=>{timers.set(++serial,{cb,at:now+ms});return serial;},(id:number)=>timers.delete(id));
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function advance(ms:number){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.cb();}}
async function main(){
    const {claimQuestReward:c,enrollQuest:e,hasPendingQuestAction:blocked}=mod.exports;
    ignored.add("q3");await assert.rejects(e(q3),/Unignore/);ignored.clear();
    ready=false;await assert.rejects(e(q3),/Unignore/);ready=true;
    assert.equal(batch.beginClaimAllRuntime(2,"claim"),true);
    const generation=batch.getClaimAllRuntimeGeneration()!;
    await assert.rejects(c(q1),(err:any)=>err.code==="LOCAL_BATCH_ACTIVE");
    await assert.rejects(e(q3),(err:any)=>err.code==="LOCAL_BATCH_ACTIVE");
    ignored.add("q1");await assert.rejects(c(q1,generation),(err:any)=>err.code==="LOCAL_QUEST_IGNORED");ignored.clear();
    assert.deepEqual(await c(q1,generation),{storeConfirmed:true,resubmitAfterMs:null});
    assert.deepEqual(calls,["claim:q1"]);
    claimMode="pending";
    const waiting=c(q2,generation);
    await flush();assert.equal(blocked("a"),true);
    advance(6000);await flush();assert.equal(listeners.size,1,"Batch confirmation must survive the old 5s timeout");
    quests.get("q2").userStatus.claimedAt="2026-01-03";notify();
    assert.deepEqual(await waiting,{storeConfirmed:true,resubmitAfterMs:null});
    batch.endClaimAllRuntime(generation);
    assert.equal(blocked("a"),false);
    claimMode="rate";
    await assert.rejects(c(q4),(err:any)=>err.code==="HTTP_RATE_LIMITED"&&err.resubmitAfterMs===4000);
    assert.equal(blocked("a"),true);
    assert.equal(mod.exports.questActionStatus("claim","a","q4"),"cooldown");
    await assert.rejects(e(q3),(err:any)=>err.code==="LOCAL_RATE_LIMIT_COOLDOWN");
    assert.deepEqual(calls,["claim:q1","claim:q2","claim:q4"]);
    advance(3999);assert.equal(blocked("a"),true);advance(1);assert.equal(blocked("a"),false);
    claimMode="thrown-rate";
    await assert.rejects(c(q4),(err:any)=>err.code==="HTTP_RATE_LIMITED"&&err.resubmitAfterMs===5000);
    account={accountId:"b"};assert.equal(blocked("b"),false);assert.equal(blocked("a"),true);
    enrollMode="rate";await assert.rejects(e(q3),(err:any)=>err.code==="HTTP_RATE_LIMITED"&&err.resubmitAfterMs===3000);
    advance(5000);assert.equal(blocked("a"),false);assert.equal(blocked("b"),false);
    enrollMode="confirmed";assert.deepEqual(await e(q3),{storeConfirmed:true,resubmitAfterMs:null});
    claimMode="pending";
    const uncertain=c(q4);await flush();advance(5000);await flush();
    assert.deepEqual(await uncertain,{storeConfirmed:false,resubmitAfterMs:15000});
    assert.equal(mod.exports.questActionStatus("claim","b","q4"),"submitted");
    await assert.rejects(c(q4),(err:any)=>err.code==="LOCAL_SUBMISSION_PENDING");
    quests.get("q4").userStatus.claimedAt="2026-01-03";notify();
    assert.equal(blocked("b"),false);assert.equal(mod.exports.questActionStatus("claim","b","q4"),"idle");assert.equal(listeners.size,0);assert.equal(timers.size,0);
    const q5=addQuest("q5",true);claimMode="pending";const late=c(q5);await flush();quests.get("q5").userStatus.claimedAt="2026-01-03";advance(5000);assert.deepEqual(await late,{storeConfirmed:true,resubmitAfterMs:null});assert.equal(listeners.size,0);
    console.log("Native mutation integration: batch lock, late confirmation, explicit 429, account cooldown and duplicate guard PASS");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
