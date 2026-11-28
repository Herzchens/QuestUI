import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import * as logic from "../../src/quests/actions/claimAll";
import * as state from "../../src/quests/actions/claimAllState";
import * as responses from "../../src/quests/actions/responses";

let account={accountId:"A"}, ready=true, blocked=false, ignored=new Set<string>();
const raw=new Map<string,any>(), calls:string[]=[], events:any[]=[], notices:any[]=[], toasts:any[]=[];
function quest(id:string,status:string){raw.set(id,{id,config:{},userStatus:status==="claimable"?{completedAt:"2026-01-01"}:{}});return {id,name:id,status};}
const a=quest("a","available"), b=quest("b","available"), c=quest("c","claimable"), d=quest("d","available");
let release:()=>void=()=>{}, pause=false;
async function mutation(mode:string,q:any,generation:number){
    assert.equal(state.isClaimAllRuntimeGenerationActive(generation),true);
    calls.push(mode+":"+q.id);
    if(pause) await new Promise<void>(resolve=>{release=resolve;});
    if(mode==="claim")raw.get(q.id).userStatus.claimedAt="2026-01-02";
    else raw.get(q.id).userStatus.enrolledAt="2026-01-02";
    return {storeConfirmed:true};
}
class QuestActionError extends Error {}
const jsx=(type:any,props:any)=>({type,props});
const modules:Record<string,any>={
    "react/jsx-runtime":{jsx,jsxs:jsx,Fragment:"fragment"},
    "@webpack/common":{React:{useSyncExternalStore:(_:any,read:()=>any)=>read()},showToast:(v:any)=>toasts.push(v),UserStore:{getCurrentUser:()=>({id:account.accountId})},useStateFromStores:(_:any,read:()=>any)=>read()},
    "./claimAll":{...logic,waitBetweenClaimAllRequests:async()=>{}},
    "./claimAllState":state,"../../eventLog/runtime":{recordQuestUIEvent:async(v:any)=>{events.push(v);}},
    "../../dashboard/notifications":{pushDashboardNotice:(v:any)=>notices.push(v)},
    "../ignored/runtime":{ignoredQuestIds:()=>ignored,isIgnoredQuestStateReady:()=>ready,useIgnoredQuests:()=>({ids:ignored,ready})},
    "./responses":responses,"./native":{QuestActionError,claimQuestReward:(q:any,g:number)=>mutation("claim",q,g),enrollQuest:(q:any,g:number)=>mutation("enroll",q,g),hasPendingQuestAction:()=>blocked,usePendingQuestAction:()=>blocked},
    "../presentation":{captureQuestEventRef:(q:any)=>({id:q.id,name:q.name})},
    "../../plugin/stores":{QuestsStore:{getQuest:(id:string)=>raw.get(id)}},
    "../../plugin/accountSession":{captureAccountSession:()=>account,isCurrentAccountSession:(s:any)=>s===account}
};
const src=readFileSync(new URL("../../src/quests/actions/ClaimAllControl.tsx",import.meta.url),"utf8");
const code=ts.transpileModule(src,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const mod={exports:{} as any};
new Function("require","module","exports",code)((name:string)=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];},mod,mod.exports);
const render=(quests:any[])=>mod.exports.ClaimAllControl({quests}).props;
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
async function main(){
    let button=render([a,c]);assert.equal(button["aria-label"],"Claim All, 1 Quests");
    await button.onClick();assert.deepEqual(calls,["claim:c"]);
    assert.ok(events.some(e=>e.eventCode==="QUEST_CLAIM_ALL_SUCCEEDED"));
    ignored=new Set(["b"]);button=render([a,b]);assert.equal(button["aria-label"],"Accept All, 1 Quests");
    assert.equal(render([]).disabled,true);assert.equal(render([])["aria-label"],"Accept All, 0 Quests");
    blocked=true;assert.equal(render([a]).disabled,true);await render([a]).onClick();assert.equal(calls.length,1);blocked=false;
    pause=true;const first=button.onClick();await flush();
    assert.match(render([c]).children,/Accepting/);
    assert.equal(render([c]).disabled,true);
    await button.onClick();assert.deepEqual(calls,["claim:c","enroll:a"]);
    release();await first;pause=false;
    assert.ok(events.some(e=>e.eventCode==="QUEST_ACCEPT_ALL_SUCCEEDED"));
    assert.equal(state.getClaimAllRuntimeState().active,false);
    ignored.clear();const stale=render([d]);account={accountId:"B"};await stale.onClick();assert.equal(calls.length,2);
    ready=false;assert.equal(render([d]).disabled,true);await render([d]).onClick();assert.equal(calls.length,2);ready=true;
    await render([d]).onClick();assert.deepEqual(calls,["claim:c","enroll:a","enroll:d"]);
    assert.equal(toasts.length,0);assert.equal(notices.length,3);
    console.log("Production batch toolbar: priority, filtered inputs, Ignore, empty state, lock, mode stability and stale account PASS");
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
