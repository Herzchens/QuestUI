import type { EventLogCaptureSource, EventLogCategory, EventLogEvent, EventLogSeverity, EventLogSource } from "./eventLogTypes";

const EVENT_SOURCES = new Set<EventLogSource>(["orion", "questui"]);
const EVENT_SEVERITIES = new Set<EventLogSeverity>(["info", "success", "warning", "error"]);
const EVENT_CATEGORIES = new Set<EventLogCategory>(["quest", "runtime", "network", "diagnostic"]);
const EVENT_CAPTURE_SOURCES = new Set<EventLogCaptureSource>(["questui", "console-preview", "orion-api"]);

function optionalString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

/**
 * Validate the persisted JSONL boundary before an object reaches sorting or React.
 * Account/category are intentionally optional so pre-account-scope Event Log rows
 * remain readable as legacy history. Malformed core records are ignored instead
 * of allowing one bad historical line to break the whole viewer.
 */
export function normalizePersistedEvent(value: unknown): EventLogEvent | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;

    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const timestamp = Number(raw.timestamp);
    const source = raw.source as EventLogSource;
    const severity = raw.severity as EventLogSeverity;
    const captureSource = raw.captureSource as EventLogCaptureSource;
    const eventCode = typeof raw.eventCode === "string" ? raw.eventCode : null;
    const summary = typeof raw.summary === "string" ? raw.summary : null;

    if (!id
        || !Number.isFinite(timestamp)
        || timestamp <= 0
        || !EVENT_SOURCES.has(source)
        || !EVENT_SEVERITIES.has(severity)
        || !EVENT_CAPTURE_SOURCES.has(captureSource)
        || eventCode == null
        || summary == null) {
        return null;
    }

    const hasAccountId = Object.prototype.hasOwnProperty.call(raw, "accountId");
    if (hasAccountId && raw.accountId != null && typeof raw.accountId !== "string") return null;

    const category = EVENT_CATEGORIES.has(raw.category as EventLogCategory)
        ? raw.category as EventLogCategory
        : undefined;

    let quest: EventLogEvent["quest"] = null;
    if (raw.quest && typeof raw.quest === "object" && !Array.isArray(raw.quest)) {
        const rawQuest = raw.quest as Record<string, unknown>;
        quest = {
            id: optionalString(rawQuest.id),
            name: optionalString(rawQuest.name),
            taskType: optionalString(rawQuest.taskType)
        };
    }

    const detail = raw.detail && typeof raw.detail === "object" && !Array.isArray(raw.detail)
        ? raw.detail as EventLogEvent["detail"]
        : null;

    const event: EventLogEvent = {
        schemaVersion: 1,
        id,
        timestamp,
        source,
        severity,
        captureSource,
        eventCode,
        summary,
        quest,
        detail
    };

    if (category) event.category = category;
    if (hasAccountId) {
        event.accountId = typeof raw.accountId === "string" && raw.accountId.trim()
            ? raw.accountId.trim()
            : null;
    }

    return event;
}
