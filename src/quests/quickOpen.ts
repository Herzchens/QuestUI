export type QuestQuickOpenKind = "video" | "activity";

export function questQuickOpenKind(taskKey: unknown): QuestQuickOpenKind | null {
    switch (taskKey) {
        case "WATCH_VIDEO":
            return "video";
        case "PLAY_ACTIVITY":
        case "ACHIEVEMENT_IN_ACTIVITY":
            return "activity";
        default:
            return null;
    }
}

export interface QuestQuickOpenTarget {
    kind: QuestQuickOpenKind;
    href: string;
}

// Only the selected exact task key qualifies. Do not infer support from the
// display category or choose a different task from a multi-task Quest.
// Until a native direct launcher is verified, expose an honest Quest link.
export function questQuickOpenTarget(id: unknown, taskKey: unknown): QuestQuickOpenTarget | null {
    const kind = questQuickOpenKind(taskKey);
    if (!kind || typeof id !== "string" || !/^\d{17,20}$/.test(id)) return null;
    return { kind, href: `https://discord.com/quests/${id}` };
}
