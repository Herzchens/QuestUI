import { Popout, showToast, useRef, useState } from "@webpack/common";

import settings from "../plugin/settings";
import { DASHBOARD_THEMES, DASHBOARD_THEME_OPTIONS } from "../themes/registry";
import { selectDashboardTheme, useDashboardThemeId } from "../themes/runtime";
import { DashboardChoiceMenu } from "./DashboardChoiceMenu";

// Phosphor Icons Palette Bold (MIT; see THIRD_PARTY_NOTICES.md).
function PaletteIcon() {
    return (
        <svg className="quest-ui-dashboard-palette-icon" viewBox="0 0 256 256" aria-hidden="true">
            <path d="M203.57,51A107.9,107.9,0,0,0,20,128c0,44.72,27.6,82.25,72,97.94A36,36,0,0,0,140,192a12,12,0,0,1,12-12h46.21a35.79,35.79,0,0,0,35.1-28A108.6,108.6,0,0,0,236,127.09,107.23,107.23,0,0,0,203.57,51Zm6.34,95.67a11.91,11.91,0,0,1-11.7,9.3H152a36,36,0,0,0-36,36,12,12,0,0,1-16,11.3c-16.65-5.88-30.65-15.76-40.48-28.56A76,76,0,0,1,44,128a84,84,0,0,1,83.13-84H128a84.35,84.35,0,0,1,84,83.29A84.72,84.72,0,0,1,209.91,146.71ZM144,76a16,16,0,1,1-16-16A16,16,0,0,1,144,76Zm-44,24A16,16,0,1,1,84,84,16,16,0,0,1,100,100Zm0,56a16,16,0,1,1-16-16A16,16,0,0,1,100,156Zm88-56a16,16,0,1,1-16-16A16,16,0,0,1,188,100Z" />
        </svg>
    );
}

export function DashboardThemeControl() {
    const activeId = useDashboardThemeId();
    const activeLabel = DASHBOARD_THEMES.find(theme => theme.id === activeId)?.label ?? "Default";
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);

    const select = (id: string) => {
        try {
            const applied = selectDashboardTheme(id);
            settings.store.dashboardTheme = applied;
        } catch {
            showToast({ text: "Could not change Dashboard theme.", variant: "critical" });
        } finally {
            setOpen(false);
        }
    };

    return (
        <Popout
            position="bottom"
            align="right"
            animation={Popout.Animation.NONE}
            shouldShow={open}
            onRequestClose={() => setOpen(false)}
            targetElementRef={buttonRef}
            renderPopout={() => (
                <DashboardChoiceMenu
                    title="Dashboard theme"
                    ariaLabel="Choose Dashboard theme"
                    options={DASHBOARD_THEME_OPTIONS}
                    selectedValue={activeId}
                    onSelect={select}
                />
            )}
        >
            {(_, { isShown }) => (
                <button
                    ref={buttonRef}
                    type="button"
                    className={`quest-ui-dashboard-palette-button${isShown ? " is-open" : ""}`}
                    aria-label={`Dashboard theme: ${activeLabel}`}
                    aria-haspopup="menu"
                    aria-expanded={isShown}
                    title={`Dashboard theme: ${activeLabel}`}
                    onClick={() => setOpen(value => !value)}
                >
                    <PaletteIcon />
                </button>
            )}
        </Popout>
    );
}
