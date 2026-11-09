export interface QuestShortcutComparable {
    id: string;
    status: string;
    expiresAt: number | null;
    reward: { kind: string; };
    tasks: Array<{ type: string; }>;
}

/**
 * Compare only fields that can change the Quest shortcut surface.
 * Progress, raw Quest identity, artwork, and other Dashboard-only fields are
 * intentionally ignored so the title-bar shortcut is not re-rendered by the
 * Dashboard's high-frequency progress clock.
 */
export function sameQuestShortcutSnapshot(
    previous: QuestShortcutComparable[],
    next: QuestShortcutComparable[]
): boolean {
    if (previous.length !== next.length) return false;

    for (let index = 0; index < previous.length; index++) {
        const left = previous[index];
        const right = next[index];

        if (
            left.id !== right.id
            || left.status !== right.status
            || left.expiresAt !== right.expiresAt
            || left.reward.kind !== right.reward.kind
            || left.tasks.length !== right.tasks.length
        ) return false;

        for (let taskIndex = 0; taskIndex < left.tasks.length; taskIndex++) {
            if (left.tasks[taskIndex].type !== right.tasks[taskIndex].type) return false;
        }
    }

    return true;
}
