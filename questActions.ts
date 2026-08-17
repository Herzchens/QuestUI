import { findByCodeLazy } from "@webpack";
import { RestAPI } from "@webpack/common";

import { assessClaimResponse, isQuestVerificationError, selectClaimTarget } from "./questActionLogic";
import type { NormalizedQuest } from "./questData";
import { QuestsStore } from "./stores";

const QUEST_HOME_DESKTOP_LOCATION = 11;
const STORE_CONFIRM_TIMEOUT_MS = 5000;
const SUBMITTED_ACTION_HOLD_MS = 15000;

type NativeClaimQuestReward = (questId: string, platform: number, location: number) => Promise<unknown>;
type QuestActionKind = "enroll" | "claim";

// Reuse Discord's own claim action creator rather than rebuilding the request. This keeps
// current client-side metadata/challenge handling in Discord's normal action path.
const nativeClaimQuestReward = findByCodeLazy(
    "QUESTS_CLAIM_REWARD_BEGIN",
    "QUESTS_CLAIM_REWARD_SUCCESS",
    "QUESTS_CLAIM_REWARD_FAILURE",
    "traffic_metadata_sealed"
) as NativeClaimQuestReward;

// Component-local disabled state is not enough: multiple Dashboard instances or a quick
// close/reopen can otherwise submit the same mutation while Discord is still updating its
// store. The guard starts immediately before the network action and survives a successful but
// not-yet-confirmed response for a short bounded window.
const guardedActions = new Set<string>();

export interface QuestActionResult {
    /** True when QuestStore itself advanced to the expected state before the short timeout. */
    storeConfirmed: boolean;
}

export class QuestActionError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = "QuestActionError";
    }
}

function actionKey(kind: QuestActionKind, questId: string): string {
    return `${kind}:${questId}`;
}

function currentQuest(questId: string): any | null {
    try {
        // Manual mutations must be based on Discord's current store state. Falling back to the
        // card snapshot here can submit an action after the Quest changed or disappeared.
        return QuestsStore?.getQuest?.(questId) ?? null;
    } catch {
        return null;
    }
}

function sealedMetadata(rawQuest: any) {
    return {
        metadata_sealed: rawQuest?.metadataSealed ?? rawQuest?.metadata_sealed ?? null,
        traffic_metadata_sealed: rawQuest?.trafficMetadataSealed ?? rawQuest?.traffic_metadata_sealed ?? null
    };
}

function asTime(value: unknown): number | null {
    if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
}

function ensureEnrollmentStillEligible(rawQuest: any): void {
    if (rawQuest?.preview === true) throw new QuestActionError("This Quest is only a preview and cannot be accepted yet.");

    const now = Date.now();
    const startsAt = asTime(rawQuest?.config?.startsAt);
    const expiresAt = asTime(rawQuest?.config?.expiresAt);
    if (startsAt != null && startsAt > now) throw new QuestActionError("This Quest has not started yet.");
    if (expiresAt != null && expiresAt <= now) throw new QuestActionError("This Quest has expired.");
}

function ensureRewardStillClaimable(rawQuest: any): void {
    const rewardsExpireAt = asTime(rawQuest?.config?.rewardsConfig?.rewardsExpireAt);
    if (rewardsExpireAt != null && rewardsExpireAt <= Date.now()) {
        throw new QuestActionError("This Quest reward has expired.");
    }
}

function enrollmentBlockMessage(): string | null {
    let raw: unknown;
    try {
        raw = QuestsStore?.questEnrollmentBlockedUntil;
    } catch {
        throw new QuestActionError("Discord Quest enrollment state is unavailable. Open Quest Home and try again.");
    }
    if (!raw) return null;

    const blockedUntil = raw instanceof Date ? raw : new Date(raw as string | number);
    if (!Number.isFinite(blockedUntil.getTime()) || blockedUntil.getTime() <= Date.now()) return null;

    return `Discord has blocked Quest enrollment until ${blockedUntil.toLocaleString()}.`;
}

function apiErrorMessage(error: any, fallback: string): string {
    if (isQuestVerificationError(error)) {
        return "Discord verification was required or cancelled. Open Quest Home if you still need to complete the action.";
    }

    const message = error?.body?.message ?? error?.response?.body?.message ?? error?.message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 240);
    return fallback;
}

async function waitForStoreState(questId: string, predicate: (rawQuest: any) => boolean): Promise<boolean> {
    const store = QuestsStore;
    const read = () => {
        try { return store?.getQuest?.(questId); }
        catch { return null; }
    };

    if (predicate(read())) return true;
    if (typeof store?.addChangeListener !== "function" || typeof store?.removeChangeListener !== "function") return false;

    return await new Promise<boolean>(resolve => {
        let finished = false;
        let listenerAttached = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const finish = (confirmed: boolean) => {
            if (finished) return;
            finished = true;
            if (timer !== undefined) clearTimeout(timer);
            if (listenerAttached) {
                try { store.removeChangeListener(check); } catch { }
            }
            resolve(confirmed);
        };
        const check = () => {
            if (predicate(read())) finish(true);
        };

        timer = setTimeout(() => finish(false), STORE_CONFIRM_TIMEOUT_MS);
        try {
            store.addChangeListener(check);
            listenerAttached = true;
        } catch {
            finish(false);
            return;
        }
        check();
    });
}

function beginAction(kind: QuestActionKind, questId: string): string {
    const key = actionKey(kind, questId);
    if (guardedActions.has(key)) {
        throw new QuestActionError("Discord is still processing the previous action for this Quest. Please wait a moment.");
    }
    guardedActions.add(key);
    return key;
}

function releaseAction(key: string): void {
    guardedActions.delete(key);
}

function holdActionUntilStoreAdvances(key: string, questId: string, predicate: (rawQuest: any) => boolean): void {
    const store = QuestsStore;
    let finished = false;
    let listenerAttached = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
        if (finished) return;
        finished = true;
        releaseAction(key);
        if (timer !== undefined) clearTimeout(timer);
        if (listenerAttached) {
            try { store?.removeChangeListener?.(check); } catch { }
        }
    };
    const check = () => {
        let rawQuest: any = null;
        try { rawQuest = store?.getQuest?.(questId); } catch { }
        if (predicate(rawQuest)) finish();
    };

    timer = setTimeout(finish, SUBMITTED_ACTION_HOLD_MS);
    try {
        if (typeof store?.addChangeListener === "function" && typeof store?.removeChangeListener === "function") {
            store.addChangeListener(check);
            listenerAttached = true;
        }
    } catch { }
    check();
}

export async function enrollQuest(quest: NormalizedQuest): Promise<QuestActionResult> {
    const rawQuest = currentQuest(quest.id);
    if (!rawQuest?.id) throw new QuestActionError("Current Quest data is unavailable. Open Quest Home and try again.");
    if (String(rawQuest.id) !== String(quest.id)) throw new QuestActionError("Quest state changed unexpectedly. Open Quest Home and try again.");
    if (rawQuest.userStatus?.enrolledAt) throw new QuestActionError("This Quest is already accepted.");
    if (rawQuest.userStatus?.completedAt || rawQuest.userStatus?.claimedAt) {
        throw new QuestActionError("This Quest no longer needs to be accepted.");
    }

    ensureEnrollmentStillEligible(rawQuest);

    const blockMessage = enrollmentBlockMessage();
    if (blockMessage) throw new QuestActionError(blockMessage);

    const guardKey = beginAction("enroll", quest.id);
    try {
        // Discord has a native enrollment flow, but its callable signature is not stable/public
        // enough to invoke safely here. Use the same client RestAPI endpoint and fail closed on
        // challenge/error responses instead of guessing a private action-creator signature.
        await RestAPI.post({
            url: `/quests/${rawQuest.id}/enroll`,
            body: {
                location: QUEST_HOME_DESKTOP_LOCATION,
                is_targeted: false,
                ...sealedMetadata(rawQuest)
            }
        });
    } catch (error) {
        releaseAction(guardKey);
        throw new QuestActionError(apiErrorMessage(error, "Discord rejected the Quest enrollment request."), error);
    }

    const predicate = (current: any) => Boolean(current?.userStatus?.enrolledAt);
    const storeConfirmed = await waitForStoreState(rawQuest.id, predicate);
    if (storeConfirmed) releaseAction(guardKey);
    else holdActionUntilStoreAdvances(guardKey, rawQuest.id, predicate);
    return { storeConfirmed };
}

export async function claimQuestReward(quest: NormalizedQuest): Promise<QuestActionResult> {
    const rawQuest = currentQuest(quest.id);
    if (!rawQuest?.id) throw new QuestActionError("Current Quest data is unavailable. Open Quest Home and try again.");
    if (String(rawQuest.id) !== String(quest.id)) throw new QuestActionError("Quest state changed unexpectedly. Open Quest Home and try again.");
    if (rawQuest.userStatus?.claimedAt) throw new QuestActionError("This Quest reward is already claimed.");
    if (!rawQuest.userStatus?.completedAt) throw new QuestActionError("This Quest is not ready to claim yet.");

    ensureRewardStillClaimable(rawQuest);

    const claimTarget = selectClaimTarget(rawQuest?.config?.rewardsConfig);
    if (!claimTarget) {
        throw new QuestActionError("Discord returned an ambiguous or unknown reward configuration. Open Quest Home to claim this reward safely.");
    }

    const guardKey = beginAction("claim", quest.id);
    let response: unknown;
    try {
        response = await nativeClaimQuestReward(rawQuest.id, claimTarget.platform, claimTarget.location);
    } catch (error) {
        releaseAction(guardKey);
        throw new QuestActionError(apiErrorMessage(error, "Discord rejected the reward claim request."), error);
    }

    const assessment = assessClaimResponse(response);
    const predicate = (current: any) => Boolean(current?.userStatus?.claimedAt);
    const storeConfirmed = await waitForStoreState(rawQuest.id, predicate);

    if (storeConfirmed) {
        releaseAction(guardKey);
        return { storeConfirmed: true };
    }

    if (assessment === "reward-errors") {
        releaseAction(guardKey);
        throw new QuestActionError("Discord returned reward errors and the claim was not confirmed. Open Quest Home for details.");
    }

    if (assessment === "invalid") {
        // The response shape is uncertain, so keep the short guard while Discord catches up.
        // This avoids turning an unknown-but-possibly-accepted response into an immediate retry.
        holdActionUntilStoreAdvances(guardKey, rawQuest.id, predicate);
        throw new QuestActionError("Discord did not return a recognizable claim result. Open Quest Home to verify the reward state.");
    }

    holdActionUntilStoreAdvances(guardKey, rawQuest.id, predicate);
    return { storeConfirmed: false };
}
