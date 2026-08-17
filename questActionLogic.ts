export type ClaimTarget = {
    platform: number;
    location: 11 | 25;
};

export type ClaimResponseAssessment = "success" | "pending" | "reward-errors" | "invalid";

type RewardModalKind = "reward-code" | "in-game" | "collectible" | "virtual-currency" | "fractional-premium";

const CROSS_PLATFORM = 0;
const REWARD_CODE_LOCATION = 25;
const QUEST_HOME_DESKTOP_LOCATION = 11;

const REWARD_CODE = 1;
const IN_GAME_REWARD = 2;
const COLLECTIBLE_REWARD = 3;
const VIRTUAL_CURRENCY_REWARD = 4;
const FRACTIONAL_PREMIUM_REWARD = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) return false;
    try {
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    } catch {
        return false;
    }
}

function asStatus(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
    return null;
}

function responseStatus(value: unknown): number | null {
    if (!isRecord(value)) return null;
    const direct = asStatus(value.status) ?? asStatus(value.statusCode);
    if (direct != null) return direct;
    if (!isRecord(value.response)) return null;
    return asStatus(value.response.status) ?? asStatus(value.response.statusCode);
}

function responseBody(value: unknown): Record<string, unknown> | null {
    if (!isRecord(value)) return null;
    if (isPlainRecord(value.body)) return value.body;
    if (isRecord(value.response)) {
        if (isPlainRecord(value.response.body)) return value.response.body;
        if (isPlainRecord(value.response.data)) return value.response.data;
    }
    return isPlainRecord(value) ? value : null;
}

function hasTimestamp(value: unknown): boolean {
    if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return false;
    return Number.isFinite(new Date(value).getTime());
}

function hasClaimedTimestamp(body: Record<string, unknown>): boolean {
    if (hasTimestamp(body.claimed_at) || hasTimestamp(body.claimedAt)) return true;
    for (const key of ["user_status", "userStatus", "quest_user_status", "questUserStatus"] as const) {
        const nested = body[key];
        if (isPlainRecord(nested) && (hasTimestamp(nested.claimed_at) || hasTimestamp(nested.claimedAt))) return true;
    }
    return false;
}

function rewardModalKind(rewards: unknown): RewardModalKind | null {
    // Discord's reward-code path also covers older quests where rewardsConfig.rewards is absent.
    if (rewards == null) return "reward-code";
    if (!Array.isArray(rewards)) return null;

    const types: number[] = [];
    for (const reward of rewards) {
        if (!isPlainRecord(reward)) return null;
        const type = reward.type;
        if (typeof type !== "number" || !Number.isInteger(type) || type < REWARD_CODE || type > FRACTIONAL_PREMIUM_REWARD) {
            return null;
        }
        types.push(type);
    }

    // Match Discord's current reward-modal precedence. Only the in-game modal consumes
    // the server-configured platform; every other reward modal claims cross-platform.
    if (types.includes(FRACTIONAL_PREMIUM_REWARD)) return "fractional-premium";
    if (types.includes(COLLECTIBLE_REWARD)) return "collectible";
    if (types.includes(IN_GAME_REWARD)) return "in-game";
    if (types.includes(VIRTUAL_CURRENCY_REWARD)) return "virtual-currency";
    return "reward-code";
}

/** Resolve the arguments Discord's native Quest claim action expects. Null means fail closed. */
export function selectClaimTarget(rewardsConfig: unknown): ClaimTarget | null {
    const config = rewardsConfig == null ? {} : rewardsConfig;
    if (!isRecord(config)) return null;

    const kind = rewardModalKind(config.rewards);
    if (kind == null) return null;

    const rawPlatforms = config.platforms == null ? [] : config.platforms;
    if (!Array.isArray(rawPlatforms) || rawPlatforms.some(platform => (
        typeof platform !== "number"
        || !Number.isInteger(platform)
        || platform < 0
        || platform > 4
    ))) return null;

    let platform = CROSS_PLATFORM;
    if (kind === "in-game") {
        // In-game rewards are the only current modal that consumes a configured platform.
        // A missing or multi-platform list requires Discord's own chooser; taking the first
        // entry would silently claim a platform the user did not select.
        if (rawPlatforms.length !== 1) return null;
        platform = rawPlatforms[0];
    }

    return {
        platform,
        location: kind === "reward-code" ? REWARD_CODE_LOCATION : QUEST_HOME_DESKTOP_LOCATION
    };
}

/** Classify a resolved native claim response without assuming that every resolved value is final. */
export function assessClaimResponse(response: unknown): ClaimResponseAssessment {
    const status = responseStatus(response);
    if (status != null && (status < 200 || status >= 300)) return "invalid";

    const body = responseBody(response);
    if (!body) return "invalid";
    if (Array.isArray(body.errors) && body.errors.length > 0) return "reward-errors";
    if (hasClaimedTimestamp(body)) return "success";
    if (Array.isArray(body.errors)) return "pending";
    return "invalid";
}

export function isQuestVerificationError(error: unknown): boolean {
    if (error instanceof Error && error.name === "CaptchaCancelError") return true;
    if (!isRecord(error)) return false;

    const body = responseBody(error);
    if (body && ("captcha_key" in body || "captcha_sitekey" in body || "captcha_service" in body)) return true;

    const fields = isPlainRecord(error.captchaFields)
        ? error.captchaFields
        : isPlainRecord(error.fields)
            ? error.fields
            : null;
    return Boolean(fields && ("captcha_key" in fields || "captcha_sitekey" in fields));
}
