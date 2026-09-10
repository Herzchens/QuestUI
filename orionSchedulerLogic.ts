export type OrionSchedulerLane = "game" | "video";
export type OrionSchedulerQuestState = "running" | "waiting";

export interface OrionSchedulerLaneSnapshot {
    limit: number | null;
    running: number;
    waiting: number;
}

export interface OrionSchedulerQuestSnapshot {
    lane: OrionSchedulerLane;
    state: OrionSchedulerQuestState;
}

export interface OrionSchedulerSnapshot {
    lanes: Record<OrionSchedulerLane, OrionSchedulerLaneSnapshot>;
    quests: Record<string, OrionSchedulerQuestSnapshot>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | null {
    const number = Number(value);
    if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0) return null;
    return number;
}

function positiveIntegerOrNull(value: unknown): number | null | undefined {
    if (value == null) return null;
    const number = nonNegativeInteger(value);
    if (number == null || number < 1) return undefined;
    return number;
}

function normalizeLane(value: unknown): OrionSchedulerLaneSnapshot | null {
    if (!isRecord(value)) return null;
    const limit = positiveIntegerOrNull(value.limit);
    const running = nonNegativeInteger(value.running);
    const waiting = nonNegativeInteger(value.waiting);
    if (limit === undefined || running == null || waiting == null) return null;
    if (limit == null && (running !== 0 || waiting !== 0)) return null;
    if (limit != null && running > limit) return null;
    return { limit, running, waiting };
}

export function normalizeOrionSchedulerSnapshot(value: unknown): OrionSchedulerSnapshot | null {
    if (!isRecord(value) || !isRecord(value.lanes) || !isRecord(value.quests)) return null;

    const game = normalizeLane(value.lanes.game);
    const video = normalizeLane(value.lanes.video);
    if (!game || !video) return null;

    const quests: Record<string, OrionSchedulerQuestSnapshot> = {};
    const counted = {
        game: { running: 0, waiting: 0 },
        video: { running: 0, waiting: 0 }
    };

    for (const [rawId, rawQuest] of Object.entries(value.quests)) {
        const id = rawId.trim();
        if (!id || !isRecord(rawQuest)) return null;
        const lane = rawQuest.lane;
        const state = rawQuest.state;
        if ((lane !== "game" && lane !== "video") || (state !== "running" && state !== "waiting")) return null;
        quests[id] = { lane, state };
        counted[lane][state]++;
    }

    if (counted.game.running !== game.running || counted.game.waiting !== game.waiting) return null;
    if (counted.video.running !== video.running || counted.video.waiting !== video.waiting) return null;
    if (game.limit == null && (counted.game.running > 0 || counted.game.waiting > 0)) return null;
    if (video.limit == null && (counted.video.running > 0 || counted.video.waiting > 0)) return null;

    return {
        lanes: { game, video },
        quests
    };
}

export function schedulerLaneCopy(lane: OrionSchedulerLaneSnapshot): string {
    if (lane.limit == null) return "Idle";
    return `${lane.running}/${lane.limit} running · ${lane.waiting} waiting`;
}

export function schedulerQuestEntries(snapshot: OrionSchedulerSnapshot): Array<[string, OrionSchedulerQuestSnapshot]> {
    return Object.entries(snapshot.quests).sort(([leftId, left], [rightId, right]) => {
        if (left.lane !== right.lane) return left.lane === "game" ? -1 : 1;
        if (left.state !== right.state) return left.state === "running" ? -1 : 1;
        return leftId.localeCompare(rightId);
    });
}
