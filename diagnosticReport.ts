import gitHash from "~git-hash";

import { inferEventCategory, sanitizeEventText } from "./eventLogLogic";
import type { EventLogCategory, EventLogEvent } from "./eventLogTypes";
import { getOrionIntegrationHealth } from "./orionIntegration";
import { QUESTUI_VERSION } from "./version";

function discordChannel(): string {
    try { return window.GLOBAL_ENV?.RELEASE_CHANNEL ?? "Unknown"; }
    catch { return "Unknown"; }
}

function discordVersion(): string {
    try {
        if (IS_DISCORD_DESKTOP && typeof DiscordNative !== "undefined") return DiscordNative.app.getVersion();
    } catch { }
    return "Unknown";
}

function categoryLabel(category: EventLogCategory): string {
    if (category === "quest") return "Quest";
    if (category === "runtime") return "Runtime";
    if (category === "network") return "Network";
    return "Diagnostic";
}

function environmentLines(event: EventLogEvent): string[] {
    const health = getOrionIntegrationHealth(true);
    return [
        `QuestUI:        ${QUESTUI_VERSION}`,
        `OrionQuests:    ${health.installedVersion ?? "Unknown"}`,
        `Orion health:   ${health.kind}`,
        `Capture source: ${event.captureSource}`,
        `Discord:        ${discordChannel()} ${discordVersion()}`,
        `Vencord:        v${VERSION} (${gitHash})`,
        `Platform:       ${navigator.platform || "Unknown"}`,
        `User agent:     ${navigator.userAgent}`
    ];
}

function detailLines(event: EventLogEvent): string[] {
    const detail = event.detail ?? {};
    const lines: string[] = [];
    if (detail.httpStatus != null) lines.push(`HTTP Status:    ${String(detail.httpStatus)}`);
    if (detail.upstreamCode != null) lines.push(`Upstream Code:  ${String(detail.upstreamCode)}`);
    if (typeof detail.terminal === "boolean") lines.push(`Terminal:       ${detail.terminal ? "Yes" : "No"}`);
    if (typeof detail.retryable === "boolean") lines.push(`Retryable:      ${detail.retryable ? "Yes" : "No"}`);
    if (detail.attempt != null) lines.push(`Attempt:        ${String(detail.attempt)}${detail.maxAttempts != null ? ` / ${String(detail.maxAttempts)}` : ""}`);
    if (detail.reason) lines.push(`Reason:         ${sanitizeEventText(detail.reason)}`);
    if (detail.message) lines.push(`Message:        ${sanitizeEventText(detail.message)}`);
    return lines;
}

export function buildDiagnosticReport(event: EventLogEvent, availableEvents: EventLogEvent[] = []): string {
    const related = availableEvents
        .filter(candidate => candidate.id !== event.id
            && candidate.source === event.source
            && (event.quest?.id ? candidate.quest?.id === event.quest.id : event.quest?.name ? candidate.quest?.name === event.quest.name : true))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);

    const lines = [
        "QuestUI Diagnostic Report",
        "=========================",
        "",
        "Event",
        "-----",
        `Event ID:       ${event.id}`,
        `Event Code:     ${event.eventCode}`,
        `Severity:       ${event.severity.toUpperCase()}`,
        `Category:       ${categoryLabel(inferEventCategory(event))}`,
        `Timestamp:      ${new Date(event.timestamp).toISOString()}`,
        `Source:         ${event.source === "orion" ? "OrionQuests" : "QuestUI"}`,
        `Summary:        ${sanitizeEventText(event.summary)}`
    ];

    if (event.quest?.name || event.quest?.id || event.quest?.taskType) {
        lines.push("", "Quest", "-----");
        if (event.quest.name) lines.push(`Name:           ${sanitizeEventText(event.quest.name)}`);
        if (event.quest.id) lines.push(`Quest ID:       ${sanitizeEventText(event.quest.id)}`);
        if (event.quest.taskType) lines.push(`Task Type:      ${sanitizeEventText(event.quest.taskType)}`);
    }

    const details = detailLines(event);
    if (details.length) lines.push("", "Error / Detail", "--------------", ...details);

    if (event.detail?.rawConsole) {
        lines.push("", "Captured Console Detail", "-----------------------", sanitizeEventText(event.detail.rawConsole));
    }
    if (event.detail?.stack) {
        lines.push("", "Stack", "-----", sanitizeEventText(event.detail.stack));
    }

    lines.push("", "Environment", "-----------", ...environmentLines(event));

    if (related.length) {
        lines.push("", "Related Events", "--------------");
        for (const candidate of related) {
            lines.push(`${new Date(candidate.timestamp).toISOString()}  ${candidate.severity.toUpperCase()}  ${categoryLabel(inferEventCategory(candidate)).toUpperCase()}  ${candidate.eventCode}  ${sanitizeEventText(candidate.summary, 180)}`);
        }
    }

    return sanitizeEventText(lines.join("\n"), 64 * 1024);
}
