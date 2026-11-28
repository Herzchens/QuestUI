import { readBetterDiscordQuests, readPreviewAccountId, type BetterDiscordReadHost, type PreviewSnapshot } from "./readHost";

const OFF: PreviewSnapshot = { kind: "unavailable", reason: "Enable QuestUI Preview to view Quests.", quests: [] };
const SWITCHED: PreviewSnapshot = { kind: "unavailable", reason: "Account changed. Open native Quest Home and press Refresh after it loads.", quests: [] };
const FAILED: PreviewSnapshot = { kind: "unavailable", reason: "BetterDiscord Quest API is unavailable.", quests: [] };
type UserStore = { addChangeListener?(listener: () => void): void; removeChangeListener?(listener: () => void): void; };
type Timer = { start(fn: () => void): unknown; stop(handle: unknown): void; };
const defaultTimer: Timer = {
    start: fn => setInterval(fn, 2000),
    stop: handle => clearInterval(handle as ReturnType<typeof setInterval>)
};

/** Bound to mounted settings panels only. An account switch invalidates the
 * catalogue and requires an explicit read after native Quest Home hydrates. */
export function createPreviewSession(getHost: () => BetterDiscordReadHost, timer: Timer = defaultTimer) {
    let running = false;
    let handle: unknown;
    let active = false;
    let generation = 0;
    let owner: string | null | undefined;
    let switched = false;
    let snapshot = OFF;
    let release: (() => void) | undefined;
    const listeners = new Set<() => void>();

    function publish(value: PreviewSnapshot) {
        snapshot = value;
        for (const listener of [...listeners]) {
            try { listener(); } catch { /* A view cannot prevent cleanup. */ }
        }
    }
    function read(manual = false) {
        if (!running || !active || !listeners.size) return;
        const epoch = generation;
        try {
            const host = getHost();
            const id = readPreviewAccountId(host);
            if (owner !== undefined && id !== owner) {
                owner = id;
                switched = true;
                publish(SWITCHED);
                return;
            }
            owner = id;
            if (switched && !manual) return;
            if (manual) switched = false;
            const next = readBetterDiscordQuests(host);
            if (!running || !active || epoch !== generation) return;
            if (readPreviewAccountId(host) !== owner) {
                switched = true;
                publish(SWITCHED);
                return;
            }
            publish(next);
        } catch {
            if (running && active && epoch === generation) publish(FAILED);
        }
    }
    function deactivate() {
        generation++;
        active = false;
        const errors: unknown[] = [];
        if (handle !== undefined) {
            try { timer.stop(handle); handle = undefined; } catch (error) { errors.push(error); }
        }
        if (release) {
            try { release(); release = undefined; } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, "BetterDiscord preview cleanup failed.");
    }
    function activate() {
        if (!running || active || !listeners.size) return;
        if (release || handle !== undefined) deactivate();
        active = true;
        const epoch = ++generation;
        try {
            const store = getHost().Webpack.getStore("UserStore") as UserStore | undefined;
            if (store?.addChangeListener && store.removeChangeListener) {
                const observe = () => { if (active && epoch === generation) read(); };
                release = () => store.removeChangeListener!(observe);
                store.addChangeListener(observe);
            }
            handle = timer.start(() => { if (active && epoch === generation) read(); });
            read();
        } catch (error) {
            try { deactivate(); } finally { publish(FAILED); }
            console.warn("[QuestUI] BetterDiscord preview activation failed.", error);
        }
    }
    return {
        start() {
            if (running) return;
            running = true;
            activate();
        },
        stop() {
            running = false;
            try { deactivate(); } finally { publish(OFF); }
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            activate();
            return () => {
                listeners.delete(listener);
                if (!listeners.size) {
                    try { deactivate(); } finally { snapshot = OFF; }
                }
            };
        },
        getSnapshot: () => snapshot,
        isRunning: () => running,
        refresh: () => read(true)
    };
}
