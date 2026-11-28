import assert from "node:assert/strict";
import { readBetterDiscordQuests } from "../../src/platform/betterdiscord/readHost";
const fixture = { id:"quest", config:{messages:{questName:"Test"}, expiresAt:"2030-01-01",taskConfig:{tasks:{WATCH_VIDEO:{target:60}}}},userStatus:{enrolledAt:"2026-01-01",progress:{WATCH_VIDEO:{value:12}}}};
let account: string | null = "A";
let reads = 0, switchDuringRead = false;
let available = true;
const store = {quests:new Map([["quest",fixture]]),getQuest(){if(switchDuringRead)account="B";return fixture;}};
const host = { Webpack:{ getStore(name:string){
    if(name==="UserStore")return {getCurrentUser(){reads++;return account?{id:account}:null;}};
    if(name==="QuestsStore"&&available)return store;
    return undefined;
}}};
const snapshot=readBetterDiscordQuests(host);
assert.equal(snapshot.kind,"ready");
assert.equal(snapshot.quests[0].progress,20);
assert.equal(snapshot.quests[0].rawQuest,null);
assert.equal(reads,2);
switchDuringRead=true;
assert.equal(readBetterDiscordQuests(host).kind,"unavailable");
switchDuringRead=false;account=null;
assert.equal(readBetterDiscordQuests(host).kind,"unavailable");
account="A";available=false;
assert.equal(readBetterDiscordQuests(host).kind,"unavailable");
assert.equal(readBetterDiscordQuests({Webpack:{getStore(){throw Error("host missing");}}}).kind,"unavailable");
console.log("BetterDiscord read-only preview adapter PASS");

import { createPreviewSession } from "../../src/platform/betterdiscord/session";
{
    account="A";available=true;switchDuringRead=false;
    const callbacks = new Set<() => void>();
    const accountListeners = new Set<() => void>();
    const monitoredHost = {Webpack:{getStore(name:string){
        if(name==="UserStore") return {getCurrentUser:()=>account?{id:account}:null,addChangeListener:(fn:()=>void)=>accountListeners.add(fn),removeChangeListener:(fn:()=>void)=>accountListeners.delete(fn)};
        return host.Webpack.getStore(name);
    }}};
    const session=createPreviewSession(()=>monitoredHost,{start(fn){callbacks.add(fn);return fn;},stop(handle){callbacks.delete(handle as ()=>void);}});
    session.start();assert.equal(callbacks.size,0);
    const unsub=session.subscribe(()=>{});
    assert.equal(callbacks.size,1);assert.equal(accountListeners.size,1);assert.equal(session.getSnapshot().kind,"ready");
    account="B";for(const fn of accountListeners)fn();
    assert.equal(session.getSnapshot().kind,"unavailable");
    for(const fn of callbacks)fn();
    assert.equal(session.getSnapshot().kind,"unavailable","poll cannot re-expose stale catalogue after account switch");
    session.refresh();assert.equal(session.getSnapshot().kind,"ready");
    const stale=[...callbacks][0];
    unsub();assert.equal(callbacks.size,0);assert.equal(accountListeners.size,0);
    stale();assert.equal(session.getSnapshot().kind,"unavailable");
    const again=session.subscribe(()=>{});
    assert.equal(callbacks.size,1);
    session.stop();assert.equal(callbacks.size,0);assert.equal(accountListeners.size,0);
    stale();assert.equal(session.getSnapshot().kind,"unavailable");
    session.start();assert.equal(callbacks.size,1);again();session.stop();
    assert.equal(callbacks.size,0);
}
