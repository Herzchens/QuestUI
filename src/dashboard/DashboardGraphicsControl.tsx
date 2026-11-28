import { Popout, React, useRef, useState } from "@webpack/common";

import settings from "../plugin/settings";
import { commitGraphicsDetent } from "../graphics/controller";
import { useSystemReducedMotion } from "../graphics/runtime";
import { useDashboardThemeClassName } from "../themes/runtime";
import {
    GRAPHICS_PRESETS, graphicsKeyboardDetent, graphicsPointerIndex,
    readGraphicsPreference, toggleGraphicsLight,
    toggleGraphicsMotion, writeGraphicsPreference, type GraphicsPreference
} from "./graphicsLogic";

function GraphicsIcon() {
    const gradientId = "quest-ui-gauge-" + React.useId();
    const paint = "url(#" + gradientId + ")";
    // A filled, tapered needle has a rounded base and a pointed tip.
    // Keep the original rotation pivot and clearance from the arc.
    return <svg className="quest-ui-graphics-gauge" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="2" y1="12" x2="22" y2="12">
                <stop offset="0" className="quest-ui-graphics-gradient-end" />
                <stop offset=".5" className="quest-ui-graphics-gradient-start" />
                <stop offset="1" className="quest-ui-graphics-gradient-end" />
            </linearGradient>
        </defs>
        <path d="M3.34 19a10 10 0 1 1 17.32 0" stroke={paint} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path className="quest-ui-graphics-needle" d="M12 7L14.1 13.3Q14.8 16 12 16Q9.2 16 9.9 13.3Z" fill={paint} stroke="none" />
    </svg>;
}

function LockIcon() {
    return <svg className="quest-ui-graphics-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4" /><circle cx="12" cy="15.5" r="1" /></svg>;
}

function LightningIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.5 2.5-10 11H10l-.5 8 11-12H13z" /></svg>;
}

function MotionIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h7M2 10h5M3 15h4M11 4a8.5 8.5 0 1 1-4 13M12 9v6M16 9v6" /></svg>;
}

function save(value: GraphicsPreference): void {
    const next = writeGraphicsPreference(value);
    if (settings.store.dashboardGraphicsPreference !== next) settings.store.dashboardGraphicsPreference = next;
}

function GraphicsMenu({ draft, setDraft }: { draft: number | null; setDraft: (value: number | null) => void; }) {
    const { dashboardGraphicsPreference } = settings.use(["dashboardGraphicsPreference"]);
    const value = readGraphicsPreference(dashboardGraphicsPreference);
    const [dragging, setDragging] = useState(false);
    const pointer = useRef<number | null>(null);
    const latest = useRef<number | null>(null);
    const systemReduced = useSystemReducedMotion();
    const themeClass = useDashboardThemeClassName("quest-ui-graphics-menu", "quest-ui-dashboard-menu-surface");
    const idx = draft ?? value.quality;
    const preview = idx === 4;
    const preset = GRAPHICS_PRESETS[idx];
    const light = value.light && draft === null;
    function apply(index: number | null) {
        const current = readGraphicsPreference(settings.store.dashboardGraphicsPreference);
        save(commitGraphicsDetent(current, index));
        setDraft(index === 4 ? 4 : null);
    }

    function pick(element: HTMLDivElement, clientX: number) {
        const rect = element.getBoundingClientRect();
        const next = graphicsPointerIndex(clientX - rect.left, rect.width);
        if (next < 0 || latest.current === next) return;
        latest.current = next;
        setDraft(next);
    }

    function finish() {
        const index = latest.current;
        latest.current = null;
        pointer.current = null;
        setDragging(false);
        return index;
    }

    function cancel() {
        finish();
        setDraft(null);
    }

    return (
        <div className={themeClass + (value.reduceMotion || systemReduced ? " is-reduced" : "") + (light ? " is-light" : "")}
            data-graphics-index={light ? "light" : idx}
            style={{ "--graphics-index": idx } as React.CSSProperties}
            role="group" aria-label="Graphics quality selector">
            <div className="quest-ui-graphics-heading">
                <button type="button" className="quest-ui-graphics-icon-button is-bolt" aria-label="Light mode" aria-pressed={light}
                    title="Light - Low + Reduce Motion" onClick={() => { cancel(); save(toggleGraphicsLight(readGraphicsPreference(settings.store.dashboardGraphicsPreference))); }}>
                    <LightningIcon />
                </button>
                <div className="quest-ui-graphics-label" aria-live="polite">
                    <strong><span className="quest-ui-graphics-title-text">{light ? "Light" : preset.name}</span>{preview && <LockIcon />}</strong>
                    <span>{light ? "Minimum Graphics" : preset.subtitle}</span>
                    {(value.reduceMotion || systemReduced) && !light && !preview && <span>Reduced Motion</span>}
                </div>
                <button type="button" className="quest-ui-graphics-icon-button is-motion" aria-label="Reduce Motion" aria-pressed={value.reduceMotion}
                    title={systemReduced ? "Reduce Motion (system preference is active)" : "Reduce Motion"} onClick={() => { if (pointer.current !== null) cancel(); save(toggleGraphicsMotion(readGraphicsPreference(settings.store.dashboardGraphicsPreference))); }}>
                    <MotionIcon />
                </button>
            </div>
            <div className={"quest-ui-graphics-slider" + (dragging ? " is-dragging" : "")} role="slider" tabIndex={0}
                aria-label="Graphics Quality (Ultra coming soon)" aria-valuemin={0} aria-valuemax={4} aria-valuenow={idx}
                aria-valuetext={light ? "Light" : preset.name + (preview ? " (locked)" : "")}
                onPointerDown={event => {
                    if (event.button !== 0 || pointer.current !== null) return;
                    event.currentTarget.focus();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    pointer.current = event.pointerId;
                    setDragging(true);
                    pick(event.currentTarget, event.clientX);
                }}
                onPointerMove={event => { if (pointer.current === event.pointerId) pick(event.currentTarget, event.clientX); }}
                onPointerUp={event => { if (pointer.current === event.pointerId) { pick(event.currentTarget, event.clientX); apply(finish()); } }}
                onPointerCancel={event => { if (pointer.current === event.pointerId) cancel(); }}
                onLostPointerCapture={event => { if (pointer.current === event.pointerId) cancel(); }}
                onKeyDown={event => {
                    const next = graphicsKeyboardDetent(idx, event.key);
                    if (next === null) return;
                    event.preventDefault();
                    finish();
                    apply(next);
                }}>
                <span className="quest-ui-graphics-track" aria-hidden="true"><span className="quest-ui-graphics-fill" /></span>
                <span className="quest-ui-graphics-dots" aria-hidden="true">{GRAPHICS_PRESETS.map(p => <i key={p.name} />)}</span>
                <span className="quest-ui-graphics-thumb" aria-hidden="true" />
            </div>
        </div>
    );
}

export function DashboardGraphicsControl() {
    const { dashboardGraphicsPreference } = settings.use(["dashboardGraphicsPreference"]);
    const value = readGraphicsPreference(dashboardGraphicsPreference);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<number | null>(null);
    const systemReduced = useSystemReducedMotion();
    const displayIndex = open && draft !== null ? draft : value.light ? "light" : value.quality;
    const title = "Graphics Quality: " + (displayIndex === "light" ? "Light" : GRAPHICS_PRESETS[displayIndex].name + (displayIndex === 4 ? " (locked preview)" : ""));
    function close() {
        setDraft(null);
        setOpen(false);
    }
    return (
        <Popout position="bottom" align="right" animation={Popout.Animation.NONE} shouldShow={open}
            onRequestClose={close} targetElementRef={buttonRef} renderPopout={() => <GraphicsMenu draft={draft} setDraft={setDraft} />}>
            {(_, { isShown }) => <button ref={buttonRef} type="button" className={"quest-ui-dashboard-palette-button quest-ui-graphics-trigger" + (isShown ? " is-open" : "")}
                data-graphics-index={displayIndex} data-graphics-reduced={value.reduceMotion || systemReduced}
                title={title} aria-label={title} aria-expanded={isShown} onClick={() => { if (open) close(); else setOpen(true); }}>
                <GraphicsIcon />
            </button>}
        </Popout>
    );
}
