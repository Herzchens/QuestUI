import assert from "node:assert/strict";

import {
    buildClaimAllSnapshot,
    selectBatchAction,
    claimAllDelayMs,
    ClaimAllBatchStoppedError,
    runClaimAllBatch
} from "../../src/quests/actions/claimAll";
import {
    beginClaimAllRuntime,
    endClaimAllRuntime,
    getClaimAllRuntimeGeneration,
    getClaimAllRuntimeState,
    isClaimAllRuntimeGenerationActive,
    resetClaimAllRuntime,
    updateClaimAllRuntimeProgress
} from "../../src/quests/actions/claimAllState";

const quest = (id: string, status = "claimable") => ({ id, name: `Quest ${id}`, status });

async function main() {
    endClaimAllRuntime();
    assert.equal(beginClaimAllRuntime(3), true);
    assert.equal(beginClaimAllRuntime(3), false);
    assert.deepEqual(getClaimAllRuntimeState(), { active: true, mode: "claim", position: 1, total: 3 });
    updateClaimAllRuntimeProgress(2);
    assert.deepEqual(getClaimAllRuntimeState(), { active: true, mode: "claim", position: 2, total: 3 });
    updateClaimAllRuntimeProgress(99);
    assert.deepEqual(getClaimAllRuntimeState(), { active: true, mode: "claim", position: 3, total: 3 });
    endClaimAllRuntime();
    assert.deepEqual(getClaimAllRuntimeState(), { active: false, mode: null, position: 0, total: 0 });

    assert.equal(beginClaimAllRuntime(2), true);
    const staleGeneration = getClaimAllRuntimeGeneration();
    assert.ok(staleGeneration != null);
    assert.equal(isClaimAllRuntimeGenerationActive(staleGeneration), true);
    resetClaimAllRuntime();
    assert.equal(isClaimAllRuntimeGenerationActive(staleGeneration), false);
    assert.deepEqual(getClaimAllRuntimeState(), { active: false, mode: null, position: 0, total: 0 });

    assert.equal(beginClaimAllRuntime(2), true);
    const currentGeneration = getClaimAllRuntimeGeneration();
    assert.ok(currentGeneration != null);
    assert.notEqual(currentGeneration, staleGeneration);
    updateClaimAllRuntimeProgress(2, staleGeneration);
    assert.deepEqual(getClaimAllRuntimeState(), { active: true, mode: "claim", position: 1, total: 2 });
    endClaimAllRuntime(staleGeneration);
    assert.equal(isClaimAllRuntimeGenerationActive(currentGeneration), true);
    endClaimAllRuntime(currentGeneration);
    assert.deepEqual(getClaimAllRuntimeState(), { active: false, mode: null, position: 0, total: 0 });

    assert.deepEqual(
        buildClaimAllSnapshot([
            quest("a"),
            quest("b", "claimed"),
            quest("a"),
            quest("c", "in-progress"),
            quest("d")
        ]).map(item => item.id),
        ["a", "d"]
    );

    {
        const order: string[] = [];
        const result = await runClaimAllBatch(
            [quest("a"), quest("b")],
            "user-a",
            {
                currentAccountId: () => "user-a",
                currentState: () => "claimable",
                claim: async item => {
                    order.push(item.id);
                    return { storeConfirmed: true };
                }
            }
        );

        assert.deepEqual(order, ["a", "b"]);
        assert.deepEqual(result, { total: 2, claimed: 2, skipped: 0 });
    }

    {
        const order: string[] = [];
        const result = await runClaimAllBatch(
            [quest("a"), quest("b")],
            "user-a",
            {
                currentAccountId: () => "user-a",
                currentState: id => id === "a" ? "claimed" : "claimable",
                claim: async item => {
                    order.push(item.id);
                    return { storeConfirmed: true };
                }
            }
        );

        assert.deepEqual(order, ["b"]);
        assert.deepEqual(result, { total: 2, claimed: 1, skipped: 1 });
    }

    {
        const order: string[] = [];
        await assert.rejects(
            runClaimAllBatch(
                [quest("a"), quest("b")],
                "user-a",
                {
                    currentAccountId: () => "user-a",
                    currentState: () => "claimable",
                    claim: async item => {
                        order.push(item.id);
                        return { storeConfirmed: false };
                    }
                }
            ),
            error => error instanceof ClaimAllBatchStoppedError
                && error.position === 1
                && error.result.claimed === 0
        );
        assert.deepEqual(order, ["a"]);
    }

    {
        let account = "user-a";
        const order: string[] = [];
        await assert.rejects(
            runClaimAllBatch(
                [quest("a"), quest("b")],
                "user-a",
                {
                    currentAccountId: () => account,
                    currentState: () => "claimable",
                    claim: async item => {
                        order.push(item.id);
                        account = "user-b";
                        return { storeConfirmed: true };
                    }
                }
            ),
            error => error instanceof ClaimAllBatchStoppedError
                && error.position === 1
                && error.result.claimed === 1
                && /account changed/i.test(error.message)
        );
        assert.deepEqual(order, ["a"]);
    }

    {
        const order: string[] = [];
        const challenge = new Error("captcha");
        await assert.rejects(
            runClaimAllBatch(
                [quest("a"), quest("b")],
                "user-a",
                {
                    currentAccountId: () => "user-a",
                    currentState: () => "claimable",
                    claim: async item => {
                        order.push(item.id);
                        throw challenge;
                    }
                }
            ),
            error => error instanceof ClaimAllBatchStoppedError
                && error.cause === challenge
                && error.position === 1
        );
        assert.deepEqual(order, ["a"]);
    }

    {
        let active = true;
        const order: string[] = [];
        await assert.rejects(
            runClaimAllBatch(
                [quest("a"), quest("b")],
                "user-a",
                {
                    currentAccountId: () => "user-a",
                    currentState: () => "claimable",
                    shouldContinue: () => active,
                    claim: async item => {
                        order.push(item.id);
                        active = false;
                        return { storeConfirmed: true };
                    }
                }
            ),
            error => error instanceof ClaimAllBatchStoppedError
                && error.position === 1
                && error.result.claimed === 1
                && /cancelled/i.test(error.message)
        );
        assert.deepEqual(order, ["a"]);
    }

    {
        const order: string[] = [];
        const result = await runClaimAllBatch(
            [quest("solo")],
            "user-a",
            {
                currentAccountId: () => "user-a",
                currentState: () => "claimable",
                claim: async item => {
                    order.push(item.id);
                    return { storeConfirmed: true };
                }
            }
        );

        assert.deepEqual(order, ["solo"]);
        assert.deepEqual(result, { total: 1, claimed: 1, skipped: 0 });
    }

    {
        const confirmed: string[] = [];
        await assert.rejects(runClaimAllBatch(
            [quest("skipped"), quest("a"), quest("b"), quest("c")],
            "user-a",
            {
                currentAccountId: () => "user-a",
                currentState: id => id === "skipped" ? "claimed" : "claimable",
                claim: async item => ({ storeConfirmed: item.id !== "b" }),
                onConfirmed: item => confirmed.push(item.id)
            }
        ), error => error instanceof ClaimAllBatchStoppedError && error.result.claimed === 1 && error.result.skipped === 1);
        assert.deepEqual(confirmed, ["a"]);
    }
    {
        const confirmed: string[] = [];
        const result = await runClaimAllBatch([quest("a"), quest("b")], "user-a", {
            currentAccountId: () => "user-a",
            currentState: () => "claimable",
            claim: async () => ({ storeConfirmed: true }),
            onConfirmed: item => confirmed.push(item.id)
        });
        assert.deepEqual(confirmed, ["a", "b"]);
        assert.equal(result.claimed, 2);
    }
    {
        const confirmed: string[] = [];
        let account = "user-a";
        await assert.rejects(runClaimAllBatch([quest("a")], "user-a", {
            currentAccountId: () => account,
            currentState: () => "claimable",
            claim: async () => {
                account = "user-b";
                return { storeConfirmed: true };
            },
            onConfirmed: item => confirmed.push(item.id)
        }), error => error instanceof ClaimAllBatchStoppedError && /account changed/i.test(error.message));
        assert.deepEqual(confirmed, []);
    }

    assert.equal(claimAllDelayMs(() => 0), 1000);
    assert.equal(claimAllDelayMs(() => 0.5), 2000);
    assert.equal(claimAllDelayMs(() => 0.999999), 3000);
    {
        const trace: string[] = [];
        const result = await runClaimAllBatch(
            [quest("a"), quest("skipped"), quest("b"), quest("c"), quest("last-skipped")],
            "user-a",
            {
                currentAccountId: () => "user-a",
                currentState: id => id.includes("skipped") ? "claimed" : "claimable",
                claim: async item => { trace.push(item.id); return { storeConfirmed: true }; },
                waitBetweenClaims: async () => { trace.push("wait"); },
                onConfirmed: item => { trace.push("confirmed:" + item.id); }
            }
        );
        assert.deepEqual(trace, ["a", "confirmed:a", "wait", "b", "confirmed:b", "wait", "c", "confirmed:c"]);
        assert.deepEqual(result, { total: 5, claimed: 3, skipped: 2 });
    }
    for (const change of ["account", "cancel", "unavailable"] as const) {
        let account = "user-a";
        let active = true;
        let unavailable = false;
        const claimed: string[] = [];
        await assert.rejects(runClaimAllBatch([quest("a"), quest("b")], "user-a", {
            currentAccountId: () => account,
            currentState: () => unavailable ? "unavailable" : "claimable",
            shouldContinue: () => active,
            claim: async item => { claimed.push(item.id); return { storeConfirmed: true }; },
            waitBetweenClaims: async () => {
                if (change === "account") account = "user-b";
                if (change === "cancel") active = false;
                if (change === "unavailable") unavailable = true;
            }
        }), error => error instanceof ClaimAllBatchStoppedError && error.position === 2 && error.result.claimed === 1);
        assert.deepEqual(claimed, ["a"]);
    }
    {
        let waited = false;
        const trace: string[] = [];
        const result = await runClaimAllBatch([quest("a"), quest("b"), quest("c")], "user-a", {
            currentAccountId: () => "user-a",
            currentState: id => id === "b" && waited ? "claimed" : "claimable",
            claim: async item => { trace.push(item.id); return { storeConfirmed: true }; },
            waitBetweenClaims: async () => { waited = true; trace.push("wait"); }
        });
        assert.deepEqual(trace, ["a", "wait", "c"]);
        assert.deepEqual(result, { total: 3, claimed: 2, skipped: 1 });
    }

    assert.deepEqual(selectBatchAction([quest("a","available"),quest("b")],new Set(["b"])), {mode:"enroll",candidates:[quest("a","available")]});
    assert.deepEqual(selectBatchAction([quest("a","available"),quest("b")],new Set()), {mode:"claim",candidates:[quest("b")]});
    assert.deepEqual(selectBatchAction([quest("a","available")],new Set(["a"])), {mode:"enroll",candidates:[]});
    assert.equal(beginClaimAllRuntime(2,"enroll"),true);assert.equal(getClaimAllRuntimeState().mode,"enroll");endClaimAllRuntime();
    for (const mode of ["claim","enroll"] as const) {
        const trace:string[]=[];let ignored=false;
        const result=await runClaimAllBatch(Array.from({length:20},(_,i)=>quest(String(i),mode==="claim"?"claimable":"available")),"user-a",{
            mode,currentAccountId:()=>"user-a",currentState:id=>id==="8"&&ignored?"skipped":"claimable",
            claim:async item=>{trace.push(item.id);return {storeConfirmed:true};},
            waitBetweenClaims:async()=>{ignored=true;}
        });
        assert.equal(result.claimed,19);assert.equal(result.skipped,1);assert.ok(!trace.includes("8"));
    }
    {
        let ignored=false;
        const result=await runClaimAllBatch([quest("a")],"user-a",{
            currentAccountId:()=>"user-a",currentState:()=>ignored?"skipped":"claimable",
            claim:async()=>{throw Error("ignored quest dispatched");}
        },()=>{ignored=true;});
        assert.deepEqual(result,{total:1,claimed:0,skipped:1});
    }
    console.log("QuestUI batch action logic tests - PASS");
}

void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
