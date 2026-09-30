import type { EventLogEvent } from "./eventLogTypes";

export interface QuestNotificationSnapshot {
    id: string;
    name: string;
    status: "available" | "in-progress" | "claimable" | "claimed" | "expired";
    rewardLabel: string;
}

export interface QuestCompletionNotice {
    questId: string;
    questName: string;
    rewardLabel: string;
}

export interface QuestAvailableNotice {
    questId: string;
    questName: string;
    rewardLabel: string;
}

export function completedQuestTransitions(
    previous: readonly QuestNotificationSnapshot[],
    next: readonly QuestNotificationSnapshot[]
): QuestCompletionNotice[] {
    const previousById = new Map(previous.map(quest => [quest.id, quest]));
    const notices: QuestCompletionNotice[] = [];

    for (const quest of next) {
        const before = previousById.get(quest.id);
        if (!before || before.status !== "in-progress" || quest.status !== "claimable") continue;
        notices.push({
            questId: quest.id,
            questName: quest.name,
            rewardLabel: quest.rewardLabel
        });
    }

    return notices;
}

export function newAvailableQuestTransitions(
    knownQuestIds: ReadonlySet<string>,
    next: readonly QuestNotificationSnapshot[]
): QuestAvailableNotice[] {
    const notices: QuestAvailableNotice[] = [];

    for (const quest of next) {
        if (knownQuestIds.has(quest.id) || quest.status !== "available") continue;
        notices.push({
            questId: quest.id,
            questName: quest.name,
            rewardLabel: quest.rewardLabel
        });
    }

    return notices;
}

export function isActionableProblemEvent(
    event: Pick<EventLogEvent, "source" | "eventCode" | "severity" | "detail">
): boolean {
    // Orion's network.failed event is terminal for one queued HTTP operation, not necessarily for
    // the owning task. Keep that request-layer diagnostic in Event Log and let the task/enroll/
    // claim/bypass terminal outcome own user-facing problem attention.
    if (event.source === "orion" && event.eventCode === "network.failed") return false;

    if (event.severity === "error") return true;
    return event.severity === "warning" && event.detail?.terminal === true;
}

export function problemNotificationKey(event: Pick<EventLogEvent, "source" | "eventCode" | "summary" | "quest">): string {
    return [
        event.source,
        event.eventCode,
        event.quest?.id ?? event.quest?.name ?? "",
        event.summary
    ].join("\u001f");
}
