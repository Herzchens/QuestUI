import type { EventLogCategory, EventLogEvent, EventLogSeverity, EventLogSource } from "./eventLogTypes";

const MAX_DETAIL_LENGTH = 32 * 1024;

const SECRET_PATTERNS: Array<[RegExp, string]> = [
    [/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi, "$1[REDACTED]"],
    [/(access[_-]?token|auth[_-]?token|proxy[_-]?ticket|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]"],
    [/(oauth\s+code|auth\s+code)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]"],
    [/([?&](?:code|token|access_token|ticket)=)[^&#\s]+/gi, "$1[REDACTED]"]
];

const ORION_TAGS = [
    "System",
    "Network",
    "Task",
    "Cycle",
    "Quest",
    "Enroll",
    "Claim",
    "Bypass",
    "Achievement",
    "Startup",
    "Patcher"
] as const;

type OrionTag = typeof ORION_TAGS[number];

export function sanitizeEventText(value: unknown, maxLength = MAX_DETAIL_LENGTH): string {
    let text = typeof value === "string" ? value : String(value ?? "");
    for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement);
    if (text.length > maxLength) text = `${text.slice(0, maxLength)}… [truncated]`;
    return text;
}

function safeConsoleArg(value: unknown): string {
    if (value instanceof Error) {
        return sanitizeEventText(`${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`);
    }
    if (typeof value === "string") return sanitizeEventText(value);
    try {
        return sanitizeEventText(JSON.stringify(value));
    } catch {
        return sanitizeEventText(String(value));
    }
}

export function consoleArgsToText(args: unknown[]): string {
    const parts = args
        .map(safeConsoleArg)
        .filter(part => !/^background:\s|^color:\s|font-weight:|border-radius:/i.test(part));
    return sanitizeEventText(parts.join(" ")
        .replace(/%c/g, "")
        .replace(/\s+/g, " ")
        .trim());
}

export function consoleEventSource(args: unknown[]): EventLogSource | null {
    const text = consoleArgsToText(args);
    if (/\bOrionQuests\b|\[OrionQuests\]/i.test(text)) return "orion";
    if (/\bQuestUI\b|\[QuestUI\]/i.test(text)) return "questui";
    return null;
}

function orionTag(text: string): OrionTag | null {
    const match = text.match(/\[(System|Network|Task|Cycle|Quest|Enroll|Claim|Bypass|Achievement|Startup|Patcher)\]/i);
    if (!match) return null;
    const canonical = ORION_TAGS.find(tag => tag.toLowerCase() === match[1].toLowerCase());
    return canonical ?? null;
}

function fallbackSeverity(level: string): EventLogSeverity {
    if (level === "error" || level === "err") return "error";
    if (level === "warn" || level === "warning") return "warning";
    return "info";
}

function cleanConsoleSummary(source: EventLogSource, text: string): string {
    const pattern = source === "orion" ? /^.*?\bOrionQuests\b\s*/i : /^.*?\bQuestUI\b\s*/i;
    return sanitizeEventText(text).replace(pattern, "").trim().slice(0, 180);
}

function quotedQuestName(text: string): string | null {
    return text.match(/"([^"]+)"/)?.[1]?.trim() || null;
}

function afterColon(text: string): string | null {
    const value = text.match(/:\s*(.+)$/)?.[1]?.trim();
    return value || null;
}

function httpStatus(text: string): number | null {
    const match = text.match(/HTTP\s+(\d{3})/i);
    return match ? Number(match[1]) : null;
}

function failureSeverity(base: EventLogSeverity, text: string): EventLogSeverity {
    if (base === "error") return "error";
    if (/\b(?:giving up|aborted|suspended|fatal)\b/i.test(text)) return "error";
    if (/\b(?:fail(?:ed|ure)?|rejected|retry|unavailable|refus(?:ed|ing)|captcha|required|could not|not confirmed|skipping)\b/i.test(text)) {
        return "warning";
    }
    return base;
}

export interface ClassifiedConsoleEvent {
    severity: EventLogSeverity;
    category: EventLogCategory;
    eventCode: string;
    summary: string;
    questName?: string | null;
    detail: Record<string, unknown>;
}

export function inferEventCategory(
    event: Pick<EventLogEvent, "source" | "eventCode" | "summary" | "category">
): EventLogCategory {
    if (event.category === "quest" || event.category === "runtime" || event.category === "network" || event.category === "diagnostic") {
        return event.category;
    }

    const code = String(event.eventCode ?? "").toUpperCase();
    const summary = String(event.summary ?? "");

    if (/(?:BYPASS|DIAGNOSTIC|EVENT_LOG)/.test(code) || /\[Bypass\]/i.test(summary)) {
        return "diagnostic";
    }
    if (/(?:NETWORK|HEARTBEAT|HTTP)/.test(code) || /\[(?:Network)\]|\bheartbeat\b|\bHTTP\s+\d{3}\b/i.test(summary)) {
        return "network";
    }
    if (/(?:QUEST|TASK|ENROLL|CLAIM|ACHIEVEMENT|VIDEO)/.test(code) || /\[(?:Quest|Task|Enroll|Claim|Achievement)\]/i.test(summary)) {
        return "quest";
    }
    if (/(?:CYCLE|SYSTEM|STARTUP|PATCHER|ENGINE)/.test(code) || /\[(?:Cycle|System|Startup|Patcher)\]/i.test(summary)) {
        return "runtime";
    }

    return event.source === "orion" ? "runtime" : "diagnostic";
}

function classified(input: {
    severity: EventLogSeverity;
    category: EventLogCategory;
    eventCode: string;
    summary: string;
    questName?: string | null;
    text: string;
    status?: number | null;
    reason?: string | null;
}): ClassifiedConsoleEvent {
    const detail: Record<string, unknown> = { rawConsole: input.text };
    if (input.status != null) detail.httpStatus = input.status;
    if (input.reason) detail.reason = input.reason;
    return {
        severity: input.severity,
        category: input.category,
        eventCode: input.eventCode,
        summary: input.summary,
        questName: input.questName ?? null,
        detail
    };
}

export function classifyConsoleEvent(source: EventLogSource, level: string, text: string): ClassifiedConsoleEvent {
    const sanitized = sanitizeEventText(text);
    const baseSeverity = fallbackSeverity(level);
    const summary = cleanConsoleSummary(source, sanitized);
    const status = httpStatus(sanitized);

    if (source === "orion") {
        const tag = orionTag(sanitized);
        const quotedName = quotedQuestName(sanitized);

        if (/\bStarting OrionQuests\b/i.test(sanitized)) {
            return classified({
                severity: "info",
                category: "runtime",
                eventCode: "ORION_ENGINE_STARTED",
                summary: "Orion engine started",
                text: sanitized,
                status
            });
        }

        if (/\bStopped\.\s+(?:All cleanups flushed cleanly\.|\d+ cleanup\(s\) threw, see errors above\.)/i.test(sanitized)) {
            return classified({
                severity: /cleanup\(s\) threw/i.test(sanitized) ? "warning" : "info",
                category: "runtime",
                eventCode: "ORION_ENGINE_STOPPED",
                summary: "Orion engine stopped",
                text: sanitized,
                status
            });
        }

        const aborted = sanitized.match(/\[Task\]\s+Aborted\s+"([^"]+)":\s*(.+)$/i);
        if (aborted) {
            const reason = aborted[2].trim();
            const heartbeat = /heartbeat|no credited beat|watchdog|report(?:ed|ing)? progress/i.test(reason);
            return classified({
                severity: "error",
                category: heartbeat ? "network" : "quest",
                eventCode: heartbeat ? "ORION_HEARTBEAT_TIMEOUT" : "ORION_TASK_ABORTED",
                summary: heartbeat ? "Task aborted · heartbeat timeout" : `Task aborted · ${reason}`,
                questName: aborted[1],
                text: sanitized,
                status,
                reason
            });
        }

        const completed = sanitized.match(/\[Task\]\s+Completed\s+"([^"]+)"!?/i);
        if (completed) {
            return classified({
                severity: "success",
                category: "quest",
                eventCode: "ORION_TASK_COMPLETED",
                summary: "Task completed",
                questName: completed[1],
                text: sanitized,
                status
            });
        }

        const started = sanitized.match(/\[Task\]\s+Started\s+[^:]+:\s*(.+)$/i);
        if (started) {
            return classified({
                severity: "info",
                category: "quest",
                eventCode: "ORION_TASK_STARTED",
                summary: "Task started",
                questName: started[1].trim(),
                text: sanitized,
                status
            });
        }

        if (/\[Task\].*heartbeat.*failed/i.test(sanitized)) {
            const reason = sanitized.match(/failed(?:\s+\d+\s+times in a row)?(?::|\s)\s*(.+?)(?:\. Giving up|$)/i)?.[1]?.trim() ?? null;
            return classified({
                severity: /giving up/i.test(sanitized) ? "error" : "warning",
                category: "network",
                eventCode: /giving up/i.test(sanitized) ? "ORION_HEARTBEAT_TIMEOUT" : "ORION_HEARTBEAT_FAILURE",
                summary: /giving up/i.test(sanitized) ? "Heartbeat failed repeatedly · task stopped" : "Heartbeat request failed",
                questName: quotedName,
                text: sanitized,
                status,
                reason
            });
        }

        if (/\[Task\]\s+Video quest unavailable/i.test(sanitized)) {
            return classified({
                severity: "warning",
                category: "quest",
                eventCode: "ORION_VIDEO_UNAVAILABLE",
                summary: status ? `Video Quest unavailable · HTTP ${status}` : "Video Quest unavailable",
                questName: quotedName,
                text: sanitized,
                status
            });
        }

        if (tag === "Quest") {
            const blocked = /Skipping it for the rest of this run\./i.test(sanitized);
            return classified({
                severity: blocked ? "warning" : failureSeverity(baseSeverity, sanitized),
                category: "quest",
                eventCode: blocked ? "ORION_QUEST_BLOCKED" : "ORION_QUEST_EVENT",
                summary,
                questName: quotedName,
                text: sanitized,
                status
            });
        }

        if (tag === "Network") {
            if (/\bRetry\b/i.test(sanitized)) {
                return classified({
                    severity: "warning",
                    category: "network",
                    eventCode: "ORION_NETWORK_RETRY",
                    summary,
                    text: sanitized,
                    status
                });
            }
            return classified({
                severity: failureSeverity(baseSeverity, sanitized),
                category: "network",
                eventCode: status ? "ORION_NETWORK_HTTP" : "ORION_NETWORK_EVENT",
                summary,
                text: sanitized,
                status
            });
        }

        if (tag === "Enroll") {
            if (/Accepting quest:/i.test(sanitized)) {
                return classified({
                    severity: "info",
                    category: "quest",
                    eventCode: "ORION_ENROLL_STARTED",
                    summary,
                    questName: afterColon(sanitized),
                    text: sanitized,
                    status
                });
            }
            if (/auto-enroll is off|waiting for you to accept/i.test(sanitized)) {
                return classified({
                    severity: "info",
                    category: "quest",
                    eventCode: "ORION_ENROLL_WAITING",
                    summary,
                    questName: quotedName,
                    text: sanitized,
                    status
                });
            }
            if (/unavailable|skipping/i.test(sanitized)) {
                return classified({
                    severity: "warning",
                    category: "quest",
                    eventCode: "ORION_ENROLL_UNAVAILABLE",
                    summary,
                    questName: quotedName,
                    text: sanitized,
                    status
                });
            }
            return classified({
                severity: failureSeverity(baseSeverity, sanitized),
                category: "quest",
                eventCode: "ORION_ENROLL_EVENT",
                summary,
                questName: quotedName,
                text: sanitized,
                status
            });
        }

        if (tag === "Claim") {
            if (/claimed (?:automatically|successfully)|claimed!/i.test(sanitized)) {
                return classified({
                    severity: "success",
                    category: "quest",
                    eventCode: "ORION_CLAIM_SUCCEEDED",
                    summary,
                    questName: quotedName,
                    text: sanitized,
                    status
                });
            }
            if (/captcha required/i.test(sanitized)) {
                return classified({
                    severity: "warning",
                    category: "quest",
                    eventCode: "ORION_CLAIM_CAPTCHA_REQUIRED",
                    summary,
                    questName: quotedName,
                    text: sanitized,
                    status
                });
            }
            if (/failed|wasn't confirmed|not confirmed/i.test(sanitized)) {
                return classified({
                    severity: failureSeverity(baseSeverity, sanitized),
                    category: "quest",
                    eventCode: "ORION_CLAIM_FAILED",
                    summary,
                    questName: quotedName,
                    text: sanitized,
                    status
                });
            }
            return classified({
                severity: baseSeverity,
                category: "quest",
                eventCode: "ORION_CLAIM_EVENT",
                summary,
                questName: quotedName,
                text: sanitized,
                status
            });
        }

        if (tag === "Cycle") {
            const eventCode = /Starting loop/i.test(sanitized)
                ? "ORION_CYCLE_STARTED"
                : /Processing:/i.test(sanitized)
                    ? "ORION_CYCLE_PROCESSING"
                    : "ORION_CYCLE_EVENT";
            return classified({
                severity: failureSeverity(baseSeverity, sanitized),
                category: "runtime",
                eventCode,
                summary,
                text: sanitized,
                status
            });
        }

        if (tag === "System") {
            if (/account changed/i.test(sanitized)) {
                return classified({
                    severity: "warning",
                    category: "runtime",
                    eventCode: "ORION_ACCOUNT_CHANGED",
                    summary,
                    text: sanitized,
                    status
                });
            }
            if (/suspended quest access/i.test(sanitized)) {
                return classified({
                    severity: "error",
                    category: "runtime",
                    eventCode: "ORION_QUEST_ACCESS_SUSPENDED",
                    summary,
                    text: sanitized,
                    status
                });
            }
            return classified({
                severity: failureSeverity(baseSeverity, sanitized),
                category: "runtime",
                eventCode: "ORION_SYSTEM_EVENT",
                summary,
                text: sanitized,
                status
            });
        }

        if (tag === "Startup") {
            const eventCode = /quest list.*waiting|waiting.*quest list/i.test(sanitized)
                ? "ORION_STARTUP_WAITING"
                : /failed|could not/i.test(sanitized)
                    ? "ORION_STARTUP_WARNING"
                    : "ORION_STARTUP_EVENT";
            return classified({
                severity: failureSeverity(baseSeverity, sanitized),
                category: "runtime",
                eventCode,
                summary,
                text: sanitized,
                status
            });
        }

        if (tag === "Patcher") {
            const eventCode = /previous session ended without restoring|turned it back on/i.test(sanitized)
                ? "ORION_PATCHER_RESTORED"
                : /could not|not found|lacks|cannot/i.test(sanitized)
                    ? "ORION_PATCHER_WARNING"
                    : "ORION_PATCHER_EVENT";
            return classified({
                severity: failureSeverity(baseSeverity, sanitized),
                category: "runtime",
                eventCode,
                summary,
                text: sanitized,
                status
            });
        }

        if (tag === "Bypass") {
            const eventCode = /relay detected/i.test(sanitized)
                ? "ORION_BYPASS_RELAY"
                : /stopped responding|trying other transports|falling back/i.test(sanitized)
                    ? "ORION_BYPASS_FALLBACK"
                    : /is off|skipping|refus(?:ed|ing)/i.test(sanitized)
                        ? "ORION_BYPASS_SKIPPED"
                        : "ORION_BYPASS_EVENT";
            return classified({
                severity: failureSeverity(baseSeverity, sanitized),
                category: "diagnostic",
                eventCode,
                summary,
                questName: quotedName,
                text: sanitized,
                status
            });
        }

        if (tag === "Achievement") {
            const eventCode = /heartbeat rejected|too many failures|falling back/i.test(sanitized)
                ? "ORION_ACHIEVEMENT_FALLBACK"
                : "ORION_ACHIEVEMENT_EVENT";
            return classified({
                severity: failureSeverity(baseSeverity, sanitized),
                category: "quest",
                eventCode,
                summary,
                questName: quotedName,
                text: sanitized,
                status
            });
        }

        if (/heartbeat/i.test(sanitized)) {
            return classified({
                severity: failureSeverity(baseSeverity, sanitized),
                category: "network",
                eventCode: /(fail|error|reject|HTTP|watchdog)/i.test(sanitized) ? "ORION_HEARTBEAT_FAILURE" : "ORION_HEARTBEAT_EVENT",
                summary,
                questName: quotedName,
                text: sanitized,
                status
            });
        }

        if (tag === "Task") {
            const runtimeError = /cleanup.*threw|worker rejected unexpectedly/i.test(sanitized);
            return classified({
                severity: runtimeError ? "error" : failureSeverity(baseSeverity, sanitized),
                category: "quest",
                eventCode: runtimeError ? "ORION_TASK_RUNTIME_ERROR" : "ORION_TASK_EVENT",
                summary,
                questName: quotedName,
                text: sanitized,
                status
            });
        }

        return classified({
            severity: failureSeverity(baseSeverity, sanitized),
            category: "runtime",
            eventCode: baseSeverity === "error" ? "ORION_CONSOLE_ERROR" : baseSeverity === "warning" ? "ORION_CONSOLE_WARNING" : "ORION_EVENT",
            summary: summary || "Orion event",
            text: sanitized,
            status
        });
    }

    return classified({
        severity: failureSeverity(baseSeverity, sanitized),
        category: "diagnostic",
        eventCode: baseSeverity === "error" ? "QUESTUI_CONSOLE_ERROR" : baseSeverity === "warning" ? "QUESTUI_CONSOLE_WARNING" : "QUESTUI_EVENT",
        summary: summary || "QuestUI event",
        text: sanitized,
        status
    });
}

export function severityRank(severity: EventLogSeverity): number {
    if (severity === "error") return 0;
    if (severity === "warning") return 1;
    if (severity === "success") return 2;
    return 3;
}

export function eventSearchText(event: EventLogEvent): string {
    const detail = event.detail ?? {};
    return [
        event.source,
        event.severity,
        inferEventCategory(event),
        event.eventCode,
        event.summary,
        event.quest?.id,
        event.quest?.name,
        event.quest?.taskType,
        detail.message,
        detail.reason,
        detail.httpStatus,
        detail.upstreamCode,
        typeof detail.terminal === "boolean" ? `terminal:${detail.terminal}` : null,
        typeof detail.retryable === "boolean" ? `retryable:${detail.retryable}` : null,
        detail.attempt != null ? `attempt:${String(detail.attempt)}` : null,
        detail.maxAttempts != null ? `maxAttempts:${String(detail.maxAttempts)}` : null,
        detail.orionCategory
    ].filter(value => value != null).join(" ").toLowerCase();
}
