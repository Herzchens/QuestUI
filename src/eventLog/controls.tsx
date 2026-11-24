import type { EventLogCategory, EventLogSeverity, EventLogSort, EventLogSource } from "./types";

export const EVENT_LOG_SORT_OPTIONS: ReadonlyArray<{ value: EventLogSort; label: string; }> = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
    { value: "severity", label: "Errors first" }
];

export type ChoiceTone = "neutral" | "orion" | "questui" | "error" | "warning" | "success" | "info" | "quest" | "runtime" | "network" | "diagnostic";

export type EventLogFilterOption<T extends string> = {
    value: T;
    label: string;
    tone?: ChoiceTone;
};

export const EVENT_LOG_SOURCE_OPTIONS: ReadonlyArray<EventLogFilterOption<"all" | EventLogSource>> = [
    { value: "all", label: "All" },
    { value: "orion", label: "Orion", tone: "orion" },
    { value: "questui", label: "QuestUI", tone: "questui" }
];

export const EVENT_LOG_SEVERITY_OPTIONS: ReadonlyArray<EventLogFilterOption<"all" | EventLogSeverity>> = [
    { value: "all", label: "All" },
    { value: "error", label: "Error", tone: "error" },
    { value: "warning", label: "Warning", tone: "warning" },
    { value: "success", label: "Success", tone: "success" },
    { value: "info", label: "Info", tone: "info" }
];

export const EVENT_LOG_CATEGORY_OPTIONS: ReadonlyArray<EventLogFilterOption<"all" | EventLogCategory>> = [
    { value: "all", label: "All" },
    { value: "quest", label: "Quest", tone: "quest" },
    { value: "runtime", label: "Runtime", tone: "runtime" },
    { value: "network", label: "Network", tone: "network" },
    { value: "diagnostic", label: "Diagnostic", tone: "diagnostic" }
];

export function SortChevronIcon() {
    return (
        <svg className="quest-ui-event-sort-chevron" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
        </svg>
    );
}

export function SortIcon() {
    return (
        <svg className="quest-ui-event-control-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14M5 12h10M5 17h6" />
        </svg>
    );
}

export function SourceIcon() {
    return (
        <svg className="quest-ui-event-control-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 4 7 4-7 4-7-4 7-4Z" />
            <path d="m5 12 7 4 7-4M5 16l7 4 7-4" />
        </svg>
    );
}

export function LevelIcon() {
    return (
        <svg className="quest-ui-event-control-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12h4l2-4 4 8 2-4h6" />
        </svg>
    );
}

export function CategoryIcon() {
    return (
        <svg className="quest-ui-event-control-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="6" height="6" rx="1.2" />
            <rect x="14" y="4" width="6" height="6" rx="1.2" />
            <rect x="4" y="14" width="6" height="6" rx="1.2" />
            <rect x="14" y="14" width="6" height="6" rx="1.2" />
        </svg>
    );
}

export function FilterIcon() {
    return (
        <svg className="quest-ui-event-control-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
    );
}

export function FolderIcon() {
    return (
        <svg className="quest-ui-event-action-icon quest-ui-event-folder-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6A2 2 0 0 1 18.45 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2A2 2 0 0 0 12.07 6H18a2 2 0 0 1 2 2v2" />
        </svg>
    );
}

export function BroomIcon() {
    return (
        <svg className="quest-ui-event-action-icon quest-ui-event-broom-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.4 3.8a2.6 2.6 0 0 1 5.2 0v5h2.8a2.1 2.1 0 0 1 2.1 2.1V13h-15v-2.1a2.1 2.1 0 0 1 2.1-2.1h2.8v-5Z" />
            <path d="m6 13-1.6 7.4h15.2L18 13" />
            <path d="m9 20.4 1-4.3M15 20.4l-1-4.3" />
        </svg>
    );
}

export function CheckIcon() {
    return (
        <svg className="quest-ui-event-action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12.5 4.2 4.2L19 7" />
        </svg>
    );
}

export function CloseIcon() {
    return (
        <svg className="quest-ui-event-action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
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

export function filterOptionLabel<T extends string>(options: ReadonlyArray<EventLogFilterOption<T>>, value: T): string {
    return options.find(option => option.value === value)?.label ?? value;
}

export function filterOptionTone<T extends string>(options: ReadonlyArray<EventLogFilterOption<T>>, value: T): ChoiceTone {
    return options.find(option => option.value === value)?.tone ?? "neutral";
}

export function EventLogCombinedFilterMenu({
    source,
    severity,
    category,
    onSourceChange,
    onSeverityChange,
    onCategoryChange
}: {
    source: "all" | EventLogSource;
    severity: "all" | EventLogSeverity;
    category: "all" | EventLogCategory;
    onSourceChange: (value: "all" | EventLogSource) => void;
    onSeverityChange: (value: "all" | EventLogSeverity) => void;
    onCategoryChange: (value: "all" | EventLogCategory) => void;
}) {
    return (
        <div className="quest-ui-event-filter-menu quest-ui-event-combined-filter-menu" role="menu" aria-label="Filter Event Log">
            <div className="quest-ui-event-filter-menu-heading">
                <strong>Filter events</strong>
                <span>Source, level and category</span>
            </div>

            <section className="quest-ui-event-filter-section">
                <span>Source</span>
                <div className="quest-ui-event-filter-options">
                    {EVENT_LOG_SOURCE_OPTIONS.map(option => (
                        <Choice key={option.value} value={option.value} active={option.value === source} tone={option.tone} onClick={onSourceChange}>{option.label}</Choice>
                    ))}
                </div>
            </section>

            <section className="quest-ui-event-filter-section">
                <span>Level</span>
                <div className="quest-ui-event-filter-options">
                    {EVENT_LOG_SEVERITY_OPTIONS.map(option => (
                        <Choice key={option.value} value={option.value} active={option.value === severity} tone={option.tone} onClick={onSeverityChange}>{option.label}</Choice>
                    ))}
                </div>
            </section>

            <section className="quest-ui-event-filter-section">
                <span>Category</span>
                <div className="quest-ui-event-filter-options">
                    {EVENT_LOG_CATEGORY_OPTIONS.map(option => (
                        <Choice key={option.value} value={option.value} active={option.value === category} tone={option.tone} onClick={onCategoryChange}>{option.label}</Choice>
                    ))}
                </div>
            </section>
        </div>
    );
}

export function EventLogFilterMenu<T extends string>({ label, value, options, onChange }: {
    label: string;
    value: T;
    options: ReadonlyArray<EventLogFilterOption<T>>;
    onChange: (value: T) => void;
}) {
    return (
        <div className="quest-ui-event-filter-menu" role="menu" aria-label={`Filter Event Log by ${label}`}>
            <div className="quest-ui-event-filter-menu-heading">
                <strong>{label}</strong>
                <span>Filter the current log view</span>
            </div>
            <div className="quest-ui-event-filter-options">
                {options.map(option => (
                    <Choice key={option.value} value={option.value} active={option.value === value} tone={option.tone} onClick={onChange}>
                        <span>{option.label}</span>
                        {option.value === value && <span className="quest-ui-event-filter-check" aria-hidden="true">✓</span>}
                    </Choice>
                ))}
            </div>
        </div>
    );
}

export function Choice<T extends string>({ value, active, tone = "neutral", children, onClick }: { value: T; active: boolean; tone?: ChoiceTone; children: any; onClick: (value: T) => void; }) {
    return <button type="button" className={`quest-ui-event-choice tone-${tone}${active ? " is-selected" : ""}`} role="menuitemradio" aria-checked={active} onClick={() => onClick(value)}>{children}</button>;
}
