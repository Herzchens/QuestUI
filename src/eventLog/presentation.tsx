import { showToast } from "@webpack/common";

import { isLegacyUnscopedEvent } from "./account";
import { inferEventCategory } from "./logic";
import { buildDiagnosticReport } from "./report";
import type { EventLogCategory, EventLogEvent, EventLogSeverity, EventLogSource } from "./types";

export type EventLogStorageTone = "safe" | "watch" | "high" | "critical" | "unknown";
export type EventLogMatchTone = "empty" | "few" | "active" | "dense";
export type EventLogVirtualRow =
    | { kind: "day"; key: string; timestamp: number; }
    | { kind: "event"; key: string; event: EventLogEvent; };

const EVENT_LOG_DAY_ROW_HEIGHT = 30;
const EVENT_LOG_EVENT_ROW_HEIGHT = 64;
const EVENT_LOG_ACCOUNT_ROW_HEIGHT = 78;

export function BugLogIcon() {
    return (
        <svg className="quest-ui-event-log-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 7.2V5.8a3 3 0 0 1 6 0v1.4" />
            <rect x="6.8" y="7.2" width="10.4" height="12.2" rx="4.2" />
            <path d="M3.7 9.4h3.1M17.2 9.4h3.1M3.2 13.1h3.6M17.2 13.1h3.6M4 17h3.4M16.6 17H20M12 7.2v12.2" />
        </svg>
    );
}

export function dayLabel(timestamp: number): string {
    const date = new Date(timestamp);
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((startToday - startDate) / 86_400_000);
    if (days === 0) return `Today · ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
    if (days === 1) return `Yesterday · ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function dayKey(timestamp: number): string {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function timeLabel(timestamp: number): string {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(timestamp);
}

export function sourceLabel(source: EventLogSource): string {
    return source === "orion" ? "ORION" : "QUESTUI";
}

export function categoryLabel(category: EventLogCategory): string {
    if (category === "quest") return "Quest";
    if (category === "runtime") return "Runtime";
    if (category === "network") return "Network";
    return "Diagnostic";
}

export function severityGlyph(severity: EventLogSeverity): string {
    if (severity === "error") return "×";
    if (severity === "warning") return "!";
    if (severity === "success") return "✓";
    return "i";
}

function captureSourceLabel(event: EventLogEvent): string {
    if (event.captureSource === "console-preview") return "Console fallback";
    if (event.captureSource === "orion-api") return "Orion structured API";
    return "QuestUI";
}

export function formatStorageBytes(bytes: number): string {
    const safeBytes = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
    if (safeBytes >= 1024 * 1024) return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(safeBytes / 1024).toFixed(safeBytes >= 1024 ? 0 : 1)} KB`;
}

export function storageTone(size: number, maxBytes: number): EventLogStorageTone {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) return "unknown";
    const ratio = Math.max(0, size) / maxBytes;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.8) return "high";
    if (ratio >= 0.6) return "watch";
    return "safe";
}

export function matchingTone(total: number): EventLogMatchTone {
    if (!Number.isFinite(total) || total <= 0) return "empty";
    if (total < 100) return "few";
    if (total < 1000) return "active";
    return "dense";
}

export function isAccountChangeEvent(event: Pick<EventLogEvent, "eventCode">): boolean {
    const code = String(event.eventCode ?? "").toLocaleLowerCase();
    return code === "questui_account_changed"
        || code === "orion_account_changed"
        || code === "system.account_changed";
}

export function eventRenderKey(event: EventLogEvent): string {
    return typeof event.id === "string" && event.id ? event.id : `${event.timestamp}:${event.source}:${event.eventCode}`;
}

export function buildVirtualRows(events: EventLogEvent[]): EventLogVirtualRow[] {
    const rows: EventLogVirtualRow[] = [];
    let previousDay = "";
    for (const event of events) {
        const key = dayKey(event.timestamp);
        if (key !== previousDay) {
            rows.push({ kind: "day", key: `day:${key}:${rows.length}`, timestamp: event.timestamp });
            previousDay = key;
        }
        rows.push({ kind: "event", key: `event:${eventRenderKey(event)}`, event });
    }
    return rows;
}

export function virtualRowHeight(row: EventLogVirtualRow | undefined): number {
    if (!row || row.kind === "day") return EVENT_LOG_DAY_ROW_HEIGHT;
    return isAccountChangeEvent(row.event) ? EVENT_LOG_ACCOUNT_ROW_HEIGHT : EVENT_LOG_EVENT_ROW_HEIGHT;
}

const SEMANTIC_TOKEN_RE = /(\[(?:System|Network|Quest|Task|Cycle|Enroll|Claim|Bypass|Achievement|Startup|Patcher)\]|HTTP\s+\d{3}|heartbeat|watchdog|retry(?:ing)?|block(?:ed|ing)?|aborted?|failed?|failure|error|warning|completed?|claimed?|accept(?:ing|ed)?|enrolled?|paused?|resum(?:ed|ing|e)?|started?|stopped?|queued?|captcha|required|unavailable|refus(?:ed|ing)|fallback|bypass|success(?:fully)?)/gi;

function semanticTokenClass(token: string): string | null {
    const normalized = token.toLowerCase();
    if (/^\[(network)\]$/.test(normalized) || normalized.startsWith("http ") || normalized === "heartbeat" || normalized === "watchdog") return "is-network";
    if (/^\[(cycle|system|startup|patcher)\]$/.test(normalized)) return "is-runtime";
    if (/^\[(quest|task|enroll|claim|achievement)\]$/.test(normalized)) return "is-quest";
    if (/^\[bypass\]$/.test(normalized) || normalized === "bypass" || normalized === "fallback") return "is-diagnostic";
    if (/aborted|failed|failure|error|refused/.test(normalized)) return "is-danger";
    if (/^block(?:ed|ing)?$/.test(normalized)) return "is-blocked";
    if (/retry|warning|captcha|required|unavailable|queued|paused|stopped/.test(normalized)) return "is-warning";
    if (/completed|claimed|accepted|enrolled|resumed|started|success/.test(normalized)) return "is-success";
    return null;
}

export function SemanticText({ text }: { text: unknown; }) {
    const safeText = String(text ?? "");
    return (
        <>
            {safeText.split(SEMANTIC_TOKEN_RE).map((part, index) => {
                if (!part) return null;
                const className = semanticTokenClass(part);
                return className
                    ? <span key={`${index}-${part}`} className={`quest-ui-event-semantic ${className}`}>{part}</span>
                    : part;
            })}
        </>
    );
}

export async function copyDiagnosticReport(event: EventLogEvent, availableEvents: EventLogEvent[]): Promise<void> {
    try {
        await navigator.clipboard.writeText(buildDiagnosticReport(event, availableEvents));
        showToast({ text: "Diagnostic report copied.", variant: "success" });
    } catch {
        showToast({ text: "Could not copy the diagnostic report.", variant: "critical" });
    }
}

export function EventDetail({ event, availableEvents, onBack }: { event: EventLogEvent; availableEvents: EventLogEvent[]; onBack: () => void; }) {
    const category = inferEventCategory(event);
    const legacy = isLegacyUnscopedEvent(event);
    return (
        <div className="quest-ui-event-detail">
            <div className="quest-ui-event-detail-header">
                <button type="button" onClick={onBack}>← Back</button>
                <div className="quest-ui-event-detail-header-actions">
                    <span className={`quest-ui-event-level is-${event.severity}`}>{severityGlyph(event.severity)} {sourceLabel(event.source)}</span>
                    <button type="button" className="quest-ui-event-copy-report" onClick={() => void copyDiagnosticReport(event, availableEvents)} title="Copy diagnostic report"><BugLogIcon /> Copy report</button>
                </div>
            </div>
            <h3><SemanticText text={event.summary} /></h3>
            <div className="quest-ui-event-detail-grid">
                <span>Event code</span><code>{event.eventCode}</code>
                <span>Category</span><strong>{categoryLabel(category)}</strong>
                <span>Time</span><strong>{new Date(event.timestamp).toLocaleString()}</strong>
                <span>Capture</span><strong>{captureSourceLabel(event)}</strong>
                <span>Account</span><strong>{legacy ? "Legacy · unscoped" : "Current account"}</strong>
                {event.quest?.name && <><span>Quest</span><strong>{event.quest.name}</strong></>}
                {event.quest?.id && <><span>Quest ID</span><code>{event.quest.id}</code></>}
                {event.quest?.taskType && <><span>Task type</span><code>{event.quest.taskType}</code></>}
                {event.detail?.httpStatus != null && <><span>HTTP</span><code>{String(event.detail.httpStatus)}</code></>}
                {event.detail?.upstreamCode != null && <><span>Upstream code</span><code>{String(event.detail.upstreamCode)}</code></>}
                {event.detail?.status != null && <><span>Update status</span><code>{String(event.detail.status)}</code></>}
                {event.detail?.phase != null && <><span>Update phase</span><code>{String(event.detail.phase)}</code></>}
                {event.detail?.updateMethod != null && <><span>Update method</span><code>{String(event.detail.updateMethod)}</code></>}
                {event.detail?.fromVersion != null && <><span>From version</span><code>{String(event.detail.fromVersion)}</code></>}
                {event.detail?.toVersion != null && <><span>To version</span><code>{String(event.detail.toVersion)}</code></>}
                {event.detail?.fromCommit != null && <><span>From commit</span><code>{String(event.detail.fromCommit)}</code></>}
                {event.detail?.toCommit != null && <><span>To commit</span><code>{String(event.detail.toCommit)}</code></>}
                {typeof event.detail?.terminal === "boolean" && <><span>Terminal</span><strong>{event.detail.terminal ? "Yes" : "No"}</strong></>}
                {typeof event.detail?.retryable === "boolean" && <><span>Retryable</span><strong>{event.detail.retryable ? "Yes" : "No"}</strong></>}
                {event.detail?.attempt != null && <><span>Attempt</span><code>{String(event.detail.attempt)}{event.detail?.maxAttempts != null ? ` / ${String(event.detail.maxAttempts)}` : ""}</code></>}
            </div>
            {event.detail?.reason && <section><span className="quest-ui-event-detail-label">Reason</span><p>{String(event.detail.reason)}</p></section>}
            {event.detail?.message && <section><span className="quest-ui-event-detail-label">Message</span><p>{String(event.detail.message)}</p></section>}
            {event.detail?.localWorkSummary != null && <section><span className="quest-ui-event-detail-label">Local work</span><p>{String(event.detail.localWorkSummary)}</p></section>}
            {event.detail?.updateTrace != null && <section><span className="quest-ui-event-detail-label">Update trace</span><pre>{String(event.detail.updateTrace)}</pre></section>}
            {event.detail?.diagnostic != null && <section><span className="quest-ui-event-detail-label">Native diagnostic</span><pre>{String(event.detail.diagnostic)}</pre></section>}
            {event.detail?.rawConsole && <section><span className="quest-ui-event-detail-label">Captured console detail</span><pre>{String(event.detail.rawConsole)}</pre></section>}
            {event.detail?.stack && <section><span className="quest-ui-event-detail-label">Stack</span><pre>{String(event.detail.stack)}</pre></section>}
        </div>
    );
}

