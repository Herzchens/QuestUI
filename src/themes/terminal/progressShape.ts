/** Terminal uses a 2-unit pixel grid in the existing 56-unit progress viewBox.
 * Track, active arc and completed states share geometry but retain their semantic classes.
 */
const ringCells = Array.from({ length: 28 * 28 }, (_, i) => {
    const x = i % 28 * 2;
    const y = Math.floor(i / 28) * 2;
    const dx = x + 1 - 28;
    const dy = y + 1 - 28;
    const radius = Math.hypot(dx, dy);
    if (radius < 18.5 || radius > 23.5) return null;
    const angle = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
    return { angle, path: `M${x} ${y}h2v2h-2z` };
}).filter(cell => cell !== null);

export function terminalProgressPixels(percent: number): string {
    if (!Number.isFinite(percent) || percent <= 0) return "";
    const ratio = Math.min(100, percent) / 100;
    return ringCells.filter(cell => cell.angle < ratio).map(cell => cell.path).join("");
}

export const TERMINAL_PROGRESS_OUTLINE = terminalProgressPixels(100);

export const TERMINAL_CLAIMED_GLYPH = "M18 4h4v2h-4zM16 6h6v2h-6zM14 8h6v2h-6zM12 10h6v2h-6zM2 10h4v2h-4zM2 12h6v2h-6zM10 12h6v2h-6zM4 14h10v2h-10zM6 16h6v2h-6zM8 18h2v2h-2z";
export const TERMINAL_EXPIRED_GLYPH = "M4 4h4v4h-4zM16 4h4v4h-4zM6 6h4v4h-4zM14 6h4v4h-4zM8 8h4v4h-4zM12 8h4v4h-4zM10 10h4v4h-4zM8 12h4v4h-4zM12 12h4v4h-4zM6 14h4v4h-4zM14 14h4v4h-4zM4 16h4v4h-4zM16 16h4v4h-4z";
