export type EventLogSource = "orion" | "questui";
export type EventLogAccountScope = "current" | "other";
export type EventLogSeverity = "info" | "success" | "warning" | "error";
export type EventLogCategory = "quest" | "runtime" | "network" | "diagnostic";
export type EventLogCaptureSource = "questui" | "console-preview" | "orion-api";
export type EventLogSort = "newest" | "oldest" | "severity";

export interface EventLogQuestRef {
    id?: string | null;
    name?: string | null;
    taskType?: string | null;
}

export interface EventLogDetail {
    message?: string | null;
    reason?: string | null;
    rawConsole?: string | null;
    stack?: string | null;
    httpStatus?: number | null;
    upstreamCode?: string | number | null;
    attempt?: number | null;
    maxAttempts?: number | null;
    [key: string]: unknown;
}

export interface EventLogEvent {
    schemaVersion: 1;
    id: string;
    timestamp: number;
    /** Discord account that owned the client state when this event was captured. */
    accountId?: string | null;
    /** Username captured with the owner so shared history can label non-current accounts. */
    accountUsername?: string | null;
    source: EventLogSource;
    severity: EventLogSeverity;
    category?: EventLogCategory;
    captureSource: EventLogCaptureSource;
    eventCode: string;
    summary: string;
    quest?: EventLogQuestRef | null;
    detail?: EventLogDetail | null;
}

export interface EventLogQuery {
    query?: string;
    source?: "all" | EventLogSource;
    severity?: "all" | EventLogSeverity | EventLogSeverity[];
    category?: "all" | EventLogCategory | EventLogCategory[];
    sort?: EventLogSort;
    limit?: number;
    /** Multi-select account relationship filter used by the Event Log viewer. */
    accountScope?: "all" | EventLogAccountScope | EventLogAccountScope[];
    /** Current Discord account used to evaluate current/other relationship filters. */
    currentAccountId?: string | null;
    /** Optional exact account scope retained for low-level callers and account-local clear flows. */
    accountId?: string;
    /** Include pre-account-scope rows as visibly legacy/unscoped history. */
    includeLegacy?: boolean;
}

export interface EventLogQueryResult {
    events: EventLogEvent[];
    total: number;
    hasMore: boolean;
}

