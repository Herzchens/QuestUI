# QuestUI Theme SDK (API v1)

The v1 SDK is for **trusted, locally installed Vencord userplugins**. It accepts CSS-only theme packages. It does not download themes, execute theme scripts, expose Discord/Orion state or accept existing Vencord managed-style names. Built-in themes retain their complete independent CSS.

## Register a theme

Use the QuestUI plugin object's `themeSDK` member. Check `apiVersion === 1` before calling. A Vencord companion should declare QuestUI as a dependency and dispose its registration on stop.

```ts
import { plugins } from "@api/PluginManager";

let unregister: (() => void) | undefined;

export function start() {
    const sdk = (plugins.QuestUI as unknown as {
        themeSDK?: {
            apiVersion: number;
            register(theme: { apiVersion: 1; id: string; label: string; css: string }): () => void;
        };
    }).themeSDK;
    if (sdk?.apiVersion !== 1) throw new Error("QuestUI Theme SDK v1 required.");
    unregister = sdk.register({
        apiVersion: 1,
        id: "custom-example",
        label: "Example",
        css: `:scope { color: #eee; }
.quest-ui-dashboard-shell { background: #181820; }`
    });
}

export function stop() {
    unregister?.();
    unregister = undefined;
}
```

This is a minimal registration example, not a complete usable dashboard theme. A full theme must supply its complete Dashboard styling, including popouts and related surfaces. The browser wraps the CSS in a scope rooted at the theme-specific QuestUI class. Use `:scope` to target that root itself.

The palette lists registered themes; the user chooses one. The saved theme ID can be restored on a later registration. Removing an active theme falls back to Default; the saved preference is retained until the user selects another theme. The returned disposer is idempotent and ownership-specific. If cleanup fails, retry the disposer; do not discard it on error.

`getThemes()` returns a readonly snapshot of ID/label pairs; `getActiveTheme()` returns the current Dashboard theme ID (Default when inactive). No public selection or renderer callback API is exposed.

## Constraints

- IDs: `custom-` followed by lowercase alphanumeric dash-separated segments; maximum 64 characters.
- Label: nonempty, maximum 80 characters.
- CSS: nonempty, maximum 262144 UTF-16 code units; maximum 64 registered themes.
- CSS must parse into a single supported scoped rule. Browsers without CSS scope support reject registration.
- This is **not a security sandbox**: CSS can hide or imitate controls and use network URLs, and installed Vencord userplugins already execute trusted code. Only install reviewed themes/plugins. Authors must not use external requests, global selectors, deceptive UI or override functional accessibility.
- Public API v1 does not support custom JS renderers, Ultra effects, Quest Home or BetterDiscord. The internal renderer is separate and not an SDK stability promise.
