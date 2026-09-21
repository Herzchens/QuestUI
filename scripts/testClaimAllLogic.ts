import assert from "node:assert/strict";

import {
    buildClaimAllSnapshot,
    ClaimAllBatchStoppedError,
    runClaimAllBatch
} from "../claimAllLogic";
import {
    beginClaimAllRuntime,
    endClaimAllRuntime,
    getClaimAllRuntimeState,
    updateClaimAllRuntimeProgress
} from "../claimAllRuntimeState";

const quest = (id: string, status = "claimable") => ({ id, name: `Quest ${id}`, status });

async function main() {
    endClaimAllRuntime();
    assert.equal(beginClaimAllRuntime(3), true);
    assert.equal(beginClaimAllRuntime(3), false);
    assert.deepEqual(getClaimAllRuntimeState(), { active: true, position: 1, total: 3 });
    updateClaimAllRuntimeProgress(2);
    assert.deepEqual(getClaimAllRuntimeState(), { active: true, position: 2, total: 3 });
    updateClaimAllRuntimeProgress(99);
    assert.deepEqual(getClaimAllRuntimeState(), { active: true, position: 3, total: 3 });
    endClaimAllRuntime();
    assert.deepEqual(getClaimAllRuntimeState(), { active: false, position: 0, total: 0 });

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
                && error.position === 2
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

    console.log("QuestUI Claim all logic tests — PASS");
}

void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
