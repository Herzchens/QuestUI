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

// Only the selected exact task key qualifies. Do not infer support from a
// display category or choose a different task from a multi-task Quest.
export function questQuickOpenTarget(id: unknown, taskKey: unknown): QuestQuickOpenKind | null {
    return typeof id === "string" && /^\d{17,20}$/.test(id) ? questQuickOpenKind(taskKey) : null;
}

export function canLaunchQuestQuickOpen(
    status: unknown, enrolledAt: unknown, questAccessSuspended: unknown
): boolean {
    // The native video opener can enroll implicitly. Keep enrollment separate
    // from Quick Open and never override Discord's access restrictions.
    return status === "in-progress" && !!enrolledAt && questAccessSuspended === false;
}
