import type { EventLogSort } from "./types";

export const EVENT_LOG_SORT_OPTIONS: ReadonlyArray<{ value: EventLogSort; label: string; }> = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "severity", label: "Errors first" }
];

export function SortChevronIcon() {
    return (
        <svg className="quest-ui-event-sort-chevron" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
        </svg>
    );
}

export function EventLogSortMenu({ mode, onChange }: { mode: EventLogSort; onChange: (mode: EventLogSort) => void; }) {
    return (
        <div className="quest-ui-event-sort-menu" role="menu" aria-label="Sort Event Log">
            <div className="quest-ui-event-sort-menu-heading">
                <strong>Sort events</strong>
                <span>Order the current log view</span>
            </div>
            <div className="quest-ui-event-sort-options">
                {EVENT_LOG_SORT_OPTIONS.map(option => (
                    <button key={option.value} type="button" className={option.value === mode ? "is-selected" : ""} role="menuitemradio" aria-checked={option.value === mode} onClick={() => onChange(option.value)}>
                        <span>{option.label}</span>
                        {option.value === mode && <span className="quest-ui-event-sort-check" aria-hidden="true">✓</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}

export type ChoiceTone = "neutral" | "orion" | "questui" | "error" | "warning" | "success" | "info" | "quest" | "runtime" | "network" | "diagnostic";

export function Choice<T extends string>({ value, active, tone = "neutral", children, onClick }: { value: T; active: boolean; tone?: ChoiceTone; children: any; onClick: (value: T) => void; }) {
    return <button type="button" className={`quest-ui-event-choice tone-${tone}${active ? " is-selected" : ""}`} aria-pressed={active} onClick={() => onClick(value)}>{children}</button>;
}

