# QuestUI

QuestUI is a standalone Vencord userplugin that adds quick access to Discord Quests and a compact overview of their current status.

It does **not** complete, enroll in, claim, or modify quests. QuestUI only adds interface elements and reads quest status information already available in the Discord client. It can be used on its own or alongside [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) and other quest-related plugins.

QuestUI is designed to coexist with [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) and other quest-related plugins because it does not modify quest progress or completion logic. Compatibility cannot be guaranteed when another plugin patches the same Discord interface components.

## Features

- Optional Quests shortcut in Discord's top bar.
- Optional Quests shortcut beside the mute, deafen, and settings controls.
- A status dot for quests that need attention.
- Optional color-coded counters for available, active, claimable, and claimed quests.
- Direct navigation to Discord's Quest Home page.

## Installation

### UserpluginInstaller

Install QuestUI through UserpluginInstaller using the repository URL:

```
https://github.com/Herzchens/QuestUI
```

### Manual Vencord source installation

Clone QuestUI into your Vencord userplugins directory:

```bash
cd Vencord/src/userplugins
git clone https://github.com/Herzchens/QuestUI.git
cd ../..
pnpm build
pnpm inject
```

To update QuestUI:

```bash
git -C Vencord/src/userplugins/QuestUI pull
cd Vencord
pnpm build
pnpm inject
```

Restart Discord, open Vencord settings, and enable **QuestUI**.

The colored counter patch is disabled by default because Discord UI matchers may change between client builds. First confirm that the top-bar button works correctly, then enable **Show colored quest counters** and restart Discord.

### Using QuestUI with OrionQuests

QuestUI and [OrionQuests](https://github.com/nyxxbit/discord-quest-completer) have been tested together successfully on current Vencord and Discord builds. Both projects depend on Discord internals, so future Discord updates may require compatibility fixes.

**Orion prebuilt bundle** is a pre-compiled distribution. QuestUI cannot be installed by copying source files into a prebuilt bundle. Users who want QuestUI alongside OrionQuests should use the Orion devbuild installer or a Vencord source build.

**Orion devbuild installer** — The Orion devbuild checkout is located at `%LOCALAPPDATA%\OrionVencord`. To install QuestUI:

Command Prompt:

```cmd
git clone https://github.com/Herzchens/QuestUI.git "%LOCALAPPDATA%\OrionVencord\src\userplugins\QuestUI"
```

PowerShell:

```powershell
git clone https://github.com/Herzchens/QuestUI.git "$env:LOCALAPPDATA\OrionVencord\src\userplugins\QuestUI"
```

Then run `UPDATE.cmd` to rebuild.

To update QuestUI:

Command Prompt:

```cmd
git -C "%LOCALAPPDATA%\OrionVencord\src\userplugins\QuestUI" pull
```

PowerShell:

```powershell
git -C "$env:LOCALAPPDATA\OrionVencord\src\userplugins\QuestUI" pull
```

Then run `UPDATE.cmd` again. The Orion updater does not remove sibling folders like QuestUI, but it also does not run `git pull` for QuestUI automatically. QuestUI and OrionQuests are updated independently. There is no combined bundle.

### Compatibility matrix

| Installation method | QuestUI support | Method |
|---|---|---|
| UserpluginInstaller | Yes | Install using the repository URL |
| Vencord source/dev build | Yes | Clone into `src/userplugins` |
| Orion devbuild installer | Yes | Clone into OrionVencord and run `UPDATE.cmd` |
| Orion prebuilt bundle | Not directly | Move to the devbuild installer |

## Settings

- **Show Quests button in top bar** — Adds a shortcut to Discord's top bar and displays a status dot.
- **Show Quests button in settings bar** — Adds a shortcut beside the mute, deafen, and settings controls.
- **Show colored quest counters** — Adds numeric counters to Quest Home links.

Settings that change patches require a Discord restart.

## Status colors

### Counters

- **Red** — Available quests that can be enrolled in.
- **Yellow** — Enrolled quests that are still in progress.
- **Green** — Completed quests with rewards ready to claim.
- **Blurple** — Claimed quests.

### Status dot

The shortcut displays one status dot using this priority:

1. **Red** when at least one available quest has not been enrolled in.
2. **Yellow** when no available quest remains, but at least one enrolled quest is unfinished.
3. **Green** when no quest is available or unfinished, but at least one reward is ready to claim.
4. **No dot** when nothing currently needs attention.

Clicking either shortcut opens `/quest-home` through Vencord's `NavigationRouter`.

## Compatibility and recovery

QuestUI relies on Discord UI components and Vencord patches, so a Discord update may occasionally break a matcher.

If Discord fails to start correctly after an update, close Discord, move the `QuestUI` folder out of `Vencord/src/userplugins`, then rebuild and inject Vencord again. When reporting a compatibility problem, include your Discord channel and Vencord version.

## Project history and credits

QuestUI is maintained by [Herzchens](https://github.com/Herzchens).

The plugin is a standalone extraction and refactor of the Quest interface originally included in [nicola02nb/completeDiscordQuest](https://github.com/nicola02nb/completeDiscordQuest). The quest-completion functionality was removed, while the interface was adapted into a separate plugin and received additional compatibility fixes, safer status handling, updated navigation, and other maintenance changes.

Credit goes to **nicola02nb** for the original Quest UI implementation and to the Vencord project and its contributors for the underlying plugin framework.

QuestUI is maintained independently and is not affiliated with or endorsed by `completeDiscordQuest`, [OrionQuests](https://github.com/nyxxbit/discord-quest-completer), Discord, or Vencord.

## License

QuestUI is free software released under the **GNU General Public License v3.0 or later**. See [LICENSE](LICENSE) for the full license text.
