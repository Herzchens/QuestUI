import { captureAccountSession, isCurrentAccountSession } from "../plugin/accountSession";
import settings from "../plugin/settings";
import { ignoredQuestIds, isIgnoredQuestStateReady, subscribeIgnoredQuests } from "../quests/ignored/runtime";
import { getOrionControlSnapshot, invokeOrionQuestTaskControl, isOrionCommandReady, subscribeOrionControlState, syncOrionExclusions } from "./integration";
import { ignoredActiveQuestIds } from "./ignorePolicy";

let generation = 0;
let started = false;
let busy = false;
let scheduled = false;
let timer: ReturnType<typeof setInterval> | undefined;
let release: (() => void) | undefined;
const attempts = new Map<string, number>();

function schedule(): void {
    if (!started || scheduled || busy) return;
    scheduled = true;
    const epoch = generation;
    queueMicrotask(() => {
        if (epoch !== generation) return;
        scheduled = false;
        void reconcile(epoch).catch(error => console.warn("[QuestUI] Ignore reconciliation failed", error));
    });
}
async function reconcile(epoch: number): Promise<void> {
    if (!started || epoch !== generation || busy || !settings.store.orionIntegration || !isIgnoredQuestStateReady()) return;
    const session = captureAccountSession();
    if (!session || !isOrionCommandReady()) return;
    busy = true;
    try {
        if (syncOrionExclusions()) { attempts.clear(); return; }
        const ids = ignoredQuestIds(session.accountId);
        if (!ids.size) { attempts.clear(); return; }
        const active = ignoredActiveQuestIds(getOrionControlSnapshot(), ids);
        const keys = new Set(active.map(id => session.accountId + ":" + id));
        for (const key of attempts.keys()) if (!keys.has(key)) attempts.delete(key);
        for (const id of active) {
            if (!started || epoch !== generation || !settings.store.orionIntegration || !isCurrentAccountSession(session)) break;
            if (!ignoredQuestIds(session.accountId).has(id) || !ignoredActiveQuestIds(getOrionControlSnapshot(), new Set([id])).length) continue;
            const key = session.accountId + ":" + id;
            const now = Date.now();
            if (now - (attempts.get(key) ?? -Infinity) < 1000) continue;
            attempts.set(key, now);
            try { await invokeOrionQuestTaskControl(id, "pause"); } catch { }
        }
    } finally { busy = false; }
}
export function startOrionIgnoreEnforcement(): void {
    if (started) return;
    started = true;
    generation++;
    const a = subscribeIgnoredQuests(schedule);
    const b = subscribeOrionControlState(schedule);
    release = () => { a(); b(); };
    timer = setInterval(schedule, 1000);
    schedule();
}
export function stopOrionIgnoreEnforcement(): void {
    started = false;
    generation++;
    scheduled = false;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    release?.();
    release = undefined;
    attempts.clear();
}
