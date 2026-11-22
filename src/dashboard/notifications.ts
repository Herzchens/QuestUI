export type DashboardNoticeTone = "info" | "success" | "warning" | "error";

export interface DashboardNotice {
    id: number;
    tone: DashboardNoticeTone;
    text: string;
}

const listeners = new Set<() => void>();
let currentNotice: DashboardNotice | null = null;
let noticeId = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
    for (const listener of listeners) listener();
}

export function getDashboardNotice(): DashboardNotice | null {
    return currentNotice;
}

export function subscribeDashboardNotice(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function pushDashboardNotice({
    tone = "info",
    text,
    duration = 2600
}: {
    tone?: DashboardNoticeTone;
    text: string;
    duration?: number;
}): void {
    if (clearTimer != null) clearTimeout(clearTimer);

    currentNotice = {
        id: ++noticeId,
        tone,
        text: text.trim().slice(0, 160)
    };
    notify();

    if (duration <= 0) return;
    clearTimer = setTimeout(() => {
        clearTimer = null;
        currentNotice = null;
        notify();
    }, duration);
}
