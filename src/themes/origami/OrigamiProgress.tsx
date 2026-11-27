import type { CSSProperties } from "react";

import { normalizeOrigamiProgress } from "./scene";

/** The same native percent reveals a reference-paper wreath continuously. */
export function OrigamiProgress({ progress }: { progress: number; }) {
    return (
        <div
            className="quest-ui-origami-ring-art"
            style={{ "--origami-ring-completion": `${normalizeOrigamiProgress(progress)}%` } as CSSProperties}
            aria-hidden="true"
        />
    );
}
