import { createServiceLifecycle } from "../plugin/lifecycle";
import type { DashboardTheme } from "./controller";

type ThemeSelection = { select(preference: unknown): string; stop(): void; };

/** Session services keep their bounded caches across theme switches. Selection
 * owns styles separately; neither operation starts another session service. */
export function createThemePluginLifecycle(
    controller: ThemeSelection,
    themes: readonly DashboardTheme[],
    defaultId: string,
    onFallback: (error: unknown) => void
) {
    let preference: unknown;
    const lifecycle = createServiceLifecycle([
        {
            start() {
                try { controller.select(preference); }
                catch (error) {
                    controller.select(defaultId);
                    onFallback(error);
                }
            },
            stop: () => controller.stop()
        },
        ...themes.flatMap(theme => theme.services ?? [])
    ]);

    return {
        start(value: unknown) {
            if (lifecycle.isRunning()) return;
            preference = value;
            lifecycle.start();
        },
        stop: lifecycle.stop,
        select(value: unknown) {
            if (!lifecycle.isRunning()) throw new Error("Dashboard themes are not started.");
            return controller.select(value);
        }
    };
}
