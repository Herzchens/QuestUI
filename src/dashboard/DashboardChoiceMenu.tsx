import { useDashboardThemeClassName } from "../themes/runtime";

export function DashboardChoiceMenu<T extends string>({ title, ariaLabel, options, selectedValue, onSelect }: {
    title: string;
    ariaLabel: string;
    options: readonly { value: T; label: string; }[];
    selectedValue: T;
    onSelect: (value: T) => void;
}) {
    const className = useDashboardThemeClassName("quest-ui-dashboard-choice-list");
    return (
        <div className={className} role="menu" aria-label={ariaLabel}>
            <span className="quest-ui-dashboard-choice-list-title">{title}</span>
            {options.map(option => {
                const selected = option.value === selectedValue;
                return (
                    <button
                        key={option.value}
                        type="button"
                        className={selected ? "is-selected" : ""}
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => onSelect(option.value)}
                    >
                        <span>{option.label}</span>
                        <span className="quest-ui-dashboard-choice-list-radio" aria-hidden="true">
                            {selected && <span />}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
