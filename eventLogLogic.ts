import type { EventLogEvent, EventLogSeverity, EventLogSource } from "./eventLogTypes";

const MAX_DETAIL_LENGTH = 32 * 1024;

const SECRET_PATTERNS: Array<[RegExp, string]> = [
    [/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi, "$1[REDACTED]"],
    [/(access[_-]?token|auth[_-]?token|proxy[_-]?ticket|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]"],
    [/(oauth\s+code|auth\s+code)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]"],
    [/([?&](?:code|token|access_token|ticket)=)[^&#\s]+/gi, "$1[REDACTED]"]
];

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

export interface ClassifiedConsoleEvent {
    severity: EventLogSeverity;
    eventCode: string;
    summary: string;
    questName?: string | null;
    detail: Record<string, unknown>;
}

export function classifyConsoleEvent(source: EventLogSource, level: string, text: string): ClassifiedConsoleEvent {
    const sanitized = sanitizeEventText(text);
    const fallbackSeverity: EventLogSeverity = level === "error" ? "error" : level === "warn" ? "warning" : "info";

    if (source === "orion") {
        const aborted = sanitized.match(/\[Task\]\s+Aborted\s+"([^"]+)":\s*(.+)$/i);
        if (aborted) {
            const reason = aborted[2].trim();
            return {
                severity: "error",
                eventCode: /heartbeat|no credited beat|watchdog/i.test(reason) ? "ORION_HEARTBEAT_TIMEOUT" : "ORION_TASK_ABORTED",
                summary: /heartbeat|watchdog/i.test(reason) ? "Task aborted · heartbeat timeout" : `Task aborted · ${reason}`,
                questName: aborted[1],
                detail: { reason, rawConsole: sanitized }
            };
        }

        const completed = sanitized.match(/\[Task\]\s+Completed\s+"([^"]+)"!?/i);
        if (completed) {
            return { severity: "success", eventCode: "ORION_TASK_COMPLETED", summary: "Task completed", questName: completed[1], detail: { rawConsole: sanitized } };
        }

        const started = sanitized.match(/\[Task\]\s+Started\s+[^:]+:\s*(.+)$/i);
        if (started) {
            return { severity: "info", eventCode: "ORION_TASK_STARTED", summary: "Task started", questName: started[1].trim(), detail: { rawConsole: sanitized } };
        }

        const http = sanitized.match(/HTTP\s+(\d{3})/i);
        if (/heartbeat/i.test(sanitized) && /(fail|error|reject|HTTP)/i.test(sanitized)) {
            return {
                severity: fallbackSeverity === "info" ? "warning" : fallbackSeverity,
                eventCode: "ORION_HEARTBEAT_FAILURE",
                summary: http ? `Heartbeat request failed · HTTP ${http[1]}` : "Heartbeat request failed",
                detail: { rawConsole: sanitized, httpStatus: http ? Number(http[1]) : null }
            };
        }

        if (/video quest unavailable/i.test(sanitized)) {
            return {
                severity: "warning",
                eventCode: "ORION_VIDEO_UNAVAILABLE",
                summary: http ? `Video Quest unavailable · HTTP ${http[1]}` : "Video Quest unavailable",
                detail: { rawConsole: sanitized, httpStatus: http ? Number(http[1]) : null }
            };
        }

        return {
            severity: fallbackSeverity,
            eventCode: fallbackSeverity === "error" ? "ORION_CONSOLE_ERROR" : fallbackSeverity === "warning" ? "ORION_CONSOLE_WARNING" : "ORION_EVENT",
            summary: sanitized.replace(/^.*?OrionQuests\s*/i, "").slice(0, 180) || "Orion event",
            detail: { rawConsole: sanitized }
        };
    }

    return {
        severity: fallbackSeverity,
        eventCode: fallbackSeverity === "error" ? "QUESTUI_CONSOLE_ERROR" : fallbackSeverity === "warning" ? "QUESTUI_CONSOLE_WARNING" : "QUESTUI_EVENT",
        summary: sanitized.replace(/^.*?QuestUI\s*/i, "").slice(0, 180) || "QuestUI event",
        detail: { rawConsole: sanitized }
    };
}

export function severityRank(severity: EventLogSeverity): number {
    if (severity === "error") return 0;
    if (severity === "warning") return 1;
    if (severity === "success") return 2;
    return 3;
}

export function eventSearchText(event: EventLogEvent): string {
    return [
        event.source,
        event.severity,
        event.eventCode,
        event.summary,
        event.quest?.id,
        event.quest?.name,
        event.quest?.taskType,
        event.detail?.message,
        event.detail?.reason,
        event.detail?.httpStatus,
        event.detail?.upstreamCode
    ].filter(value => value != null).join(" ").toLowerCase();
}
