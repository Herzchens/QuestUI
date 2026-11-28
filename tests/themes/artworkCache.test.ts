import assert from "node:assert/strict";
import { createArtworkColorPool } from "../../src/themes/artworkColorPool";
import { createArtworkQueue, artworkStringBytes, ARTWORK_CACHE_BYTES } from "../../src/themes/terminal/artworkQueue";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

async function rasterBudget() {
    const calls: string[] = [];
    const q = createArtworkQueue(async key => { calls.push(key); return key.repeat(4); }, 1, 128, Date.now, 20);
    for (const key of ["a","b"]) { const r = q.acquire(key); await r.promise; r.release(); await flush(); }
    assert.equal(q.stats().retainedBytes, 20);
    assert.equal(q.peek("a"), "aaaa"); // touch a; b is oldest
    const c = q.acquire("c"); await c.promise; c.release(); await flush();
    assert.equal(q.peek("a"), "aaaa");
    assert.equal(q.peek("b"), undefined);
    assert.equal(q.peek("c"), "cccc");
    q.setCacheBudget(10);
    assert.equal(q.stats().retainedBytes, 10);
    assert.equal(q.peek("a"), undefined);
    const oversized = q.acquire("oversized"); assert.equal(await oversized.promise,"oversized".repeat(4)); oversized.release();
    assert.equal(q.peek("oversized"), undefined);
    q.setCacheBudget(0); assert.equal(q.stats().retainedBytes,0);
    q.setCacheBudget(999); assert.equal(q.stats().budget,20);
    q.stop(); assert.equal(q.stats().cached,0);
    assert.equal(await q.acquire("disabled").promise,null);
    q.start();
    const again=q.acquire("a"); assert.equal(await again.promise,"aaaa"); again.release();
    assert.deepEqual(calls,["a","b","c","oversized","a"]);
    const pair = {png:"1234",frame:"abc"};
    const joint = createArtworkQueue(async () => pair,1,3,Date.now,16,v=>artworkStringBytes(v.png)+artworkStringBytes(v.frame));
    const p=joint.acquire("x"); assert.equal(await p.promise,pair); p.release();
    assert.equal(joint.peek("x"),pair);
    assert.equal(joint.stats().retainedBytes,16);
}

async function cancellation() {
    const loads: Array<{key:string;signal:AbortSignal;resolve:(value:string|null)=>void}> = [];
    const q=createArtworkQueue<string>((key,signal)=>new Promise(resolve=>loads.push({key,signal,resolve})),1,3);
    const old=q.acquire("same"), oldShared=q.acquire("same"), waiting=q.acquire("queued");
    await flush(); assert.equal(loads.length,1);
    old.release(); assert.equal(loads[0].signal.aborted,false);
    q.stop(); assert.equal(loads[0].signal.aborted,true);
    assert.equal(await oldShared.promise,null); assert.equal(await waiting.promise,null);
    assert.equal(q.stats().running,1); assert.equal(q.stats().queued,0);
    q.start();
    const next=q.acquire("same"); oldShared.release(); waiting.release();
    await flush(); assert.equal(loads.length,1,"Canceled loader still owns its worker");
    loads[0].resolve("old"); await flush();
    assert.equal(q.peek("same"),undefined);
    assert.equal(loads.length,2);
    assert.equal(loads[1].signal.aborted,false);
    loads[1].resolve("new"); assert.equal(await next.promise,"new"); next.release(); await flush();
    assert.equal(q.peek("same"),"new");
    assert.equal(q.stats().running,0);
    q.stop();
}

async function colorReuse() {
    let calls=0;
    const p=createArtworkColorPool(async (url:string)=>{calls++;return url;},4,2,2);
    const owner={};
    p.replaceCatalogue(owner,["a","b","c","d"]); await flush();
    assert.equal(calls,4);
    p.replaceCatalogue(owner,[]);
    assert.equal(p.stats().idle,2); assert.equal(p.stats().entries,2);
    assert.equal(p.peek("a"),undefined);
    const c=p.acquire("c"); assert.equal(await c.promise,"c"); c.release(); await flush(); assert.equal(calls,4);
    const e=p.acquire("e"); assert.equal(await e.promise,"e"); e.release(); await flush();
    assert.equal(p.stats().idle,2); assert.equal(p.peek("d"),undefined);
    const mounted=p.acquire("mounted"); await mounted.promise;
    p.replaceCatalogue(owner,["x","y","z","w"]); await flush();
    assert.equal(p.peek("mounted"),"mounted");
    p.replaceCatalogue(owner,[]); mounted.release(); assert.equal(p.stats().entries,2);
    p.stop(); assert.equal(p.stats().entries,0); assert.equal(p.stats().idle,0);
    assert.equal(await p.acquire("disabled").promise,null);
    p.start(); const r=p.acquire("c"); assert.equal(await r.promise,"c"); r.release(); p.stop();
}

async function colorStopRace() {
    const loads: Array<{signal:AbortSignal;resolve:(v:string|null)=>void}>=[];
    const p=createArtworkColorPool<string>((_,signal)=>new Promise(resolve=>loads.push({signal,resolve})),2,1,2);
    const old=p.acquire("a"); await flush();
    p.stop(); assert.equal(await old.promise,null); assert.equal(loads[0].signal.aborted,true);
    p.start(); const owner={}; p.replaceCatalogue(owner,["a"]); const next=p.acquire("a");
    old.release(); assert.equal(p.stats().queued,1);
    loads[0].resolve("old"); await flush();
    assert.equal(p.peek("a"),undefined); assert.equal(loads.length,2);
    loads[1].resolve("new"); assert.equal(await next.promise,"new"); next.release();
    p.stop(); assert.equal(p.stats().entries,0);
}

async function workload() {
    // Deterministic accounting workload; not an Electron or GPU benchmark.
    const keys=Array.from({length:64},(_,i)=>"key-"+i+"-"+ "x".repeat(20000));
    const payload="p".repeat(200000);
    let loads=0;
    const q=createArtworkQueue(async()=>{loads++;return payload;},2,64,Date.now,ARTWORK_CACHE_BYTES.panorama);
    for(const key of keys){const r=q.acquire(key);await r.promise;r.release();}
    await flush();
    const max=q.stats();
    assert.ok(max.retainedBytes<=ARTWORK_CACHE_BYTES.panorama);
    assert.ok(max.cached<64);
    q.setCacheBudget(ARTWORK_CACHE_BYTES.inactivePanorama);
    const low=q.stats();
    assert.ok(low.retainedBytes<=ARTWORK_CACHE_BYTES.inactivePanorama);
    assert.ok(low.cached<max.cached);
    const recent=q.acquire(keys.at(-1)!); await recent.promise; recent.release();
    assert.equal(loads,64);
    console.log("Synthetic artwork cache workload (accounted JS bytes): "+JSON.stringify({max,low,loads}));
    q.stop(); assert.equal(q.stats().retainedBytes,0);
}

void (async()=>{await rasterBudget();await cancellation();await colorReuse();await colorStopRace();await workload();
    console.log("Artwork cache LRU, byte caps, frame ownership, shared cancellation, stop/restart and color reuse: PASS");
})().catch(error=>{console.error(error);process.exitCode=1;});
