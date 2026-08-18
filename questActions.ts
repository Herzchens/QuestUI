import { findByCodeLazy } from "@webpack";
import { UserStore } from "@webpack/common";

import {
    assessClaimResponse,
    assessEnrollResponse,
    isQuestVerificationError,
    selectClaimTarget
} from "./questActionLogic";
import {
    attachChangeListenerSafely,
    classifyOptionalTimestamp,
    questAccessSuspensionState,
    storeWaitTimeoutResult
} from "./questActionRuntimeLogic";
import type { NormalizedQuest } from "./questData";
import { QuestsStore } from "./stores";

const QUEST_HOME_DESKTOP_LOCATION = 11;
const STORE_CONFIRM_TIMEOUT_MS = 5000;
const SUBMITTED_ACTION_HOLD_MS = 15000;

type NativeEnrollQuest = (questId: string, context: { questContent: number; }) => Promise<unknown>;
type NativeClaimQuestReward = (questId: string, platform: number, location: number) => Promise<unknown>;
type QuestActionKind = "enroll" | "claim";
type StoreWaitResult = "confirmed" | "timeout" | "unavailable" | "account-changed";

const nativeEnrollQuest = findByCodeLazy(
    "QUESTS_ENROLL_BEGIN",
    "QUESTS_ENROLL_SUCCESS",
    "QUESTS_ENROLL_FAILURE",
    "previous_in_flight_request"
) as NativeEnrollQuest;

const nativeClaimQuestReward = findByCodeLazy(
    "QUESTS_CLAIM_REWARD_BEGIN",
    "QUESTS_CLAIM_REWARD_SUCCESS",
    "QUESTS_CLAIM_REWARD_FAILURE",
    "traffic_metadata_sealed"
) as NativeClaimQuestReward;

const inFlightActions = new Set<string>();
const submittedActions = new Set<string>();

export interface QuestActionResult {
    storeConfirmed: boolean;
    resubmitAfterMs: number | null;
}

export class QuestActionError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown,
        public readonly resubmitAfterMs: number | null = null
    ) {
        super(message);
        this.name = "QuestActionError";
    }
}

function currentUserId(): string | null {
    try {
        const id = UserStore?.getCurrentUser?.()?.id;
        return typeof id === "string" && id.length > 0 ? id : null;
    } catch {
        return null;
    }
}

function requireCurrentUserId(): string {
    const id = currentUserId();
    if (!id) throw new QuestActionError("Discord account state is unavailable. Open Quest Home and try again.");
    return id;
}

function actionKey(kind: QuestActionKind, userId: string, questId: string): string {
    return `${kind}:${userId}:${questId}`;
}

function beginAction(kind: QuestActionKind, userId: string, questId: string): string {
    const key = actionKey(kind, userId, questId);
    if (inFlightActions.has(key)) throw new QuestActionError("This Quest action is already in progress.");
    if (submittedActions.has(key)) {
        throw new QuestActionError("Discord is still refreshing this Quest after the previous action. Please wait a moment.");
    }
    inFlightActions.add(key);
    return key;
}

function currentQuest(questId: string): any | null {
    try {
        return QuestsStore?.getQuest?.(questId) ?? null;
    } catch {
        return null;
    }
}

function ensureCurrentQuestShape(rawQuest: any): void {
    if (!rawQuest?.id || !rawQuest.config || typeof rawQuest.config !== "object" || Array.isArray(rawQuest.config)) {
        throw new QuestActionError("Current Quest data is incomplete. Open Quest Home and try again.");
    }
}

function requireReadableOptionalTimestamp(value: unknown, label: string) {
    const parsed = classifyOptionalTimestamp(value);
    if (parsed.kind === "invalid") {
        throw new QuestActionError(`Discord returned an unreadable ${label}. Open Quest Home and try again.`);
    }
    return parsed;
}

function ensureQuestAccessAvailable(): void {
    let isSuspended: unknown;
    let suspendedUntil: unknown;
    try {
        isSuspended = QuestsStore?.isQuestAccessSuspended;
        suspendedUntil = QuestsStore?.questAccessSuspendedUntil;
    } catch {
        throw new QuestActionError("Discord Quest access state is unavailable. Open Quest Home and try again.");
    }

    const state = questAccessSuspensionState(isSuspended, suspendedUntil);
    if (state === "clear") return;
    if (state === "invalid") {
        throw new QuestActionError("Discord returned an unreadable Quest access-suspension state. Open Quest Home and try again.");
    }

    const parsed = classifyOptionalTimestamp(suspendedUntil);
    if (parsed.kind === "valid" && parsed.time > Date.now()) {
        throw new QuestActionError(`Discord has suspended Quest access until ${new Date(parsed.time).toLocaleString()}.`);
    }
    throw new QuestActionError("Discord has suspended Quest access on this account. Open Quest Home for the current account state.");
}

function ensureEnrollmentStillEligible(rawQuest: any): void {
    if (rawQuest.preview === true) throw new QuestActionError("This Quest is only a preview and cannot be accepted yet.");

    const now = Date.now();
    const startsAt = requireReadableOptionalTimestamp(rawQuest.config.startsAt, "Quest start time");
    const expiresAt = requireReadableOptionalTimestamp(rawQuest.config.expiresAt, "Quest expiry time");
    if (startsAt.kind === "valid" && startsAt.time > now) throw new QuestActionError("This Quest has not started yet.");
    if (expiresAt.kind === "valid" && expiresAt.time <= now) throw new QuestActionError("This Quest has expired.");
}

function ensureRewardStillClaimable(rawQuest: any): void {
    const rewardsExpireAt = requireReadableOptionalTimestamp(
        rawQuest.config?.rewardsConfig?.rewardsExpireAt,
        "Quest reward expiry time"
    );
    if (rewardsExpireAt.kind === "valid" && rewardsExpireAt.time <= Date.now()) {
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

    const blockedUntil = classifyOptionalTimestamp(raw);
    if (blockedUntil.kind === "missing") return null;
    if (blockedUntil.kind === "invalid") {
        throw new QuestActionError("Discord returned an unreadable Quest enrollment block state. Open Quest Home and try again.");
    }
    if (blockedUntil.time <= Date.now()) return null;
    return `Discord has blocked Quest enrollment until ${new Date(blockedUntil.time).toLocaleString()}.`;
}

function apiErrorMessage(error: any, fallback: string): string {
    if (isQuestVerificationError(error)) {
        return "Discord verification was required or cancelled. Open Quest Home if you still need to complete the action.";
    }

    const message = error?.body?.message ?? error?.response?.body?.message ?? error?.message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 240);
    return fallback;
}

async function waitForStoreState(
    questId: string,
    expectedUserId: string,
    predicate: (rawQuest: any) => boolean
): Promise<StoreWaitResult> {
    const store = QuestsStore;
    const sameAccount = () => currentUserId() === expectedUserId;
    const read = () => {
        if (!sameAccount()) return null;
        try { return store?.getQuest?.(questId); }
        catch { return null; }
    };

    if (!sameAccount()) return "account-changed";
    if (predicate(read())) return "confirmed";
    if (typeof store?.addChangeListener !== "function" || typeof store?.removeChangeListener !== "function") return "unavailable";

    return await new Promise<StoreWaitResult>(resolve => {
        let finished = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let detach = () => { };

        const finish = (result: StoreWaitResult) => {
            if (finished) return;
            finished = true;
            if (timer !== undefined) clearTimeout(timer);
            detach();
            resolve(result);
        };
        const check = () => {
            if (!sameAccount()) {
                finish("account-changed");
                return;
            }
            if (predicate(read())) finish("confirmed");
        };

        timer = setTimeout(
            () => finish(storeWaitTimeoutResult(expectedUserId, currentUserId())),
            STORE_CONFIRM_TIMEOUT_MS
        );
        try {
            detach = attachChangeListenerSafely(store, check, () => finished);
        } catch {
            finish("unavailable");
            return;
        }
        check();
    });
}

function holdSubmittedAction(
    kind: QuestActionKind,
    userId: string,
    questId: string,
    predicate: (rawQuest: any) => boolean
): void {
    const key = actionKey(kind, userId, questId);
    submittedActions.add(key);

    const store = QuestsStore;
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let detach = () => { };

    const finish = () => {
        if (finished) return;
        finished = true;
        submittedActions.delete(key);
        if (timer !== undefined) clearTimeout(timer);
        detach();
    };
    const check = () => {
        if (currentUserId() !== userId) return;
        let rawQuest: any = null;
        try { rawQuest = store?.getQuest?.(questId); } catch { }
        if (predicate(rawQuest)) finish();
    };

    timer = setTimeout(finish, SUBMITTED_ACTION_HOLD_MS);
    try {
        if (typeof store?.addChangeListener === "function" && typeof store?.removeChangeListener === "function") {
            detach = attachChangeListenerSafely(store, check, () => finished);
        }
    } catch { }
    check();
}

function holdAfterPossiblySubmittedFailure(
    kind: QuestActionKind,
    userId: string,
    questId: string,
    predicate: (rawQuest: any) => boolean,
    message: string,
    cause?: unknown
): QuestActionError {
    holdSubmittedAction(kind, userId, questId, predicate);
    return new QuestActionError(message, cause, SUBMITTED_ACTION_HOLD_MS);
}

function actionThrownError(
    kind: QuestActionKind,
    userId: string,
    questId: string,
    predicate: (rawQuest: any) => boolean,
    error: unknown,
    fallback: string
): QuestActionError {
    const message = apiErrorMessage(error, fallback);
    // A recognized verification/captcha cancellation is an explicit failure state, not an
    // ambiguous transport outcome. Do not display "Sent" or hold a duplicate guard for it.
    if (isQuestVerificationError(error)) return new QuestActionError(message, error);
    return holdAfterPossiblySubmittedFailure(kind, userId, questId, predicate, message, error);
}

function accountChangedError(
    kind: QuestActionKind,
    userId: string,
    questId: string,
    predicate: (rawQuest: any) => boolean
): QuestActionError {
    return holdAfterPossiblySubmittedFailure(
        kind,
        userId,
        questId,
        predicate,
        `Discord account changed while the Quest ${kind === "enroll" ? "enrollment" : "claim"} was in progress. Open Quest Home to verify the result.`
    );
}

function uncertainEnrollError(
    assessment: "in-flight" | "failure" | "invalid",
    userId: string,
    questId: string,
    predicate: (rawQuest: any) => boolean
): QuestActionError {
    const message = assessment === "in-flight"
        ? "Discord is already processing an enrollment for this Quest. Please wait for Quest state to refresh."
        : assessment === "failure"
            ? "Discord could not confirm the Quest enrollment. Open Quest Home to verify the result."
            : "Discord returned an unrecognized enrollment result. Open Quest Home to verify the Quest state.";
    return holdAfterPossiblySubmittedFailure("enroll", userId, questId, predicate, message);
}

export async function enrollQuest(quest: NormalizedQuest): Promise<QuestActionResult> {
    const userId = requireCurrentUserId();
    const key = beginAction("enroll", userId, quest.id);

    try {
        const rawQuest = currentQuest(quest.id);
        ensureCurrentQuestShape(rawQuest);
        if (String(rawQuest.id) !== String(quest.id)) throw new QuestActionError("Quest state changed unexpectedly. Open Quest Home and try again.");
        ensureQuestAccessAvailable();
        if (rawQuest.userStatus?.enrolledAt) throw new QuestActionError("This Quest is already accepted.");
        if (rawQuest.userStatus?.completedAt || rawQuest.userStatus?.claimedAt) {
            throw new QuestActionError("This Quest no longer needs to be accepted.");
        }

        ensureEnrollmentStillEligible(rawQuest);
        const blockMessage = enrollmentBlockMessage();
        if (blockMessage) throw new QuestActionError(blockMessage);

        const predicate = (current: any) => Boolean(current?.userStatus?.enrolledAt);
        let response: unknown;
        try {
            response = await nativeEnrollQuest(rawQuest.id, { questContent: QUEST_HOME_DESKTOP_LOCATION });
        } catch (error) {
            throw actionThrownError(
                "enroll",
                userId,
                rawQuest.id,
                predicate,
                error,
                "Discord's native Quest enrollment action failed unexpectedly."
            );
        }

        const assessment = assessEnrollResponse(response);
        if (assessment === "verification") {
            throw new QuestActionError("Discord verification was required or cancelled. Open Quest Home if you still need to accept the Quest.");
        }

        const storeResult = await waitForStoreState(rawQuest.id, userId, predicate);
        if (storeResult === "account-changed") {
            throw accountChangedError("enroll", userId, rawQuest.id, predicate);
        }
        if (storeResult === "confirmed") return { storeConfirmed: true, resubmitAfterMs: null };

        if (assessment !== "success") throw uncertainEnrollError(assessment, userId, rawQuest.id, predicate);

        holdSubmittedAction("enroll", userId, rawQuest.id, predicate);
        return { storeConfirmed: false, resubmitAfterMs: SUBMITTED_ACTION_HOLD_MS };
    } finally {
        inFlightActions.delete(key);
    }
}

export async function claimQuestReward(quest: NormalizedQuest): Promise<QuestActionResult> {
    const userId = requireCurrentUserId();
    const key = beginAction("claim", userId, quest.id);

    try {
        const rawQuest = currentQuest(quest.id);
        ensureCurrentQuestShape(rawQuest);
        if (String(rawQuest.id) !== String(quest.id)) throw new QuestActionError("Quest state changed unexpectedly. Open Quest Home and try again.");
        ensureQuestAccessAvailable();
        if (rawQuest.userStatus?.claimedAt) throw new QuestActionError("This Quest reward is already claimed.");
        if (!rawQuest.userStatus?.completedAt) throw new QuestActionError("This Quest is not ready to claim yet.");

        ensureRewardStillClaimable(rawQuest);
        const claimTarget = selectClaimTarget(rawQuest.config.rewardsConfig);
        if (!claimTarget) {
            throw new QuestActionError("Discord returned an ambiguous or unknown reward configuration. Open Quest Home to claim this reward safely.");
        }

        const predicate = (current: any) => Boolean(current?.userStatus?.claimedAt);
        let response: unknown;
        try {
            response = await nativeClaimQuestReward(rawQuest.id, claimTarget.platform, claimTarget.location);
        } catch (error) {
            throw actionThrownError(
                "claim",
                userId,
                rawQuest.id,
                predicate,
                error,
                "Discord rejected the reward claim request."
            );
        }

        const assessment = assessClaimResponse(response);
        const storeResult = await waitForStoreState(rawQuest.id, userId, predicate);
        if (storeResult === "account-changed") {
            throw accountChangedError("claim", userId, rawQuest.id, predicate);
        }
        if (storeResult === "confirmed") return { storeConfirmed: true, resubmitAfterMs: null };

        if (assessment === "reward-errors") {
            throw new QuestActionError("Discord returned reward errors and the claim was not confirmed. Open Quest Home for details.");
        }

        holdSubmittedAction("claim", userId, rawQuest.id, predicate);
        if (assessment === "invalid") {
            throw new QuestActionError(
                "Discord did not return a recognizable claim result. Open Quest Home to verify the reward state.",
                undefined,
                SUBMITTED_ACTION_HOLD_MS
            );
        }

        return { storeConfirmed: false, resubmitAfterMs: SUBMITTED_ACTION_HOLD_MS };
    } finally {
        inFlightActions.delete(key);
    }
}
