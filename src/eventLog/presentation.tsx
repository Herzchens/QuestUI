import { showToast } from "@webpack/common";

import { isLegacyUnscopedEvent } from "./account";
import { inferEventCategory } from "./logic";
import { buildDiagnosticReport } from "./report";
import { useDashboardThemeClassName } from "../themes/runtime";
import type { EventLogCategory, EventLogEvent, EventLogSeverity, EventLogSource } from "./types";

export type EventLogStorageTone = "safe" | "watch" | "high" | "critical" | "unknown";
export type EventLogMatchTone = "empty" | "few" | "active" | "dense";
export type EventLogVirtualRow =
    | { kind: "day"; key: string; timestamp: number; }
    | { kind: "event"; key: string; event: EventLogEvent; };

const EVENT_LOG_DAY_ROW_HEIGHT = 36;
// Reserve space for metadata, two 1.35-line-height preview lines, row
// padding/borders and virtual gutters. Keep the fixed-height windowing model.
const EVENT_LOG_EVENT_ROW_HEIGHT = 74;
const EVENT_LOG_ACCOUNT_ROW_HEIGHT = 80;

export function BugLogIcon() {
    return (
        <svg className="quest-ui-event-log-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 2 1.88 1.88" />
            <path d="M14.12 3.88 16 2" />
            <path d="M9 7.13v-1a3 3 0 0 1 6 0v1" />
            <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z" />
            <path d="M12 20v-9" />
            <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
            <path d="M6 13H2" />
            <path d="M3 21c0-2.1 1.7-3.8 3.8-4" />
            <path d="M17.47 9C19.4 8.8 21 7.1 21 5" />
            <path d="M18 13h4" />
            <path d="M21 21c0-2.1-1.7-3.8-3.8-4" />
        </svg>
    );
}

export function DatabaseIcon() {
    return (
        <svg className="quest-ui-event-storage-icon" viewBox="0 0 24 24" aria-hidden="true">
            <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
            <path d="M4.5 5.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
            <path d="M4.5 11.5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
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

export function SeverityIcon({ severity }: { severity: EventLogSeverity; }) {
    if (severity === "warning") {
        return (
            <svg className="quest-ui-event-severity-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
            </svg>
        );
    }

    if (severity === "error") {
        return (
            <svg className="quest-ui-event-severity-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="m15 9-6 6" />
                <path d="m9 9 6 6" />
            </svg>
        );
    }

    if (severity === "success") {
        return (
            <svg className="quest-ui-event-severity-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
            </svg>
        );
    }

    return (
        <svg className="quest-ui-event-severity-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
}

export function CalendarDaysIcon() {
    return (
        <svg className="quest-ui-event-day-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 2v4M16 2v4" />
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path d="M3 10h18" />
            <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
    );
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

export function visualSeverity(event: Pick<EventLogEvent, "eventCode" | "severity">): EventLogSeverity {
    return isAccountChangeEvent(event) ? "warning" : event.severity;
}

export function eventListSummary(event: Pick<EventLogEvent, "eventCode" | "summary">): string {
    if (isAccountChangeEvent(event)) return "Discord account changed";
    const code = String(event.eventCode ?? "").toUpperCase();
    const product = code.startsWith("ORION_UPDATE_") ? "Orion"
        : code.startsWith("QUESTUI_UPDATE_") ? "QuestUI"
            : null;

    if (product) {
        if (code.endsWith("_STARTED")) return `${product} update started`;
        if (code.endsWith("_DECISION_REQUIRED")) return `${product} update needs attention`;
        if (code.endsWith("_DISCARD_CONFIRMED")) return `${product} discard confirmed`;
        if (code.endsWith("_KEPT")) return `${product} update skipped`;
        if (code.endsWith("_SUCCEEDED")) return `${product} update completed`;
        if (code.endsWith("_FAILED")) return `${product} update stopped`;
    }

    return String(event.summary ?? "");
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

export function virtualRowHeight(row: EventLogVirtualRow | undefined, currentAccountId?: string | null): number {
    if (!row || row.kind === "day") return EVENT_LOG_DAY_ROW_HEIGHT;
    const owner = typeof row.event.accountId === "string" && row.event.accountId ? row.event.accountId : null;
    return owner != null && owner !== currentAccountId ? EVENT_LOG_ACCOUNT_ROW_HEIGHT : EVENT_LOG_EVENT_ROW_HEIGHT;
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

function DetailMetaIcon({ kind }: { kind: "code" | "category" | "time" | "capture" | "account" | "detail"; }) {
    if (kind === "category") {
        return (
            <svg className="quest-ui-event-detail-meta-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
            </svg>
        );
    }
    if (kind === "time") {
        return (
            <svg className="quest-ui-event-detail-meta-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 2v3M17 2v3M3.5 9h17" />
                <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
                <path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" />
            </svg>
        );
    }
    if (kind === "capture") {
        return (
            <svg className="quest-ui-event-detail-meta-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 2 8 4-8 4-8-4 8-4Z" />
                <path d="m4 10 8 4 8-4" />
                <path d="m4 14 8 4 8-4" />
            </svg>
        );
    }
    if (kind === "account") {
        return (
            <svg className="quest-ui-event-detail-meta-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 21a7 7 0 0 1 14 0" />
            </svg>
        );
    }
    if (kind === "detail") {
        return (
            <svg className="quest-ui-event-detail-meta-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 8h.01M12 11v5" />
            </svg>
        );
    }
    return (
        <svg className="quest-ui-event-detail-meta-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
        </svg>
    );
}

function DetailMetaRow({ kind, label, children }: { kind: "code" | "category" | "time" | "capture" | "account" | "detail"; label: string; children: any; }) {
    return (
        <div className="quest-ui-event-detail-meta-row">
            <span className="quest-ui-event-detail-meta-icon-wrap" data-kind={kind}><DetailMetaIcon kind={kind} /></span>
            <span className="quest-ui-event-detail-meta-label">{label}</span>
            <div className="quest-ui-event-detail-meta-value">{children}</div>
        </div>
    );
}

export function EventDetail({ event, availableEvents, accountLabel, onBack }: { event: EventLogEvent; availableEvents: EventLogEvent[]; accountLabel: string; onBack: () => void; }) {
    const category = inferEventCategory(event);
    const displaySeverity = visualSeverity(event);
    return (
        <div className={useDashboardThemeClassName("quest-ui-event-detail", "quest-ui-event-surface", `is-${displaySeverity}`)}>
            <div className="quest-ui-event-detail-header">
                <button type="button" className="quest-ui-event-detail-back" onClick={onBack}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                    <span>Back</span>
                </button>
                <div className="quest-ui-event-detail-header-actions">
                    <span className={`quest-ui-event-detail-source is-${event.source}`}>
                        <SeverityIcon severity="info" />
                        <span>{sourceLabel(event.source)}</span>
                    </span>
                    <button
                        type="button"
                        className="quest-ui-event-copy-report"
                        onClick={() => void copyDiagnosticReport(event, availableEvents)}
                        title="Copy diagnostic report"
                    >
                        <BugLogIcon />
                        <span>Copy report</span>
                    </button>
                </div>
            </div>

            <div className="quest-ui-event-detail-hero">
                <span className={`quest-ui-event-detail-hero-icon is-${displaySeverity}`} aria-hidden="true">
                    <SeverityIcon severity={displaySeverity} />
                </span>
                <h3><SemanticText text={event.summary} /></h3>
                <span className={`quest-ui-event-detail-category is-${category}`}>{categoryLabel(category)}</span>
            </div>

            <div className="quest-ui-event-detail-meta-card">
                <DetailMetaRow kind="code" label="Event code"><code>{event.eventCode}</code></DetailMetaRow>
                <DetailMetaRow kind="category" label="Category"><strong>{categoryLabel(category)}</strong></DetailMetaRow>
                <DetailMetaRow kind="time" label="Time"><strong>{new Date(event.timestamp).toLocaleString()}</strong></DetailMetaRow>
                <DetailMetaRow kind="capture" label="Capture"><strong>{captureSourceLabel(event)}</strong></DetailMetaRow>
                <DetailMetaRow kind="account" label="Account"><strong>{accountLabel}</strong></DetailMetaRow>

                {event.quest?.name && <DetailMetaRow kind="detail" label="Quest"><strong>{event.quest.name}</strong></DetailMetaRow>}
                {event.quest?.id && <DetailMetaRow kind="detail" label="Quest ID"><code>{event.quest.id}</code></DetailMetaRow>}
                {event.quest?.taskType && <DetailMetaRow kind="detail" label="Task type"><code>{event.quest.taskType}</code></DetailMetaRow>}
                {event.detail?.httpStatus != null && <DetailMetaRow kind="detail" label="HTTP"><code>{String(event.detail.httpStatus)}</code></DetailMetaRow>}
                {typeof event.detail?.actionCode === "string" && <DetailMetaRow kind="detail" label="Action code"><code>{event.detail.actionCode}</code></DetailMetaRow>}
                {typeof event.detail?.retryAfterMs === "number" && Number.isFinite(event.detail.retryAfterMs) && event.detail.retryAfterMs >= 0 && <DetailMetaRow kind="detail" label="Wait (ms)"><code>{String(event.detail.retryAfterMs)}</code></DetailMetaRow>}
                {typeof event.detail?.position === "number" && typeof event.detail?.total === "number" && <DetailMetaRow kind="detail" label="Batch progress"><code>{event.detail.position} / {event.detail.total}</code></DetailMetaRow>}
                {event.detail?.upstreamCode != null && <DetailMetaRow kind="detail" label="Upstream code"><code>{String(event.detail.upstreamCode)}</code></DetailMetaRow>}
                {event.detail?.status != null && <DetailMetaRow kind="detail" label="Update status"><code>{String(event.detail.status)}</code></DetailMetaRow>}
                {event.detail?.phase != null && <DetailMetaRow kind="detail" label="Update phase"><code>{String(event.detail.phase)}</code></DetailMetaRow>}
                {event.detail?.updateMethod != null && <DetailMetaRow kind="detail" label="Update method"><code>{String(event.detail.updateMethod)}</code></DetailMetaRow>}
                {event.detail?.fromVersion != null && <DetailMetaRow kind="detail" label="From version"><code>{String(event.detail.fromVersion)}</code></DetailMetaRow>}
                {event.detail?.toVersion != null && <DetailMetaRow kind="detail" label="To version"><code>{String(event.detail.toVersion)}</code></DetailMetaRow>}
                {event.detail?.fromCommit != null && <DetailMetaRow kind="detail" label="From commit"><code>{String(event.detail.fromCommit)}</code></DetailMetaRow>}
                {event.detail?.toCommit != null && <DetailMetaRow kind="detail" label="To commit"><code>{String(event.detail.toCommit)}</code></DetailMetaRow>}
                {typeof event.detail?.terminal === "boolean" && <DetailMetaRow kind="detail" label="Terminal"><strong>{event.detail.terminal ? "Yes" : "No"}</strong></DetailMetaRow>}
                {typeof event.detail?.retryable === "boolean" && <DetailMetaRow kind="detail" label="Retryable"><strong>{event.detail.retryable ? "Yes" : "No"}</strong></DetailMetaRow>}
                {event.detail?.attempt != null && (
                    <DetailMetaRow kind="detail" label="Attempt">
                        <code>{String(event.detail.attempt)}{event.detail?.maxAttempts != null ? ` / ${String(event.detail.maxAttempts)}` : ""}</code>
                    </DetailMetaRow>
                )}
            </div>

            {event.detail?.reason && (
                <section className="quest-ui-event-detail-callout is-reason">
                    <div className="quest-ui-event-detail-callout-heading">
                        <SeverityIcon severity="warning" />
                        <strong>Reason</strong>
                    </div>
                    <p>{String(event.detail.reason)}</p>
                </section>
            )}

            {event.detail?.message && (
                <section className="quest-ui-event-detail-callout is-message">
                    <div className="quest-ui-event-detail-callout-heading">
                        <SeverityIcon severity="info" />
                        <strong>Message</strong>
                    </div>
                    <p>{String(event.detail.message)}</p>
                </section>
            )}

            {event.detail?.localWorkSummary != null && (
                <section className="quest-ui-event-detail-diagnostic">
                    <span className="quest-ui-event-detail-label">Local work</span>
                    <p>{String(event.detail.localWorkSummary)}</p>
                </section>
            )}
            {event.detail?.updateTrace != null && (
                <section className="quest-ui-event-detail-diagnostic">
                    <span className="quest-ui-event-detail-label">Update trace</span>
                    <pre>{String(event.detail.updateTrace)}</pre>
                </section>
            )}
            {event.detail?.diagnostic != null && (
                <section className="quest-ui-event-detail-diagnostic">
                    <span className="quest-ui-event-detail-label">Native diagnostic</span>
                    <pre>{String(event.detail.diagnostic)}</pre>
                </section>
            )}
            {event.detail?.rawConsole && (
                <section className="quest-ui-event-detail-diagnostic">
                    <span className="quest-ui-event-detail-label">Captured console detail</span>
                    <pre>{String(event.detail.rawConsole)}</pre>
                </section>
            )}
            {event.detail?.stack && (
                <section className="quest-ui-event-detail-diagnostic">
                    <span className="quest-ui-event-detail-label">Stack</span>
                    <pre>{String(event.detail.stack)}</pre>
                </section>
            )}
        </div>
    );
}
