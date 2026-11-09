export interface EventLogVirtualMetric {
    top: number;
    height: number;
}

export interface EventLogVirtualLayout {
    metrics: EventLogVirtualMetric[];
    totalHeight: number;
}

export interface EventLogVirtualRange {
    start: number;
    end: number;
}

export function buildEventLogVirtualLayout(
    rowCount: number,
    rowHeight: (index: number) => number
): EventLogVirtualLayout {
    const count = Math.max(0, Math.floor(Number(rowCount) || 0));
    const metrics: EventLogVirtualMetric[] = [];
    let top = 0;

    for (let index = 0; index < count; index++) {
        const measured = Number(rowHeight(index));
        const height = Number.isFinite(measured) && measured > 0 ? measured : 1;
        metrics.push({ top, height });
        top += height;
    }

    return { metrics, totalHeight: top };
}

export function eventLogVirtualRange(
    layout: EventLogVirtualLayout,
    scrollTop: number,
    viewportHeight: number,
    overscan = 160
): EventLogVirtualRange {
    const { metrics } = layout;
    if (metrics.length === 0) return { start: 0, end: 0 };

    const safeTop = Math.max(0, Number(scrollTop) || 0);
    const safeHeight = Math.max(1, Number(viewportHeight) || 1);
    const safeOverscan = Math.max(0, Number(overscan) || 0);
    const lower = Math.max(0, safeTop - safeOverscan);
    const upper = safeTop + safeHeight + safeOverscan;

    let low = 0;
    let high = metrics.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        const metric = metrics[mid];
        if (metric.top + metric.height <= lower) low = mid + 1;
        else high = mid;
    }
    const start = low;

    low = start;
    high = metrics.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if (metrics[mid].top < upper) low = mid + 1;
        else high = mid;
    }

    return { start, end: Math.max(start, low) };
}
