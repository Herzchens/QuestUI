import { useEffect, useMemo, useState } from "@webpack/common";
import type { ReactNode, RefObject } from "react";

import { buildEventLogVirtualLayout, eventLogVirtualRange } from "./eventLogVirtualizationLogic";

const EVENT_LOG_OVERSCAN_PX = 180;
const FALLBACK_VIEWPORT_HEIGHT = 410;

interface EventLogWindowedScrollerProps {
    className?: string;
    containerRef: RefObject<HTMLDivElement | null>;
    rowCount: number;
    rowHeight: number | ((row: number) => number);
    renderRow: (row: number) => ReactNode;
    footerHeight?: number | (() => number);
    renderFooter?: () => ReactNode;
    onScroll?: () => void;
}

/**
 * Event-Log-owned virtualization with no Discord ListScroller dependency.
 *
 * Keep this as a normal function component: Vencord's `React` common export is
 * assigned only after Discord's React webpack module is discovered. Creating a
 * forwardRef at module evaluation time can therefore run before WebpackReady and
 * break reporter/startup. The parent owns the raw DOM ref instead.
 */
export function EventLogWindowedScroller(props: EventLogWindowedScrollerProps) {
    const {
        className,
        containerRef,
        rowCount,
        rowHeight,
        renderRow,
        footerHeight = 0,
        renderFooter,
        onScroll
    } = props;
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(FALLBACK_VIEWPORT_HEIGHT);

    const safeRowCount = Math.max(0, Math.floor(Number(rowCount) || 0));
    const layout = useMemo(() => buildEventLogVirtualLayout(safeRowCount, index =>
        typeof rowHeight === "function" ? rowHeight(index) : rowHeight
    ), [safeRowCount, rowHeight]);

    const resolvedFooterHeight = Math.max(0, Number(typeof footerHeight === "function" ? footerHeight() : footerHeight) || 0);
    const range = eventLogVirtualRange(layout, scrollTop, viewportHeight, EVENT_LOG_OVERSCAN_PX);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;

        const measure = () => setViewportHeight(Math.max(1, element.clientHeight || FALLBACK_VIEWPORT_HEIGHT));
        measure();
        if (typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [containerRef]);

    const renderedRows: ReactNode[] = [];
    for (let row = range.start; row < range.end; row++) {
        const metric = layout.metrics[row];
        if (!metric) continue;
        renderedRows.push(
            <div
                key={row}
                className="quest-ui-event-virtual-item"
                style={{ top: metric.top, height: metric.height }}
            >
                {renderRow(row)}
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={`${className ?? ""} quest-ui-event-list quest-ui-event-windowed-scroller`.trim()}
            onScroll={() => {
                const element = containerRef.current;
                if (!element) return;
                setScrollTop(element.scrollTop);
                onScroll?.();
            }}
        >
            <div className="quest-ui-event-virtual-spacer" style={{ height: layout.totalHeight + resolvedFooterHeight }}>
                {renderedRows}
                {resolvedFooterHeight > 0 && renderFooter && (
                    <div className="quest-ui-event-virtual-footer" style={{ top: layout.totalHeight, height: resolvedFooterHeight }}>
                        {renderFooter()}
                    </div>
                )}
            </div>
        </div>
    );
}
