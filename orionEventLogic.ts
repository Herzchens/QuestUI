import type { EventLogCategory, EventLogSeverity } from "./eventLogTypes";

export type OrionCompanionEventLevel = "debug" | "info" | "success" | "warning" | "error";
export type OrionCompanionEventCategory =
    | "startup"
    | "system"
    | "cycle"
    | "quest"
    | "enroll"
    | "task"
    | "claim"
    | "network"
    | "achievement"
    | "bypass"
    | "patcher";

export interface OrionCompanionEventFailure {
    terminal: boolean;
    retryable: boolean;
    attempt: number | null;
    maxAttempts: number | null;
    httpStatus: number | null;
    upstreamCode: string | number | null;
    reason: string | null;
}

export interface OrionCompanionEvent {
    timestamp: number;
    code: string;
    category: OrionCompanionEventCategory;
    level: OrionCompanionEventLevel;
    message: string;
    questId?: string;
    questName?: string;
    taskType?: string;
    reason?: string;
    failure?: OrionCompanionEventFailure;
}

export interface NormalizedOrionEvent {
    timestamp: number;
    eventCode: string;
    severity: EventLogSeverity;
    category: EventLogCategory;
    summary: string;
    quest: { id?: string | null; name?: string | null; taskType?: string | null; } | null;
    detail: Record<string, unknown>;
    orionCategory: OrionCompanionEventCategory;
}

export interface OrionConsoleShadowCandidate {
    id: number;
    capturedAt: number;
    eventCode: string;
    severity: EventLogSeverity;
    category: EventLogCategory;
    questName?: string | null;
    rawConsole: string;
}

const LEVELS = new Set<OrionCompanionEventLevel>(["debug", "info", "success", "warning", "error"]);
const CATEGORIES = new Set<OrionCompanionEventCategory>([
    "startup", "system", "cycle", "quest", "enroll", "task", "claim", "network", "achievement", "bypass", "patcher"
]);
const CODE_RE = /^[a-z][a-z0-9_.-]{1,119}$/;

const STRUCTURED_TO_CONSOLE_CODES: Readonly<Record<string, readonly string[]>> = Object.freeze({
    "engine.started": ["ORION_ENGINE_STARTED"],
    "engine.stopped": ["ORION_ENGINE_STOPPED"],
    "quest.blocked": ["ORION_QUEST_BLOCKED"],
    "enroll.waiting": ["ORION_ENROLL_WAITING"],
    "enroll.started": ["ORION_ENROLL_STARTED"],
    "claim.succeeded": ["ORION_CLAIM_SUCCEEDED"],
    "claim.action_required": ["ORION_CLAIM_CAPTCHA_REQUIRED"],
    "claim.failed": ["ORION_CLAIM_FAILED"],
    "task.started": ["ORION_TASK_STARTED"],
    "task.completed": ["ORION_TASK_COMPLETED"],
    "network.retry": ["ORION_NETWORK_RETRY"],
    "heartbeat.failure": ["ORION_HEARTBEAT_FAILURE"],
    "heartbeat.give_up": ["ORION_HEARTBEAT_TIMEOUT"],
    "achievement.fallback": ["ORION_ACHIEVEMENT_FALLBACK"],
    "bypass.started": ["ORION_BYPASS_EVENT"],
    "bypass.succeeded": ["ORION_BYPASS_EVENT"],
    "bypass.failed": ["ORION_BYPASS_EVENT", "ORION_BYPASS_FALLBACK"],
    "startup.quest_list_waiting": ["ORION_STARTUP_WAITING"],
    "cycle.started": ["ORION_CYCLE_STARTED"],
    "cycle.processing": ["ORION_CYCLE_PROCESSING"],
    "system.account_changed": ["ORION_ACCOUNT_CHANGED"],
    "system.quest_access_suspended": ["ORION_QUEST_ACCESS_SUSPENDED"],
    "patcher.presence_restored": ["ORION_PATCHER_RESTORED"],
    "patcher.presence_restore_failed": ["ORION_PATCHER_WARNING"]
});

const CATEGORY_TO_TAG: Readonly<Record<OrionCompanionEventCategory, string>> = Object.freeze({
    startup: "Startup",
    system: "System",
    cycle: "Cycle",
    quest: "Quest",
    enroll: "Enroll",
    task: "Task",
    claim: "Claim",
    network: "Network",
    achievement: "Achievement",
    bypass: "Bypass",
    patcher: "Patcher"
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, maxLength: number): string | undefined {
    if (value == null) return undefined;
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function nullablePositiveInteger(value: unknown): number | null {
    if (value == null) return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const normalized = Math.floor(number);
    return normalized > 0 ? normalized : null;
}

function nullableHttpStatus(value: unknown): number | null {
    const normalized = nullablePositiveInteger(value);
    return normalized != null && normalized >= 100 && normalized <= 599 ? normalized : null;
}

function normalizedFailure(value: unknown): OrionCompanionEventFailure | null {
    if (!isRecord(value) || typeof value.terminal !== "boolean" || typeof value.retryable !== "boolean") return null;
    const attempt = nullablePositiveInteger(value.attempt);
    let maxAttempts = nullablePositiveInteger(value.maxAttempts);
    if (attempt != null && maxAttempts != null && maxAttempts < attempt) maxAttempts = null;

    const upstreamCode = typeof value.upstreamCode === "string"
        ? value.upstreamCode.slice(0, 160)
        : typeof value.upstreamCode === "number" && Number.isFinite(value.upstreamCode)
            ? value.upstreamCode
            : null;

    return {
        terminal: value.terminal,
        retryable: value.retryable,
        attempt,
        maxAttempts,
        httpStatus: nullableHttpStatus(value.httpStatus),
        upstreamCode,
        reason: optionalString(value.reason, 32 * 1024) ?? null
    };
}

function mapSeverity(level: OrionCompanionEventLevel): EventLogSeverity {
    if (level === "success") return "success";
    if (level === "warning") return "warning";
    if (level === "error") return "error";
    return "info";
}

export function mapOrionCategory(category: OrionCompanionEventCategory): EventLogCategory {
    if (category === "network") return "network";
    if (category === "bypass") return "diagnostic";
    if (category === "quest" || category === "enroll" || category === "task" || category === "claim" || category === "achievement") {
        return "quest";
    }
    return "runtime";
}

function humanizeCode(code: string): string {
    const words = code.replace(/[._-]+/g, " ").trim();
    if (!words) return "Orion event";
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Validate the optional Orion structured-event capability at QuestUI's boundary.
 * The human `message` is preserved only as detail; code/category/level/failure fields own meaning.
 */
export function normalizeOrionCompanionEvent(value: unknown, now = Date.now()): NormalizedOrionEvent | null {
    if (!isRecord(value)) return null;
    if (typeof value.code !== "string" || !CODE_RE.test(value.code)) return null;
    if (typeof value.category !== "string" || !CATEGORIES.has(value.category as OrionCompanionEventCategory)) return null;
    if (typeof value.level !== "string" || !LEVELS.has(value.level as OrionCompanionEventLevel)) return null;
    if (typeof value.message !== "string") return null;

    const rawTimestamp = Number(value.timestamp);
    const timestamp = Number.isFinite(rawTimestamp) && rawTimestamp > 0 ? rawTimestamp : now;
    const category = value.category as OrionCompanionEventCategory;
    const level = value.level as OrionCompanionEventLevel;

    let failure: OrionCompanionEventFailure | undefined;
    if (value.failure != null) {
        const parsed = normalizedFailure(value.failure);
        if (!parsed) return null;
        failure = parsed;
    }

    const reason = optionalString(value.reason, 32 * 1024);
    const questId = optionalString(value.questId, 120);
    const questName = optionalString(value.questName, 240);
    const taskType = optionalString(value.taskType, 120);
    const detail: Record<string, unknown> = {
        message: value.message,
        orionCategory: category
    };
    if (reason) detail.reason = reason;
    if (failure) {
        detail.terminal = failure.terminal;
        detail.retryable = failure.retryable;
        detail.attempt = failure.attempt;
        detail.maxAttempts = failure.maxAttempts;
        detail.httpStatus = failure.httpStatus;
        detail.upstreamCode = failure.upstreamCode;
        if (failure.reason) detail.reason = failure.reason;
    }

    return {
        timestamp,
        eventCode: value.code,
        severity: mapSeverity(level),
        category: mapOrionCategory(category),
        summary: humanizeCode(value.code),
        quest: questId || questName || taskType ? { id: questId ?? null, name: questName ?? null, taskType: taskType ?? null } : null,
        detail,
        orionCategory: category
    };
}

function sameQuestName(left: string | null | undefined, right: string | null | undefined): boolean | null {
    if (!left || !right) return null;
    return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function rawConsoleTag(text: string): string | null {
    const match = text.match(/\[(Startup|System|Cycle|Quest|Enroll|Task|Claim|Network|Achievement|Bypass|Patcher)\]/i);
    return match?.[1] ?? null;
}

function candidateScore(candidate: OrionConsoleShadowCandidate, event: NormalizedOrionEvent, maxAgeMs: number): number {
    if (Math.abs(candidate.capturedAt - event.timestamp) > maxAgeMs) return -1;

    const questNameMatches = sameQuestName(candidate.questName, event.quest?.name);
    if (questNameMatches === false) return -1;

    let score = 0;
    const exactAliases = STRUCTURED_TO_CONSOLE_CODES[event.eventCode] ?? [];
    if (exactAliases.includes(candidate.eventCode)) score += 8;

    const expectedTag = CATEGORY_TO_TAG[event.orionCategory];
    const candidateTag = rawConsoleTag(candidate.rawConsole);
    if (candidateTag?.toLocaleLowerCase() === expectedTag.toLocaleLowerCase()) score += 4;

    if (questNameMatches === true) score += 4;
    if (candidate.category === event.category) score += 1;
    if (candidate.severity === event.severity) score += 1;

    return score >= 5 ? score : -1;
}

/**
 * Find the console line most likely to be the human-readable twin of a structured event.
 * Exact parser-code aliases win; otherwise canonical Orion tag + identity/context must agree.
 */
export function findOrionConsoleShadowMatch(
    event: NormalizedOrionEvent,
    candidates: readonly OrionConsoleShadowCandidate[],
    maxAgeMs = 250
): OrionConsoleShadowCandidate | null {
    let best: OrionConsoleShadowCandidate | null = null;
    let bestScore = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        const score = candidateScore(candidate, event, maxAgeMs);
        if (score < 0) continue;
        const distance = Math.abs(candidate.capturedAt - event.timestamp);
        if (score > bestScore || (score === bestScore && distance < bestDistance)) {
            best = candidate;
            bestScore = score;
            bestDistance = distance;
        }
    }
    return best;
}
