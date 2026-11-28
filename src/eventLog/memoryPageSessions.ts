import { createPageSessionStore } from "./sessionStore";
import type { EventLogPageQuery, EventLogPageResult } from "./pagination";

export const memorySessions = createPageSessionStore<{
    signature: string;
    sort: NonNullable<EventLogPageQuery["sort"]>;
    events: EventLogPageResult["events"];
}>(3, 15 * 60 * 1000);
let generation = 0;

export function invalidateMemoryPageSessions(): void {
    generation++;
    memorySessions.clear();
}

export function getMemoryPageGeneration(): number {
    return generation;
}
