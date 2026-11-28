import type { OrionControlSnapshot } from "./companion";
import { shouldPauseOrionQuestBeforeIgnore } from "./controls";

export function resumableQuestIds(snapshot: OrionControlSnapshot, ignored: ReadonlySet<string>): string[] {
    return Object.entries(snapshot.quests).filter(([id, state]) => state === "paused" && !ignored.has(id)).map(([id]) => id);
}
export function ignoredActiveQuestIds(snapshot: OrionControlSnapshot | null, ignored: ReadonlySet<string>): string[] {
    return [...ignored].filter(id => shouldPauseOrionQuestBeforeIgnore(snapshot, id));
}
